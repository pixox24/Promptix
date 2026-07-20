import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import {
  modelCapabilitySchema,
  promptVariableSchema,
  publicGenerationCreateSchema,
  renderPromptTemplate,
  resolveTemplateAspectRatio,
  validatePromptValues,
  type PublicGenerationJob,
} from "@promptix/shared";
import { getDb } from "../db/client.js";
import {
  generationJobs,
  providerModels,
  providers,
  promptTemplates,
} from "../db/schema.js";
import { loadEnv } from "../config/env.js";
import { enqueueGenerationJob } from "../lib/job-enqueue.js";
import {
  clearTerminalQueueJobForRetry,
  QueueJobStillRunningError,
} from "../lib/job-retry.js";
import { getJobQueue } from "../lib/queue.js";
import { fail, ok } from "../lib/response.js";
import { supportsJobType } from "../lib/job-model-selection.js";

const secret = () => new TextEncoder().encode(loadEnv().JWT_SECRET);
const ownerKey = (c: Context) =>
  createHash("sha256")
    .update(
      `${c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local"}:${c.req.header("user-agent") || ""}:${loadEnv().JWT_SECRET}`,
    )
    .digest("hex");
async function token(jobId: string, owner: string) {
  return new SignJWT({ owner })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(jobId)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret());
}
async function authorize(c: Context, id: string) {
  const raw = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!raw) return false;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return payload.sub === id && payload.owner === ownerKey(c);
  } catch {
    return false;
  }
}
async function rateLimited(owner: string) {
  const redis = await getJobQueue().client;
  const key = `promptix:public-generation:${owner}:minute`;
  redis.defineCommand("promptixPublicGenerationRate", {
    numberOfKeys: 1,
    lua: "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
  });
  const count = Number(
    await redis.runCommand("promptixPublicGenerationRate", [key, 60]),
  );
  return count > 10;
}
async function imageModel() {
  const [row] = await getDb()
    .select({ model: providerModels, providerEnabled: providers.enabled })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(
      and(
        eq(providerModels.isDefaultImage, true),
        eq(providerModels.enabled, true),
        eq(providers.enabled, true),
      ),
    )
    .orderBy(asc(providerModels.createdAt))
    .limit(1);
  if (!row) throw new Error("DEFAULT_MODEL_NOT_CONFIGURED");
  const candidate = {
    ...row.model,
    capabilities: modelCapabilitySchema.array().parse(row.model.capabilities),
  };
  if (!supportsJobType(candidate, "image_generate"))
    throw new Error("DEFAULT_MODEL_NOT_CONFIGURED");
  return row.model;
}
function summary(
  row: typeof generationJobs.$inferSelect,
  accessToken?: string,
): PublicGenerationJob {
  const images =
    (
      row.output as {
        images?: Array<{
          url?: string;
          width?: number;
          height?: number;
          mime?: string;
          expiresAt?: string;
        }>;
      } | null
    )?.images?.filter(
      (
        image,
      ): image is {
        url: string;
        width?: number;
        height?: number;
        mime?: string;
        expiresAt?: string;
      } => Boolean(image.url),
    ) ?? [];
  return {
    id: row.id,
    status: row.status as PublicGenerationJob["status"],
    ...(accessToken ? { accessToken } : {}),
    ...(images.length ? { images } : {}),
    ...(row.status === "failed"
      ? {
          error: {
            code: "GENERATION_FAILED",
            message: "图片生成失败，请稍后重试",
            retryable: true,
          },
        }
      : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
    ...(row.finishedAt ? { finishedAt: row.finishedAt.toISOString() } : {}),
  };
}

export const generationRoutes = new Hono();
generationRoutes.post("/", async (c) => {
  const parsed = publicGenerationCreateSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    return fail(
      c,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
    );
  const owner = ownerKey(c);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.ownerKeyHash, owner),
        sql`${generationJobs.input} ->> 'clientRequestId' = ${parsed.data.clientRequestId}`,
      ),
    )
    .limit(1);
  if (existing)
    return ok(
      c,
      summary(existing, await token(existing.id, owner)),
      existing.status === "succeeded" ? 200 : 202,
    );
  try {
    if (await rateLimited(owner))
      return fail(c, "RATE_LIMITED", "请求过于频繁，请稍后再试", 429);
  } catch {
    return fail(c, "QUEUE_UNAVAILABLE", "生成队列暂时不可用", 503);
  }
  const running = await db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.ownerKeyHash, owner),
        inArray(generationJobs.status, ["pending", "queued", "running"]),
      ),
    )
    .limit(3);
  if (running.length >= 3)
    return fail(c, "TOO_MANY_ACTIVE_JOBS", "已有多个生成任务正在处理", 429);
  const [template] = await db
    .select()
    .from(promptTemplates)
    .where(
      and(
        eq(promptTemplates.id, parsed.data.templateId),
        eq(promptTemplates.status, "published"),
      ),
    )
    .limit(1);
  if (!template) return fail(c, "NOT_FOUND", "Template not found", 404);
  const templateVariables = promptVariableSchema.array().parse(template.variables);
  const issues = validatePromptValues(templateVariables, parsed.data.values);
  if (issues.length)
    return fail(
      c,
      "VALIDATION_ERROR",
      issues[0].code === "required"
        ? `${issues[0].label}为必填项`
        : `${issues[0].label}选项无效`,
      400,
    );
  let model;
  try {
    model = await imageModel();
  } catch {
    return fail(c, "GENERATION_UNAVAILABLE", "生图模型尚未配置", 503);
  }
  const ratio = resolveTemplateAspectRatio(
    templateVariables,
    parsed.data.values,
  )?.value;
  const prompt =
    parsed.data.promptOverride ??
    renderPromptTemplate(
      { variables: templateVariables, promptTemplate: template.promptTemplate },
      parsed.data.values,
    );
  const [row] = await db
    .insert(generationJobs)
    .values({
      type: "image_generate",
      status: "pending",
      actorType: "guest",
      ownerKeyHash: owner,
      templateId: template.id,
      modelId: model.id,
      providerId: model.providerId,
      input: {
        prompt,
        ...(ratio ? { aspectRatio: ratio } : {}),
        clientRequestId: parsed.data.clientRequestId,
        negativePrompt: template.negativePrompt,
      },
    })
    .returning();
  try {
    await enqueueGenerationJob(row.id);
  } catch {
    await db
      .update(generationJobs)
      .set({
        status: "failed",
        errorMessage: "Queue unavailable",
        finishedAt: new Date(),
      })
      .where(eq(generationJobs.id, row.id));
    return fail(c, "QUEUE_UNAVAILABLE", "生成队列暂时不可用", 503);
  }
  const [queued] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, row.id))
    .limit(1);
  return ok(c, summary(queued, await token(row.id, owner)), 202);
});
generationRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await authorize(c, id)))
    return fail(c, "NOT_FOUND", "Generation not found", 404);
  const [row] = await getDb()
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.id, id),
        eq(generationJobs.actorType, "guest"),
        eq(generationJobs.ownerKeyHash, ownerKey(c)),
      ),
    )
    .limit(1);
  return row
    ? ok(c, summary(row))
    : fail(c, "NOT_FOUND", "Generation not found", 404);
});
generationRoutes.post("/:id/retry", async (c) => {
  const id = c.req.param("id");
  if (!(await authorize(c, id)))
    return fail(c, "NOT_FOUND", "Generation not found", 404);
  const db = getDb();
  const [row] = await db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.id, id),
        eq(generationJobs.actorType, "guest"),
        eq(generationJobs.ownerKeyHash, ownerKey(c)),
      ),
    )
    .limit(1);
  if (!row) return fail(c, "NOT_FOUND", "Generation not found", 404);
  if (row.status !== "failed")
    return fail(c, "NOT_RETRYABLE", "当前任务不可重试", 409);
  try {
    await clearTerminalQueueJobForRetry(getJobQueue(), row.bullJobId ?? id);
  } catch (error) {
    if (error instanceof QueueJobStillRunningError)
      return fail(c, "QUEUE_JOB_STILL_RUNNING", "任务仍在运行", 409);
    return fail(c, "QUEUE_UNAVAILABLE", "生成队列暂时不可用", 503);
  }
  await db
    .update(generationJobs)
    .set({
      status: "pending",
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
    })
    .where(eq(generationJobs.id, id));
  try {
    await enqueueGenerationJob(id);
  } catch {
    return fail(c, "QUEUE_UNAVAILABLE", "生成队列暂时不可用", 503);
  }
  const [next] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, id))
    .limit(1);
  return ok(c, summary(next, await token(id, ownerKey(c))), 202);
});
