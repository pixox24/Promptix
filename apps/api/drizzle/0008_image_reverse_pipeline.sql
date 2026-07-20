ALTER TABLE "generation_jobs" ADD COLUMN "vision_model_id" uuid;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "error_code" text;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "error_details" jsonb;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "progress" jsonb;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "result_meta" jsonb;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_vision_model_id_provider_models_id_fk" FOREIGN KEY ("vision_model_id") REFERENCES "public"."provider_models"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_error_code_check" CHECK ("generation_jobs"."error_code" IS NULL OR "generation_jobs"."error_code" IN ('VISION_MODEL_UNAVAILABLE','VISION_REQUEST_FAILED','VISION_EMPTY_RESPONSE','STRUCTURE_MODEL_UNAVAILABLE','STRUCTURE_REQUEST_FAILED','STRUCTURE_OUTPUT_TRUNCATED','STRUCTURE_JSON_INVALID','STRUCTURE_SCHEMA_INVALID','STRUCTURE_CONTENT_FILTERED','STRUCTURE_REPAIR_FAILED','PIPELINE_TIMEOUT','UNKNOWN_PIPELINE_ERROR'));
