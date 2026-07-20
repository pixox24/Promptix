CREATE TABLE "taxonomy_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dimension" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_terms_dimension_check" CHECK ("taxonomy_terms"."dimension" in ('output_type','scenario','style','subject'))
);
--> statement-breakpoint
CREATE TABLE "template_taxonomy_assignments" (
	"template_id" text NOT NULL,
	"term_id" uuid NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_taxonomy_assignments_source_check" CHECK ("template_taxonomy_assignments"."source" in ('ai','admin','migration')),
	CONSTRAINT "template_taxonomy_assignments_confidence_check" CHECK ("template_taxonomy_assignments"."confidence" is null or ("template_taxonomy_assignments"."confidence" >= 0 and "template_taxonomy_assignments"."confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "workflow_type" text DEFAULT 'generate' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "output_type_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "taxonomy_review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "unmapped_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "classification_meta" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "taxonomy_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "taxonomy_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_taxonomy_assignments" ADD CONSTRAINT "template_taxonomy_assignments_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_taxonomy_assignments" ADD CONSTRAINT "template_taxonomy_assignments_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_terms_dimension_slug_uidx" ON "taxonomy_terms" USING btree ("dimension","slug");--> statement-breakpoint
CREATE INDEX "taxonomy_terms_dimension_enabled_sort_idx" ON "taxonomy_terms" USING btree ("dimension","enabled","sort_order","label");--> statement-breakpoint
CREATE INDEX "taxonomy_terms_aliases_gin_idx" ON "taxonomy_terms" USING gin ("aliases");--> statement-breakpoint
CREATE UNIQUE INDEX "template_taxonomy_assignments_template_term_uidx" ON "template_taxonomy_assignments" USING btree ("template_id","term_id");--> statement-breakpoint
CREATE INDEX "template_taxonomy_assignments_term_template_idx" ON "template_taxonomy_assignments" USING btree ("term_id","template_id");--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_output_type_id_taxonomy_terms_id_fk" FOREIGN KEY ("output_type_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_taxonomy_reviewed_by_admin_users_id_fk" FOREIGN KEY ("taxonomy_reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_templates_status_output_type_created_idx" ON "prompt_templates" USING btree ("status","output_type_id","created_at");--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_workflow_type_check" CHECK ("prompt_templates"."workflow_type" in ('generate','edit'));--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_taxonomy_review_status_check" CHECK ("prompt_templates"."taxonomy_review_status" in ('pending','needs_attention','reviewed'));--> statement-breakpoint

INSERT INTO "taxonomy_terms" ("dimension", "slug", "label", "description", "aliases", "sort_order") VALUES
('output_type','portrait','人像写真','肖像、头像与人物写真',ARRAY['人像','肖像','头像'],10),
('output_type','product_image','商品图片','商品主图、场景图与产品视觉',ARRAY['电商产品','产品图','商品图'],20),
('output_type','poster','海报视觉','海报、传单与活动物料',ARRAY['海报','宣传图'],30),
('output_type','logo','Logo 与品牌','标志与品牌识别视觉',ARRAY['Logo 品牌','标志'],40),
('output_type','illustration','插画与艺术','手绘与风格化插画',ARRAY['插画创意','艺术创作'],50),
('output_type','wallpaper','壁纸','手机、电脑和个人表达壁纸',ARRAY['桌面壁纸','手机壁纸'],60),
('output_type','general_visual','通用视觉','尚未细分的通用视觉产物',ARRAY['通用图片'],999),
('scenario','ecommerce_product','电商商品图','',ARRAY[]::text[],10),
('scenario','advertising_marketing','广告与营销创意','',ARRAY[]::text[],20),
('scenario','social_media','社交媒体内容','',ARRAY[]::text[],30),
('scenario','product_photography_mockup','产品摄影与 Mockup','',ARRAY['产品摄影','Mockup'],40),
('scenario','poster_event_material','海报、传单与活动物料','',ARRAY['海报 / 传单'],50),
('scenario','brand_logo','品牌视觉与 Logo 灵感','',ARRAY['品牌视觉'],60),
('scenario','portrait_avatar','人物肖像与头像','',ARRAY['人物头像'],70),
('scenario','character_story','角色设计与故事叙事','',ARRAY['角色设计'],80),
('scenario','game_digital_asset','游戏与数字资产','',ARRAY[]::text[],90),
('scenario','concept_art','概念艺术与灵感探索','',ARRAY[]::text[],100),
('scenario','education_infographic_presentation','教育、信息图与演示视觉','',ARRAY['信息图'],110),
('scenario','wallpaper_personal_expression','壁纸、艺术创作与个人表达','',ARRAY['壁纸'],120),
('scenario','mobile_wallpaper','手机壁纸','',ARRAY[]::text[],130),
('scenario','desktop_wallpaper','电脑壁纸','',ARRAY['桌面壁纸'],140),
('style','photorealistic','写实摄影','',ARRAY['真实摄影','照片级写实'],10),
('style','cinematic','电影感·电影剧照','',ARRAY['电影感','电影剧照'],20),
('style','3d_render','3D 渲染','',ARRAY['三维渲染'],30),
('style','anime','动漫·二次元','',ARRAY['动漫','二次元'],40),
('style','commercial_illustration','商业插画','',ARRAY[]::text[],50),
('style','concept_art_style','概念艺术/游戏原画','',ARRAY['游戏原画'],60),
('style','minimalism','极简主义','',ARRAY['极简'],70),
('style','retro','复古·怀旧','',ARRAY['复古','怀旧'],80),
('style','watercolor_handdrawn','水彩与手绘','',ARRAY['水彩','手绘'],90),
('style','oil_classical','油画与古典绘画','',ARRAY['油画','古典绘画'],100),
('style','chibi','Q 版·萌系角色','',ARRAY['Q版','萌系角色'],110),
('style','isometric_infographic','等距·信息可视化','',ARRAY['等距','信息可视化'],120),
('subject','person','人像·人物','',ARRAY['人物','人像'],10),
('subject','product','产品·商品','',ARRAY['产品','商品'],20),
('subject','character_ip','角色·IP','',ARRAY['角色','IP'],30),
('subject','nature_landscape','自然·风景','',ARRAY['自然','风景'],40),
('subject','architecture_interior','建筑·室内','',ARRAY['建筑','室内'],50),
('subject','fashion_clothing','时尚·服饰','',ARRAY['时尚','服饰'],60),
('subject','city_street','城市·街头','',ARRAY['城市','街头'],70),
('subject','food_beverage','食品·饮料','',ARRAY['食品','饮料'],80),
('subject','animal_pet','动物·宠物','',ARRAY['动物','宠物'],90),
('subject','lifestyle_relationship','人物关系·生活方式','',ARRAY['生活方式'],100),
('subject','abstract_background','抽象·背景','',ARRAY['抽象','背景'],110),
('subject','typography_layout','文字·排版','',ARRAY['文字','排版'],120)
ON CONFLICT ("dimension", "slug") DO NOTHING;--> statement-breakpoint

UPDATE "prompt_templates" SET "workflow_type" = CASE WHEN "category" = 'edit' THEN 'edit' ELSE 'generate' END;--> statement-breakpoint

UPDATE "prompt_templates" AS p
SET "output_type_id" = t."id"
FROM "taxonomy_terms" AS t
WHERE t."dimension" = 'output_type'
  AND t."slug" = CASE p."category"
    WHEN 'portrait' THEN 'portrait'
    WHEN 'ecommerce' THEN 'product_image'
    WHEN 'poster' THEN 'poster'
    WHEN 'logo' THEN 'logo'
    WHEN 'illustration' THEN 'illustration'
    WHEN 'edit' THEN 'general_visual'
    ELSE NULL
  END;--> statement-breakpoint

INSERT INTO "template_taxonomy_assignments" ("template_id", "term_id", "source")
SELECT DISTINCT p."id", t."id", 'migration'
FROM "prompt_templates" AS p
CROSS JOIN LATERAL unnest(p."scenarios") AS s(label)
JOIN "taxonomy_terms" AS t ON t."dimension" = 'scenario' AND t."label" = s.label
ON CONFLICT ("template_id", "term_id") DO NOTHING;--> statement-breakpoint

UPDATE "prompt_templates"
SET "taxonomy_review_status" = CASE
  WHEN "status" = 'published' AND "output_type_id" IS NOT NULL THEN 'reviewed'
  WHEN "output_type_id" IS NULL THEN 'needs_attention'
  ELSE 'pending'
END;
