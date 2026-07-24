export type AutopublishSnapshot = {
  status: string;
  currentStage: string;
  leasedByOther?: boolean;
  draftJobDone?: boolean;
  repairJobDone?: boolean;
  coverJobDone?: boolean;
  publishDone?: boolean;
};

export type AutopublishCommand = {
  kind:
    | 'stop' | 'wait' | 'create_draft_job' | 'run_validation'
    | 'verify_taxonomy' | 'create_screen_job' | 'check_duplicates'
    | 'persist_template' | 'create_quality_job' | 'evaluate_quality'
    | 'evaluate_counter_review' | 'issue_permit' | 'complete';
  nextStage?: string;
};

const TERMINAL_STATUSES = new Set([
  'duplicate_found', 'rejected', 'succeeded', 'failed', 'cancelled',
]);
const PAUSED_STATUSES = new Set(['conflict_waiting', 'needs_attention']);

export function nextAutopublishStage(snapshot: AutopublishSnapshot): AutopublishCommand {
  if (
    TERMINAL_STATUSES.has(snapshot.status)
    || PAUSED_STATUSES.has(snapshot.status)
    || snapshot.leasedByOther
  ) return { kind: 'stop' };

  switch (snapshot.currentStage) {
    case 'queued':
      return { kind: 'create_draft_job', nextStage: 'generating_draft' };
    case 'generating_draft':
      return snapshot.draftJobDone
        ? { kind: 'run_validation', nextStage: 'validating' }
        : { kind: 'wait' };
    case 'validating':
      return { kind: 'run_validation' };
    case 'repairing':
      return snapshot.repairJobDone
        ? { kind: 'run_validation', nextStage: 'validating' }
        : { kind: 'wait' };
    case 'verifying_taxonomy':
      return { kind: 'verify_taxonomy' };
    case 'screening':
      return { kind: 'create_screen_job' };
    case 'checking_duplicates':
      return { kind: 'check_duplicates' };
    case 'creating_template':
      return { kind: 'persist_template' };
    case 'generating_cover':
      return snapshot.coverJobDone
        ? { kind: 'create_quality_job', nextStage: 'reviewing_quality' }
        : { kind: 'wait' };
    case 'reviewing_quality':
      return { kind: 'evaluate_quality' };
    case 'adversarial_review':
      return { kind: 'evaluate_counter_review' };
    case 'issuing_permit':
      return { kind: 'issue_permit' };
    case 'publishing':
      return snapshot.publishDone ? { kind: 'complete' } : { kind: 'wait' };
    default:
      return { kind: 'stop' };
  }
}
