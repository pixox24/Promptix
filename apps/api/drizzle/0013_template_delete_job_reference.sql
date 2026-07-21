ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_template_id_prompt_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE set null ON UPDATE no action;