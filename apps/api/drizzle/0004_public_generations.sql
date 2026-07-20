ALTER TABLE "generation_jobs" ADD COLUMN "owner_key_hash" text;
ALTER TABLE "generation_jobs" ADD COLUMN "usage_recorded_at" timestamp with time zone;
CREATE INDEX "generation_jobs_owner_status_idx" ON "generation_jobs" USING btree ("owner_key_hash", "status");
