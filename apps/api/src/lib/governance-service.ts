import { governanceRuleSetSchema, governanceSelectionScopeSchema, type GovernanceRuleSet, type GovernanceSelectionScope } from '@promptix/shared';

export class GovernanceStateError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export type GovernanceServiceRepository = {
  activeRules(): Promise<{ id: string; version: number; rules: GovernanceRuleSet }>;
  createRun(input: { goal: string; scope: GovernanceSelectionScope; ruleSetId: string; ruleSetVersion: number; promptVersion: string; requestedBy: string; idempotencyKey: string }): Promise<{ id: string; status: string }>;
  failRun(id: string, errorCode: string, message: string): Promise<void>;
  loadChangeSet(id: string): Promise<{
    id: string;
    runId: string;
    status: string;
    executionMode: string;
    ruleSetVersion: number;
    proposals: Array<{ id: string; templateId: string; baseVersion: number; action: string; itemStatus: string }>;
  } | null>;
  currentTemplateVersions(templateIds: string[]): Promise<Map<string, number>>;
  transitionChangeSet(input: { id: string; from: string[]; to: string; idempotencyKey: string; reviewerId?: string; note?: string; approvedScope?: unknown }): Promise<{ id: string; status: string; replayed?: boolean }>;
  failChangeSet(id: string, errorCode: string, message: string): Promise<void>;
  saveActiveRules(input: { rules: GovernanceRuleSet; actorId: string }): Promise<{ id: string; version: number; rules: GovernanceRuleSet }>;
  refreshRunState(runId: string): Promise<void>;
};

export type GovernanceQueuePort = { enqueue(input: { type: 'template_governance_plan' | 'template_governance_apply' | 'template_governance_rollback'; targetId: string }): Promise<void> };

export class GovernanceService {
  constructor(private repository: GovernanceServiceRepository, private queue: GovernanceQueuePort) {}

  async createRun(input: { goal: string; scope: unknown; requestedBy: string; idempotencyKey: string; promptVersion?: string }) {
    const scope = governanceSelectionScopeSchema.parse(input.scope);
    const active = await this.repository.activeRules();
    const run = await this.repository.createRun({ ...input, promptVersion: input.promptVersion ?? active.rules.agent.promptVersion, scope, ruleSetId: active.id, ruleSetVersion: active.version });
    try {
      await this.queue.enqueue({ type: 'template_governance_plan', targetId: run.id });
    } catch (error) {
      const code = error instanceof GovernanceStateError ? error.code : 'QUEUE_UNAVAILABLE';
      const message = error instanceof Error ? error.message : 'Queue unavailable';
      await this.repository.failRun(run.id, code, message);
      if (error instanceof GovernanceStateError) throw error;
      throw new GovernanceStateError('QUEUE_UNAVAILABLE', '治理任务入队失败，运行已标记为失败');
    }
    return run;
  }

  async approve(input: { changeSetId: string; reviewerId: string; note: string; idempotencyKey: string; deleteConfirmation?: string }) {
    const changeSet = await this.repository.loadChangeSet(input.changeSetId);
    if (!changeSet) throw new GovernanceStateError('NOT_FOUND', 'Change set not found');
    if (changeSet.executionMode !== 'approval') throw new GovernanceStateError('INVALID_EXECUTION_MODE', 'Only approval change sets can be approved');
    const pending = changeSet.proposals.filter((proposal) => proposal.itemStatus === 'awaiting_approval');
    if (!pending.length) throw new GovernanceStateError('INVALID_CHANGE_SET_STATE', 'No proposals are awaiting approval');

    const active = await this.repository.activeRules();
    if (active.version !== changeSet.ruleSetVersion) throw new GovernanceStateError('RULE_SET_CHANGED', 'The active rule set changed; regenerate the plan');
    const versions = await this.repository.currentTemplateVersions(pending.map((proposal) => proposal.templateId));
    if (pending.some((proposal) => versions.get(proposal.templateId) !== proposal.baseVersion)) {
      throw new GovernanceStateError('VERSION_CONFLICT', '模板版本已变化，请基于最新版本重新生成计划');
    }
    const result = await this.repository.transitionChangeSet({
      id: changeSet.id,
      from: ['awaiting_approval'],
      to: 'approved',
      reviewerId: input.reviewerId,
      note: input.note,
      approvedScope: { proposalIds: pending.map((proposal) => proposal.id) },
      idempotencyKey: input.idempotencyKey,
    });
    if (result.replayed) return result;
    try {
      await this.queue.enqueue({ type: 'template_governance_apply', targetId: changeSet.id });
    } catch (error) {
      await this.repository.failChangeSet(changeSet.id, 'QUEUE_UNAVAILABLE', error instanceof Error ? error.message : 'Queue unavailable');
      throw new GovernanceStateError('QUEUE_UNAVAILABLE', 'Approval was recorded but execution could not be queued');
    }
    return result;
  }

  async reject(input: { changeSetId: string; reviewerId: string; note: string; idempotencyKey: string }) {
    const changeSet = await this.repository.loadChangeSet(input.changeSetId);
    if (!changeSet) throw new GovernanceStateError('NOT_FOUND', 'Change set not found');
    if (changeSet.executionMode !== 'approval') throw new GovernanceStateError('INVALID_EXECUTION_MODE', 'Only approval change sets can be rejected');
    return this.repository.transitionChangeSet({ id: input.changeSetId, from: ['awaiting_approval'], to: 'rejected', ...input });
  }

  async retry(input: { changeSetId: string; idempotencyKey: string }) {
    const result = await this.repository.transitionChangeSet({ id: input.changeSetId, from: ['failed', 'partially_succeeded'], to: 'auto_executing', idempotencyKey: input.idempotencyKey });
    if (result.replayed) return result;
    try {
      await this.queue.enqueue({ type: 'template_governance_apply', targetId: input.changeSetId });
    } catch (error) {
      await this.repository.failChangeSet(input.changeSetId, 'QUEUE_UNAVAILABLE', String(error));
      throw new GovernanceStateError('QUEUE_UNAVAILABLE', 'Retry could not be queued');
    }
    return result;
  }

  async rollback(input: { changeSetId: string; idempotencyKey: string }) {
    const result = await this.repository.transitionChangeSet({ id: input.changeSetId, from: ['succeeded', 'partially_succeeded', 'rollback_available'], to: 'rollback_available', idempotencyKey: input.idempotencyKey });
    if (result.replayed) return result;
    try {
      await this.queue.enqueue({ type: 'template_governance_rollback', targetId: input.changeSetId });
    } catch (error) {
      await this.repository.failChangeSet(input.changeSetId, 'QUEUE_UNAVAILABLE', String(error));
      throw new GovernanceStateError('QUEUE_UNAVAILABLE', 'Rollback could not be queued');
    }
    return result;
  }

  async updateRules(input: { rules: unknown; actorId: string }) {
    return this.repository.saveActiveRules({ rules: governanceRuleSetSchema.parse(input.rules), actorId: input.actorId });
  }
}
