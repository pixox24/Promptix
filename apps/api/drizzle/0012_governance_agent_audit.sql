ALTER TABLE "governance_audit_events" DROP CONSTRAINT "governance_audit_events_proposal_id_governance_proposals_id_fk";
--> statement-breakpoint
ALTER TABLE "governance_audit_events" ADD CONSTRAINT "governance_audit_events_proposal_id_governance_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."governance_proposals"("id") ON DELETE set null ON UPDATE no action;