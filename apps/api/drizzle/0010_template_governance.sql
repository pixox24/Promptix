CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"rule_set_version" integer NOT NULL,
	"model_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"stats" jsonb,
	"error_code" text,
	"error_message" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_runs_trigger_check" CHECK ("agent_runs"."trigger" in ('scheduled','manual')),
	CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" in ('queued','analyzing','planned','auto_executing','awaiting_approval','partially_succeeded','succeeded','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "governance_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"approved_scope" jsonb NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"rule_set_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_approvals_decision_check" CHECK ("governance_approvals"."decision" in ('approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE "governance_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"run_id" uuid,
	"change_set_id" uuid,
	"proposal_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_audit_events_actor_type_check" CHECK ("governance_audit_events"."actor_type" in ('admin','agent','system'))
);
--> statement-breakpoint
CREATE TABLE "governance_change_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"applied_version" integer,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "governance_change_set_items_status_check" CHECK ("governance_change_set_items"."status" in ('pending','awaiting_approval','queued','running','applied','skipped','conflict','failed','rolled_back'))
);
--> statement-breakpoint
CREATE TABLE "governance_change_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"scope_snapshot" jsonb NOT NULL,
	"exclusion_ids" text[] DEFAULT '{}' NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"rule_set_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rollback_until" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_change_sets_status_check" CHECK ("governance_change_sets"."status" in ('planned','auto_executing','awaiting_approval','approved','rejected','partially_succeeded','succeeded','failed','cancelled','rollback_available','rolled_back'))
);
--> statement-breakpoint
CREATE TABLE "governance_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"base_version" integer NOT NULL,
	"current_snapshot" jsonb NOT NULL,
	"action" text NOT NULL,
	"proposed_patch" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason_codes" text[] DEFAULT '{}' NOT NULL,
	"explanation" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"risk_level" text NOT NULL,
	"requires_approval" boolean NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_proposals_base_version_check" CHECK ("governance_proposals"."base_version" > 0),
	CONSTRAINT "governance_proposals_confidence_check" CHECK ("governance_proposals"."confidence" >= 0 and "governance_proposals"."confidence" <= 1),
	CONSTRAINT "governance_proposals_risk_level_check" CHECK ("governance_proposals"."risk_level" in ('low','medium','high')),
	CONSTRAINT "governance_proposals_status_check" CHECK ("governance_proposals"."status" in ('planned','accepted','skipped','awaiting_approval','approved','rejected','applied','conflict','failed','rolled_back'))
);
--> statement-breakpoint
CREATE TABLE "governance_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_rule_sets_version_check" CHECK ("governance_rule_sets"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"source" text NOT NULL,
	"actor_id" uuid,
	"run_id" uuid,
	"change_set_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_versions_version_check" CHECK ("template_versions"."version" > 0),
	CONSTRAINT "template_versions_source_check" CHECK ("template_versions"."source" in ('admin','agent','rollback','migration'))
);
--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_rule_set_id_governance_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."governance_rule_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_model_id_provider_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."provider_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_requested_by_admin_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approvals" ADD CONSTRAINT "governance_approvals_change_set_id_governance_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."governance_change_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approvals" ADD CONSTRAINT "governance_approvals_reviewer_id_admin_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_audit_events" ADD CONSTRAINT "governance_audit_events_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_audit_events" ADD CONSTRAINT "governance_audit_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_audit_events" ADD CONSTRAINT "governance_audit_events_change_set_id_governance_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."governance_change_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_audit_events" ADD CONSTRAINT "governance_audit_events_proposal_id_governance_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."governance_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_change_set_items" ADD CONSTRAINT "governance_change_set_items_change_set_id_governance_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."governance_change_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_change_set_items" ADD CONSTRAINT "governance_change_set_items_proposal_id_governance_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."governance_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_change_set_items" ADD CONSTRAINT "governance_change_set_items_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_change_sets" ADD CONSTRAINT "governance_change_sets_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_change_sets" ADD CONSTRAINT "governance_change_sets_rule_set_id_governance_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."governance_rule_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_proposals" ADD CONSTRAINT "governance_proposals_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_proposals" ADD CONSTRAINT "governance_proposals_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_rule_sets" ADD CONSTRAINT "governance_rule_sets_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_change_set_id_governance_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."governance_change_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_status_created_idx" ON "agent_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_rule_set_created_idx" ON "agent_runs" USING btree ("rule_set_id","created_at");--> statement-breakpoint
CREATE INDEX "governance_approvals_change_set_created_idx" ON "governance_approvals" USING btree ("change_set_id","created_at");--> statement-breakpoint
CREATE INDEX "governance_audit_events_target_created_idx" ON "governance_audit_events" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "governance_audit_events_change_set_created_idx" ON "governance_audit_events" USING btree ("change_set_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_change_set_items_change_set_proposal_uidx" ON "governance_change_set_items" USING btree ("change_set_id","proposal_id");--> statement-breakpoint
CREATE INDEX "governance_change_set_items_change_set_status_idx" ON "governance_change_set_items" USING btree ("change_set_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_change_sets_idempotency_key_uidx" ON "governance_change_sets" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "governance_change_sets_run_status_idx" ON "governance_change_sets" USING btree ("run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_proposals_run_template_uidx" ON "governance_proposals" USING btree ("run_id","template_id");--> statement-breakpoint
CREATE INDEX "governance_proposals_template_status_idx" ON "governance_proposals" USING btree ("template_id","status");--> statement-breakpoint
CREATE INDEX "governance_proposals_run_status_idx" ON "governance_proposals" USING btree ("run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_rule_sets_name_version_uidx" ON "governance_rule_sets" USING btree ("name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_rule_sets_single_active_uidx" ON "governance_rule_sets" USING btree ("enabled") WHERE "governance_rule_sets"."enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_template_version_uidx" ON "template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "template_versions_change_set_idx" ON "template_versions" USING btree ("change_set_id");
--> statement-breakpoint
INSERT INTO "template_versions" ("template_id", "version", "snapshot", "source")
SELECT
	"id",
	1,
	jsonb_build_object(
		'id', "id",
		'name', "name",
		'summary', "summary",
		'description', "description",
		'category', "category",
		'workflowType', "workflow_type",
		'outputTypeId', "output_type_id",
		'tags', "tags",
		'scenarios', "scenarios",
		'taxonomyReviewStatus', "taxonomy_review_status",
		'unmappedTerms', "unmapped_terms",
		'classificationMeta', "classification_meta",
		'variables', "variables",
		'promptTemplate', "prompt_template",
		'negativePrompt', "negative_prompt",
		'coverObjectKey', "cover_object_key",
		'coverUrl', "cover_url",
		'status', "status",
		'isFeatured', "is_featured",
		'featuredOrder', "featured_order",
		'isHot', "is_hot",
		'source', "source",
		'sourceMeta', "source_meta",
		'modelHints', "model_hints",
		'locale', "locale",
		'i18n', "i18n",
		'publishedAt', "published_at"
	),
	'migration'
FROM "prompt_templates"
ON CONFLICT ("template_id", "version") DO NOTHING;
--> statement-breakpoint
INSERT INTO "governance_rule_sets" ("name", "version", "rules", "enabled")
VALUES (
	'default',
	1,
	'{"schedule":{"enabled":true,"cron":"0 3 * * *","timezone":"Asia/Shanghai","scanLimit": 50},"automaticFields":["name","summary","semantic","tags"],"alwaysApprove":["promptTemplate","variables","publish","archive","delete"],"minimumAutoConfidence": 0.85,"maximumAutoBatchSize":50,"rollbackHours":168,"featured":{"slotLimit": 12,"maximumReplacementRatio": 0.2,"minimumAdjustmentHours": 24}}'::jsonb,
	true
)
ON CONFLICT ("name", "version") DO NOTHING;
