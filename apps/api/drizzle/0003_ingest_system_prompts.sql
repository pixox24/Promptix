CREATE TABLE "ingest_system_prompts" (
	"flow_type" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_system_prompts_flow_type_check" CHECK ("ingest_system_prompts"."flow_type" in ('text_expand', 'image_reverse')),
	CONSTRAINT "ingest_system_prompts_prompt_length_check" CHECK (char_length(btrim("ingest_system_prompts"."prompt")) between 1 and 20000)
);
--> statement-breakpoint
ALTER TABLE "ingest_system_prompts" ADD CONSTRAINT "ingest_system_prompts_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "ingest_system_prompts" ("flow_type", "prompt") VALUES
  ('text_expand', '你是 Promptix 提示词优化与模板结构化引擎。请扩写用户需求并生成可复用的中文 AI 绘图提示词模板。只输出满足给定 schema 的数据。字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate。category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。variables 为 1-12 项，key 使用英文标识符，type 仅可为 text/select/number/ratio/image。promptTemplate 必须包含全部变量的 {{key}} 占位符。'),
  ('image_reverse', '你是 Promptix 图片反推与模板结构化引擎。请忠实保留参考图中的视觉事实，并生成可复用的中文 AI 绘图提示词模板。只输出满足给定 schema 的数据。字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate。category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。variables 为 1-12 项，key 使用英文标识符，type 仅可为 text/select/number/ratio/image。promptTemplate 必须包含全部变量的 {{key}} 占位符。')
ON CONFLICT ("flow_type") DO NOTHING;
