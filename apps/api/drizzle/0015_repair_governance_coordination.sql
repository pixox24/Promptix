-- Repair databases that recorded migration 0014 before its coordination
-- objects were added to the migration file. Every statement is additive so
-- this is also safe after a complete 0014 migration.
CREATE UNIQUE INDEX IF NOT EXISTS "governance_change_set_items_proposal_uidx"
  ON "governance_change_set_items" USING btree ("proposal_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_governance_state" (
  "template_id" text PRIMARY KEY NOT NULL REFERENCES "prompt_templates"("id") ON DELETE CASCADE,
  "last_scan_at" timestamp with time zone,
  "lease_until" timestamp with time zone,
  "lease_token" text,
  "last_run_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_governance_state_eligibility_idx"
  ON "template_governance_state" USING btree ("lease_until", "last_scan_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_operation_idempotency" (
  "operation_key" text PRIMARY KEY NOT NULL,
  "operation" text NOT NULL,
  "response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
