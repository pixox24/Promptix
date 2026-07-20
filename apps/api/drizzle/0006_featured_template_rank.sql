ALTER TABLE "prompt_templates" ADD COLUMN "featured_order" integer DEFAULT 0 NOT NULL;
CREATE INDEX "prompt_templates_featured_rank_idx" ON "prompt_templates" USING btree ("status", "is_featured", "featured_order", "use_count", "created_at");
