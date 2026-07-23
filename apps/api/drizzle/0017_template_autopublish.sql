CREATE TABLE IF NOT EXISTS "agent_capability_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trigger_type" text NOT NULL CHECK ("trigger_type" IN ('delegated','scheduled_agent')),
  "agent_id" text NOT NULL,
  "initiated_by" uuid REFERENCES "admin_users"("id"),
  "scopes" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "input_snapshot_hash" text,
  "source_constraints" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "budget" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_autopublish_source_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_type" text NOT NULL,
  "source_item_id" text NOT NULL,
  "flow_type" text NOT NULL CHECK ("flow_type" IN ('text_expand','image_reverse')),
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','leased','completed','failed','cancelled')),
  "lease_token" text,
  "lease_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("source_type","source_item_id","flow_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_autopublish_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','running','conflict_waiting','needs_attention','duplicate_found','rejected','succeeded','failed','cancelled')),
  "current_stage" text NOT NULL DEFAULT 'queued',
  "trigger_type" text NOT NULL CHECK ("trigger_type" IN ('delegated','scheduled_agent')),
  "requested_by" uuid REFERENCES "admin_users"("id"),
  "agent_id" text,
  "capability_grant_id" uuid NOT NULL REFERENCES "agent_capability_grants"("id"),
  "flow_type" text NOT NULL CHECK ("flow_type" IN ('text_expand','image_reverse')),
  "source_type" text NOT NULL,
  "source_item_id" text NOT NULL,
  "input_snapshot" jsonb NOT NULL,
  "input_snapshot_hash" text NOT NULL,
  "rule_set_id" uuid NOT NULL REFERENCES "governance_rule_sets"("id"),
  "rule_set_version" integer NOT NULL,
  "taxonomy_snapshot_hash" text NOT NULL,
  "prompt_version" text NOT NULL,
  "budget_snapshot" jsonb NOT NULL,
  "budget_consumed" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "repair_count" integer NOT NULL DEFAULT 0 CHECK ("repair_count" BETWEEN 0 AND 2),
  "template_id" text REFERENCES "prompt_templates"("id"),
  "change_set_id" uuid REFERENCES "governance_change_sets"("id"),
  "idempotency_key" text NOT NULL UNIQUE,
  "lease_token" text,
  "lease_until" timestamptz,
  "error_code" text,
  "error_details" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "finished_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "template_autopublish_runs_scheduled_source_unique"
  ON "template_autopublish_runs" ("source_type","source_item_id","flow_type")
  WHERE "trigger_type" = 'scheduled_agent';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_autopublish_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "template_autopublish_runs"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "schema_version" integer NOT NULL DEFAULT 1,
  "content_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "model_id" uuid REFERENCES "provider_models"("id"),
  "prompt_version" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("run_id","kind","content_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_autopublish_stage_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "template_autopublish_runs"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "attempt" integer NOT NULL CHECK ("attempt" > 0),
  "status" text NOT NULL CHECK ("status" IN ('queued','running','succeeded','failed','cancelled')),
  "input_hash" text NOT NULL,
  "artifact_id" uuid REFERENCES "template_autopublish_artifacts"("id"),
  "generation_job_id" uuid REFERENCES "generation_jobs"("id"),
  "usage" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_code" text,
  "error_details" jsonb,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  UNIQUE ("run_id","stage","attempt")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_autopublish_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "template_autopublish_runs"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "dedupe_key" text NOT NULL UNIQUE,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "available_at" timestamptz NOT NULL DEFAULT now(),
  "leased_until" timestamptz,
  "lease_token" text,
  "dispatched_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_execution_permits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "autopublish_run_id" uuid NOT NULL REFERENCES "template_autopublish_runs"("id") ON DELETE CASCADE,
  "template_id" text NOT NULL REFERENCES "prompt_templates"("id"),
  "template_version" integer NOT NULL,
  "rule_set_id" uuid NOT NULL REFERENCES "governance_rule_sets"("id"),
  "rule_set_version" integer NOT NULL,
  "action" text NOT NULL CHECK ("action" = 'publish'),
  "content_hash" text NOT NULL,
  "permit_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "generation_jobs"
  ADD COLUMN IF NOT EXISTS "autopublish_run_id" uuid REFERENCES "template_autopublish_runs"("id"),
  ADD COLUMN IF NOT EXISTS "autopublish_stage" text;
--> statement-breakpoint
ALTER TABLE "governance_change_sets"
  ADD COLUMN IF NOT EXISTS "permit_id" uuid REFERENCES "governance_execution_permits"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "governance_change_sets_permit_unique"
  ON "governance_change_sets" ("permit_id")
  WHERE "permit_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "template_governance_state"
  ADD COLUMN IF NOT EXISTS "lifecycle_state" text NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS "observation_until" timestamptz,
  ADD COLUMN IF NOT EXISTS "exposure_limited_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "prompt_templates" DROP CONSTRAINT IF EXISTS "prompt_templates_taxonomy_review_status_check";
--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_taxonomy_review_status_check"
  CHECK ("taxonomy_review_status" IN ('pending','needs_attention','reviewed','auto_verified'));
--> statement-breakpoint
ALTER TABLE "governance_change_sets" DROP CONSTRAINT IF EXISTS "governance_change_sets_execution_mode_check";
--> statement-breakpoint
ALTER TABLE "governance_change_sets" ADD CONSTRAINT "governance_change_sets_execution_mode_check"
  CHECK ("execution_mode" IN ('automatic','approval','legacy_mixed','autopilot'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_autopublish_runs_status_created_idx"
  ON "template_autopublish_runs" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_autopublish_stage_attempts_run_stage_status_idx"
  ON "template_autopublish_stage_attempts" ("run_id", "stage", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_autopublish_outbox_pending_idx"
  ON "template_autopublish_outbox" ("available_at")
  WHERE "dispatched_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_autopublish_source_items_lease_idx"
  ON "template_autopublish_source_items" ("status", "lease_until");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_execution_permits_expiry_idx"
  ON "governance_execution_permits" ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_governance_state_lifecycle_observation_idx"
  ON "template_governance_state" ("lifecycle_state", "observation_until");
