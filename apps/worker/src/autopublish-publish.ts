const HOUR_MS = 60 * 60 * 1000;
const OBSERVATION_HOURS = 72;

type PublishInput = {
  runId: string; templateId: string; templateVersion: number;
  ruleSetId: string; ruleSetVersion: number; permitId: string;
  rollbackHours: number; now: Date;
};
type PublishRepository = {
  create(input: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export async function createAutopilotPublishChangeSet(input: PublishInput, repository: PublishRepository) {
  return repository.create({
    runId: input.runId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    ruleSetId: input.ruleSetId,
    ruleSetVersion: input.ruleSetVersion,
    permitId: input.permitId,
    executionMode: 'autopilot',
    status: 'auto_executing',
    rollbackUntil: new Date(input.now.getTime() + Math.max(OBSERVATION_HOURS, input.rollbackHours) * HOUR_MS),
    proposal: { action: 'publish', requiresApproval: false },
    item: { status: 'pending' },
  });
}

type CompleteRepository = {
  complete(input: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export async function completeAutopublishRun(
  input: { runId: string; templateId: string; changeSetStatus: string; now: Date },
  repository: CompleteRepository,
) {
  if (!['succeeded', 'rollback_available'].includes(input.changeSetStatus)) {
    throw new Error('AUTOPUBLISH_CHANGE_SET_NOT_SUCCEEDED');
  }
  return repository.complete({
    runId: input.runId,
    templateId: input.templateId,
    status: 'succeeded',
    templateStatus: 'published',
    lifecycleState: 'published_observing',
    observationUntil: new Date(input.now.getTime() + OBSERVATION_HOURS * HOUR_MS),
    templateUrl: `/templates/${input.templateId}`,
    eventType: 'autopublish.run_succeeded',
  });
}
