import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GOVERNANCE_RULES } from '@promptix/shared';

const serviceModuleUrl = new URL('../dist/lib/autopublish-service.js', import.meta.url);
const capabilityModuleUrl = new URL('../dist/lib/autopublish-capabilities.js', import.meta.url);

const IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  grant: '00000000-0000-4000-8000-000000000002',
  rules: '00000000-0000-4000-8000-000000000003',
};
const NOW = new Date('2026-07-23T00:00:00.000Z');

function makeGrant(overrides = {}) {
  return {
    id: IDS.grant,
    triggerType: 'delegated',
    agentId: 'delegated-agent',
    initiatedBy: IDS.admin,
    scopes: ['autopublish.run:create', 'autopublish.run:read', 'autopublish.run:cancel', 'autopublish.exception:list'],
    inputSnapshotHash: null,
    sourceConstraints: { sourceTypes: ['admin_intake'], flowTypes: ['text_expand'] },
    budget: {
      maximumModelCalls: 4,
      maximumCoverAttempts: 1,
      maximumDurationMinutes: 8,
      maximumConcurrentPerAgent: 2,
      maximumRunsPerHour: 10,
      maximumBatchSize: 1,
    },
    expiresAt: new Date('2026-07-24T00:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

function delegatedInput(overrides = {}) {
  return {
    flowType: 'text_expand',
    triggerType: 'delegated',
    text: 'Create a studio portrait prompt',
    allowAutomaticRepair: true,
    sourceType: 'admin_intake',
    sourceItemId: 'request-1',
    idempotencyKey: 'delegate-request-1',
    requestedBy: IDS.admin,
    agentId: 'delegated-agent',
    capabilityGrantId: IDS.grant,
    ...overrides,
  };
}

function fakeRepository(grants = [makeGrant()]) {
  const runs = [];
  const outbox = [];
  const audits = [];
  const stageAttempts = [];
  const artifacts = [];
  const actionClaims = new Map();
  let sequence = 1;

  const view = (run) => ({
    ...run,
    retryable: run.nextAllowedActions.length > 0,
    completedStages: [...new Set(stageAttempts.filter((item) => item.runId === run.id && item.status === 'succeeded').map((item) => item.stage))],
    stageAttempts: stageAttempts.filter((item) => item.runId === run.id).map((item) => ({ ...item })),
    artifacts: artifacts.filter((item) => item.runId === run.id).map((item) => ({ ...item })),
  });

  return {
    runs,
    outbox,
    audits,
    stageAttempts,
    artifacts,
    async findByIdempotencyKey(idempotencyKey) {
      return runs.find((run) => run.idempotencyKey === idempotencyKey) ?? null;
    },
    async getGrant(id) {
      return grants.find((grant) => grant.id === id) ?? null;
    },
    async createRun(input) {
      const existing = runs.find((run) => run.idempotencyKey === input.idempotencyKey);
      if (existing) {
        if (existing.inputSnapshotHash !== input.inputSnapshotHash) throw Object.assign(new Error('AUTOPUBLISH_IDEMPOTENCY_MISMATCH'), { code: 'AUTOPUBLISH_IDEMPOTENCY_MISMATCH' });
        return existing;
      }
      if (
        input.triggerType === 'scheduled_agent'
        && runs.some((run) => run.triggerType === 'scheduled_agent'
          && run.sourceType === input.sourceType
          && run.sourceItemId === input.sourceItemId
          && run.flowType === input.flowType)
      ) throw Object.assign(new Error('AUTOPUBLISH_SOURCE_ALREADY_EXISTS'), { code: 'AUTOPUBLISH_SOURCE_ALREADY_EXISTS' });

      const run = {
        ...input,
        id: `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
        status: 'queued',
        currentStage: 'queued',
        budgetConsumed: { modelCalls: 0, coverAttempts: 0, durationMinutes: 0 },
        repairCount: 0,
        templateId: null,
        permitId: null,
        changeSetId: null,
        errorCode: null,
        errorDetails: null,
        nextAllowedActions: [],
        createdAt: NOW.toISOString(),
        finishedAt: null,
        observationUntil: null,
        rollbackUntil: null,
      };
      runs.push(run);
      audits.push({ eventType: 'autopublish.run_created', runId: run.id });
      outbox.push({ runId: run.id, eventType: 'autopublish.run.start', dedupeKey: `run:${run.id}:start` });
      return run;
    },
    async getRunView(id) {
      const run = runs.find((item) => item.id === id);
      return run ? view(run) : null;
    },
    async cancelRun(id) {
      const run = runs.find((item) => item.id === id);
      if (!run) throw Object.assign(new Error('AUTOPUBLISH_RUN_NOT_FOUND'), { code: 'AUTOPUBLISH_RUN_NOT_FOUND' });
      if (['duplicate_found', 'rejected', 'succeeded', 'failed', 'cancelled'].includes(run.status)) {
        throw Object.assign(new Error('AUTOPUBLISH_RUN_TERMINAL'), { code: 'AUTOPUBLISH_RUN_TERMINAL' });
      }
      run.status = 'cancelled';
      run.finishedAt = NOW.toISOString();
      audits.push({ eventType: 'autopublish.run_cancelled', runId: run.id });
      return view(run);
    },
    async actRun(id, action, _actorId, idempotencyKey) {
      const claimKey = `${id}:${idempotencyKey}`;
      const claimedAction = actionClaims.get(claimKey);
      if (claimedAction) {
        if (claimedAction !== action) throw Object.assign(new Error('AUTOPUBLISH_ACTION_IDEMPOTENCY_MISMATCH'), { code: 'AUTOPUBLISH_ACTION_IDEMPOTENCY_MISMATCH' });
        return view(runs.find((item) => item.id === id));
      }
      const run = runs.find((item) => item.id === id);
      if (!run) throw Object.assign(new Error('AUTOPUBLISH_RUN_NOT_FOUND'), { code: 'AUTOPUBLISH_RUN_NOT_FOUND' });
      if (!run.nextAllowedActions.includes(action)) throw Object.assign(new Error('AUTOPUBLISH_ACTION_FORBIDDEN'), { code: 'AUTOPUBLISH_ACTION_FORBIDDEN' });
      actionClaims.set(claimKey, action);
      const stageByAction = {
        edit_draft: 'validating',
        map_taxonomy: 'verifying_taxonomy',
        review_taxonomy: 'verifying_taxonomy',
        confirm_distinct: 'creating_template',
        retry_cover: 'generating_cover',
        retry_quality: 'reviewing_quality',
        retry_after_conflict: 'creating_template',
      };
      const stage = stageByAction[action];
      const attempt = stageAttempts.filter((item) => item.runId === id && item.stage === stage).length + 1;
      stageAttempts.push({ runId: id, stage, attempt, status: 'queued', inputHash: run.inputSnapshotHash });
      run.status = 'queued';
      run.currentStage = stage;
      run.errorCode = null;
      run.errorDetails = null;
      run.nextAllowedActions = [];
      outbox.push({ runId: id, eventType: 'autopublish.run.recover', dedupeKey: `run:${id}:action:${idempotencyKey}` });
      audits.push({ eventType: 'autopublish.recovery_action', runId: id, action, idempotencyKey });
      return view(run);
    },
    async listExceptionViews() {
      return runs.filter((run) => ['conflict_waiting', 'needs_attention', 'rejected', 'failed'].includes(run.status)).map(view);
    },
  };
}

function dependencies(overrides = {}) {
  const enabledRules = {
    ...DEFAULT_GOVERNANCE_RULES.autopublish,
    delegatedEnabled: true,
    scheduledAgentEnabled: true,
  };
  return {
    hash: (value) => `hash:${JSON.stringify(value)}`,
    now: () => NOW,
    loadRules: async () => ({ id: IDS.rules, version: 4, rules: enabledRules }),
    loadTaxonomy: async () => ({ hash: 'taxonomy-hash' }),
    loadPromptVersion: async () => 'text-expand-v3',
    ...overrides,
  };
}

test('delegated creation freezes provenance and replays idempotently', async () => {
  const { createAutopublishService } = await import(serviceModuleUrl);
  const repository = fakeRepository();
  const service = createAutopublishService(repository, dependencies({ hash: () => 'input-hash' }));

  const first = await service.create(delegatedInput());
  const replay = await service.create(delegatedInput());

  assert.equal(replay.id, first.id);
  assert.equal(first.ruleSetVersion, 4);
  assert.equal(first.taxonomySnapshotHash, 'taxonomy-hash');
  assert.equal(first.promptVersion, 'text-expand-v3');
  assert.deepEqual(first.budgetSnapshot, makeGrant().budget);
  assert.equal(repository.outbox.length, 1);
  assert.equal(repository.audits.length, 1);
});

test('same idempotency key with a different payload is rejected', async () => {
  const { createAutopublishService } = await import(serviceModuleUrl);
  const repository = fakeRepository([makeGrant({ inputSnapshotHash: null, sourceConstraints: {} })]);
  const service = createAutopublishService(repository, dependencies());
  await service.create(delegatedInput());
  await assert.rejects(
    () => service.create(delegatedInput({ text: 'A different prompt' })),
    /AUTOPUBLISH_IDEMPOTENCY_MISMATCH/,
  );
  assert.equal(repository.runs.length, 1);
});

test('replay returns frozen provenance even after current rules and grant expire', async () => {
  const { createAutopublishService } = await import(serviceModuleUrl);
  const grant = makeGrant();
  const repository = fakeRepository([grant]);
  let version = 4;
  const service = createAutopublishService(repository, dependencies({
    hash: () => 'same-hash',
    loadRules: async () => ({
      id: IDS.rules,
      version,
      rules: { ...DEFAULT_GOVERNANCE_RULES.autopublish, delegatedEnabled: true, scheduledAgentEnabled: true },
    }),
  }));
  const first = await service.create(delegatedInput());
  version = 5;
  grant.revokedAt = NOW;
  const replay = await service.create(delegatedInput());
  assert.equal(replay.id, first.id);
  assert.equal(replay.ruleSetVersion, 4);
});

test('scheduled sources are unique while delegated sources may run again with a new key', async () => {
  const { createAutopublishService } = await import(serviceModuleUrl);
  const scheduledGrant = makeGrant({
    id: '00000000-0000-4000-8000-000000000004',
    triggerType: 'scheduled_agent',
    agentId: 'scanner',
    initiatedBy: null,
    inputSnapshotHash: null,
    sourceConstraints: { sourceTypes: ['internal_queue'], flowTypes: ['text_expand'] },
  });
  const repository = fakeRepository([makeGrant({ inputSnapshotHash: null }), scheduledGrant]);
  const service = createAutopublishService(repository, dependencies());

  const delegatedFirst = await service.create(delegatedInput());
  const delegatedSecond = await service.create(delegatedInput({ idempotencyKey: 'delegate-request-2' }));
  assert.notEqual(delegatedSecond.id, delegatedFirst.id);

  const scheduled = delegatedInput({
    triggerType: 'scheduled_agent',
    requestedBy: null,
    agentId: 'scanner',
    capabilityGrantId: scheduledGrant.id,
    sourceType: 'internal_queue',
    sourceItemId: 'row-1',
    idempotencyKey: 'scheduled-request-1',
  });
  await service.create(scheduled);
  await assert.rejects(
    () => service.create({ ...scheduled, idempotencyKey: 'scheduled-request-2' }),
    /AUTOPUBLISH_SOURCE_ALREADY_EXISTS/,
  );
});

test('grant cannot be reused for another input, source, budget or forbidden scope', async () => {
  const { assertAutopublishGrant } = await import(capabilityModuleUrl);
  const grant = makeGrant({ inputSnapshotHash: 'input-hash' });
  const request = {
    triggerType: 'delegated',
    scope: 'autopublish.run:create',
    inputSnapshotHash: 'input-hash',
    sourceType: 'admin_intake',
    sourceItemId: 'request-1',
    flowType: 'text_expand',
    requestedBy: IDS.admin,
    agentId: 'delegated-agent',
    budget: grant.budget,
    now: NOW,
  };
  assert.throws(() => assertAutopublishGrant(grant, { ...request, inputSnapshotHash: 'other' }), /AUTOPUBLISH_GRANT_INPUT_MISMATCH/);
  assert.throws(() => assertAutopublishGrant(grant, { ...request, scope: 'governance.rules:write' }), /AUTOPUBLISH_SCOPE_FORBIDDEN/);
  assert.throws(() => assertAutopublishGrant(grant, { ...request, sourceType: 'internet' }), /AUTOPUBLISH_GRANT_SOURCE_FORBIDDEN/);
  assert.throws(() => assertAutopublishGrant(grant, { ...request, agentId: 'other-agent' }), /AUTOPUBLISH_GRANT_AGENT_MISMATCH/);
  assert.throws(() => assertAutopublishGrant(grant, {
    ...request,
    budget: { ...grant.budget, maximumModelCalls: grant.budget.maximumModelCalls + 1 },
  }), /AUTOPUBLISH_GRANT_BUDGET_EXCEEDED/);
});

test('expired, revoked and trigger-mismatched grants are rejected', async () => {
  const { assertAutopublishGrant } = await import(capabilityModuleUrl);
  const request = { triggerType: 'delegated', scope: 'autopublish.run:create', inputSnapshotHash: 'hash', now: NOW };
  assert.throws(() => assertAutopublishGrant(makeGrant({ expiresAt: NOW }), request), /AUTOPUBLISH_GRANT_EXPIRED/);
  assert.throws(() => assertAutopublishGrant(makeGrant({ revokedAt: NOW }), request), /AUTOPUBLISH_GRANT_EXPIRED/);
  assert.throws(() => assertAutopublishGrant(makeGrant(), { ...request, triggerType: 'scheduled_agent' }), /AUTOPUBLISH_GRANT_TRIGGER_MISMATCH/);
});

test('cancellation succeeds only for nonterminal runs', async () => {
  const { createAutopublishService } = await import(serviceModuleUrl);
  const repository = fakeRepository();
  const service = createAutopublishService(repository, dependencies({ hash: () => 'input-hash' }));
  const run = await service.create(delegatedInput());
  const cancelled = await service.cancel(run.id, IDS.admin);
  assert.equal(cancelled.status, 'cancelled');
  await assert.rejects(() => service.cancel(run.id, IDS.admin), /AUTOPUBLISH_RUN_TERMINAL/);
});

test('recovery requires a server-advertised action and appends an idempotent stage attempt', async () => {
  const { createAutopublishService } = await import(serviceModuleUrl);
  const repository = fakeRepository();
  const service = createAutopublishService(repository, dependencies({ hash: () => 'input-hash' }));
  const run = await service.create(delegatedInput());
  repository.artifacts.push({ id: 'artifact-1', runId: run.id, kind: 'quality_assessment', contentHash: 'old' });
  repository.stageAttempts.push({ runId: run.id, stage: 'reviewing_quality', attempt: 1, status: 'failed', inputHash: 'input-hash', artifactId: 'artifact-1' });
  Object.assign(repository.runs[0], {
    status: 'needs_attention',
    currentStage: 'reviewing_quality',
    errorCode: 'QUALITY_THRESHOLD_NOT_MET',
    nextAllowedActions: ['edit_draft', 'retry_quality'],
  });

  await assert.rejects(
    () => service.act(run.id, 'confirm_distinct', IDS.admin, 'action-key-1'),
    /AUTOPUBLISH_ACTION_FORBIDDEN/,
  );
  const recovered = await service.act(run.id, 'retry_quality', IDS.admin, 'action-key-1');
  const replay = await service.act(run.id, 'retry_quality', IDS.admin, 'action-key-1');

  assert.equal(replay.id, recovered.id);
  assert.deepEqual(repository.artifacts, [{ id: 'artifact-1', runId: run.id, kind: 'quality_assessment', contentHash: 'old' }]);
  assert.equal(repository.stageAttempts.length, 2);
  assert.deepEqual(repository.stageAttempts.map(({ stage, attempt, status }) => ({ stage, attempt, status })), [
    { stage: 'reviewing_quality', attempt: 1, status: 'failed' },
    { stage: 'reviewing_quality', attempt: 2, status: 'queued' },
  ]);
});

test('exception listing includes attention and failed runs only', async () => {
  const { createAutopublishService } = await import(serviceModuleUrl);
  const repository = fakeRepository([makeGrant({ inputSnapshotHash: null, sourceConstraints: {} })]);
  const service = createAutopublishService(repository, dependencies());
  const attention = await service.create(delegatedInput());
  const succeeded = await service.create(delegatedInput({ idempotencyKey: 'delegate-request-2' }));
  repository.runs.find((run) => run.id === attention.id).status = 'needs_attention';
  repository.runs.find((run) => run.id === succeeded.id).status = 'succeeded';
  const exceptions = await service.listExceptions();
  assert.deepEqual(exceptions.map((run) => run.id), [attention.id]);
});
