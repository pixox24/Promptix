CREATE TABLE "template_recommendation_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_template_id" text NOT NULL,
  "algorithm_version" text NOT NULL,
  "candidate_ids" text[] NOT NULL,
  "score_snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "template_recommendation_requests_source_template_id_prompt_templates_id_fk"
    FOREIGN KEY ("source_template_id") REFERENCES "public"."prompt_templates"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "template_recommendation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "source_template_id" text NOT NULL,
  "recommended_template_id" text NOT NULL,
  "event_type" text NOT NULL,
  "position" integer NOT NULL,
  "generation_job_id" uuid,
  "dedupe_key" text NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "template_recommendation_events_request_id_template_recommendation_requests_id_fk"
    FOREIGN KEY ("request_id") REFERENCES "public"."template_recommendation_requests"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "template_recommendation_events_source_template_id_prompt_templates_id_fk"
    FOREIGN KEY ("source_template_id") REFERENCES "public"."prompt_templates"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "template_recommendation_events_recommended_template_id_prompt_templates_id_fk"
    FOREIGN KEY ("recommended_template_id") REFERENCES "public"."prompt_templates"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "template_recommendation_events_generation_job_id_generation_jobs_id_fk"
    FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_jobs"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "template_recommendation_events_event_type_check"
    CHECK ("event_type" in ('impression','click','generation_succeeded')),
  CONSTRAINT "template_recommendation_events_position_check"
    CHECK ("position" between 1 and 12)
);
--> statement-breakpoint
CREATE INDEX "template_recommendation_requests_source_created_idx"
  ON "template_recommendation_requests" USING btree ("source_template_id","created_at");
--> statement-breakpoint
CREATE INDEX "template_recommendation_requests_expires_idx"
  ON "template_recommendation_requests" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "template_recommendation_events_dedupe_key_uidx"
  ON "template_recommendation_events" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "template_recommendation_events_pair_type_created_idx"
  ON "template_recommendation_events" USING btree (
    "source_template_id","recommended_template_id","event_type","created_at"
  );
--> statement-breakpoint
CREATE INDEX "template_recommendation_events_request_created_idx"
  ON "template_recommendation_events" USING btree ("request_id","created_at");

