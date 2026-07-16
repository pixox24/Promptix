CREATE TABLE "provider_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	"model_id" text NOT NULL,
	"capabilities" text[] DEFAULT ARRAY['text']::text[] NOT NULL,
	"defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default_text" boolean DEFAULT false NOT NULL,
	"is_default_vision" boolean DEFAULT false NOT NULL,
	"is_default_image" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "model_id" uuid;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "adapter_type" text DEFAULT 'openai_compatible' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_models_provider_model_uidx" ON "provider_models" USING btree ("provider_id","model_id");--> statement-breakpoint
CREATE INDEX "provider_models_provider_enabled_idx" ON "provider_models" USING btree ("provider_id","enabled");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_model_id_provider_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."provider_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- backfill: map legacy protocol to adapter type
UPDATE "providers"
SET "adapter_type" = CASE "protocol"
  WHEN 'deepseek_chat' THEN 'deepseek'
  WHEN 'openai_images_async' THEN 'custom_65535_async'
  ELSE 'openai_compatible'
END;--> statement-breakpoint

-- backfill: create a model for every existing provider
INSERT INTO "provider_models" (
  "provider_id",
  "name",
  "model_id",
  "capabilities",
  "defaults",
  "enabled",
  "is_default_text",
  "is_default_vision",
  "is_default_image"
)
SELECT
  p."id",
  CASE WHEN p."default_model" = '' THEN p."name" ELSE p."default_model" END,
  CASE WHEN p."default_model" = '' THEN '__legacy_unconfigured__' ELSE p."default_model" END,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN p."kind" IN ('llm', 'both') THEN 'text' END,
    CASE WHEN p."kind" IN ('llm', 'both') THEN 'structured_output' END,
    CASE WHEN COALESCE(p."defaults"->>'supportsVision', 'false') = 'true' THEN 'vision' END,
    CASE WHEN p."kind" IN ('image', 'both') THEN 'image' END
  ], NULL)::text[],
  p."defaults" - 'supportsVision',
  p."enabled",
  false,
  false,
  false
FROM "providers" p
ON CONFLICT ("provider_id", "model_id") DO NOTHING;--> statement-breakpoint

-- backfill: associate existing jobs with their provider's model
UPDATE "generation_jobs" gj
SET "model_id" = pm."id"
FROM "provider_models" pm
WHERE gj."model_id" IS NULL
  AND gj."provider_id" = pm."provider_id";--> statement-breakpoint

-- select default text model
UPDATE "provider_models"
SET "is_default_text" = true
WHERE "id" = (
  SELECT pm."id"
  FROM "provider_models" pm
  JOIN "providers" p ON p."id" = pm."provider_id"
  WHERE pm."enabled" = true
    AND p."enabled" = true
    AND pm."capabilities" @> ARRAY['text', 'structured_output']::text[]
  ORDER BY p."is_default" DESC, p."updated_at" DESC, pm."created_at" ASC
  LIMIT 1
);--> statement-breakpoint

-- select default vision model
UPDATE "provider_models"
SET "is_default_vision" = true
WHERE "id" = (
  SELECT pm."id"
  FROM "provider_models" pm
  JOIN "providers" p ON p."id" = pm."provider_id"
  WHERE pm."enabled" = true
    AND p."enabled" = true
    AND pm."capabilities" @> ARRAY['vision']::text[]
  ORDER BY p."is_default" DESC, p."updated_at" DESC, pm."created_at" ASC
  LIMIT 1
);--> statement-breakpoint

-- select default image model
UPDATE "provider_models"
SET "is_default_image" = true
WHERE "id" = (
  SELECT pm."id"
  FROM "provider_models" pm
  JOIN "providers" p ON p."id" = pm."provider_id"
  WHERE pm."enabled" = true
    AND p."enabled" = true
    AND pm."capabilities" @> ARRAY['image']::text[]
  ORDER BY p."is_default" DESC, p."updated_at" DESC, pm."created_at" ASC
  LIMIT 1
);--> statement-breakpoint

-- partial unique indexes: create AFTER backfill to avoid conflicts
CREATE UNIQUE INDEX "provider_models_default_text_uidx" ON "provider_models" USING btree ("is_default_text") WHERE "provider_models"."is_default_text" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_models_default_vision_uidx" ON "provider_models" USING btree ("is_default_vision") WHERE "provider_models"."is_default_vision" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_models_default_image_uidx" ON "provider_models" USING btree ("is_default_image") WHERE "provider_models"."is_default_image" = true;
