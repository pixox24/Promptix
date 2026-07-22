ALTER TABLE "prompt_templates" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN IF NOT EXISTS "deleted_by" uuid;
--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN IF NOT EXISTS "deletion_reason" text;
--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_deleted_by_admin_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "governance_change_sets" ADD COLUMN IF NOT EXISTS "execution_mode" text;
--> statement-breakpoint
UPDATE "governance_change_sets" cs
SET "execution_mode" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "governance_change_set_items" i
    INNER JOIN "governance_proposals" p ON p."id" = i."proposal_id"
    WHERE i."change_set_id" = cs."id" AND p."requires_approval" = true
  ) AND EXISTS (
    SELECT 1 FROM "governance_change_set_items" i
    INNER JOIN "governance_proposals" p ON p."id" = i."proposal_id"
    WHERE i."change_set_id" = cs."id" AND p."requires_approval" = false
  ) THEN 'legacy_mixed'
  WHEN EXISTS (
    SELECT 1 FROM "governance_change_set_items" i
    INNER JOIN "governance_proposals" p ON p."id" = i."proposal_id"
    WHERE i."change_set_id" = cs."id" AND p."requires_approval" = true
  ) THEN 'approval'
  ELSE 'automatic'
END
WHERE "execution_mode" IS NULL;
--> statement-breakpoint
ALTER TABLE "governance_change_sets" ALTER COLUMN "execution_mode" SET DEFAULT 'automatic';
--> statement-breakpoint
ALTER TABLE "governance_change_sets" ALTER COLUMN "execution_mode" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "governance_change_sets" ADD CONSTRAINT "governance_change_sets_execution_mode_check" CHECK ("execution_mode" in ('automatic','approval','legacy_mixed'));
--> statement-breakpoint
ALTER TABLE "governance_change_set_items" DROP CONSTRAINT IF EXISTS "governance_change_set_items_status_check";
--> statement-breakpoint
ALTER TABLE "governance_change_set_items" ADD CONSTRAINT "governance_change_set_items_status_check" CHECK ("status" in ('pending','awaiting_approval','queued','running','applied','skipped','conflict','failed','rejected','rolled_back'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_templates_deleted_updated_idx" ON "prompt_templates" USING btree ("deleted_at", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_change_sets_run_mode_status_idx" ON "governance_change_sets" USING btree ("run_id", "execution_mode", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "governance_change_set_items_proposal_uidx" ON "governance_change_set_items" USING btree ("proposal_id");
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
CREATE INDEX IF NOT EXISTS "template_governance_state_eligibility_idx" ON "template_governance_state" USING btree ("lease_until", "last_scan_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_operation_idempotency" (
  "operation_key" text PRIMARY KEY NOT NULL,
  "operation" text NOT NULL,
  "response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
