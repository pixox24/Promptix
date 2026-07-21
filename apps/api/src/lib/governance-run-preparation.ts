import { eq, inArray } from 'drizzle-orm';
import {
  governanceRuleSetSchema,
  governanceSelectionScopeSchema,
  modelCapabilitySchema,
  templateVersionSnapshotSchema,
  type GovernanceTemplateQuery,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import {
  agentRuns,
  governanceRuleSets,
  providerModels,
  providers,
  promptTemplates,
  taxonomyTerms,
  templateVersions,
} from '../db/schema.js';
import { search_templates } from './governance-tools.js';

export class GovernancePreparationError extends Error {
  constructor(public code: 'MODEL_NOT_CONFIGURED' | 'RULE_SET_INVALID' | 'SCOPE_INVALID' | 'SNAPSHOT_MISSING' | 'SNAPSHOT_STALE' | 'SNAPSHOT_INVALID', message: string) {
    super(message);
  }
}

export function capturedGovernanceQuery(query: GovernanceTemplateQuery, snapshotAt: string): GovernanceTemplateQuery {
  const captured = new Date(snapshotAt).toISOString();
  if (!query.updatedBefore || new Date(query.updatedBefore) > new Date(captured)) return { ...query, updatedBefore: captured };
  return query;
}

export async function prepareGovernanceRun(runId: string) {
  const db = getDb();
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run) throw new GovernancePreparationError('SNAPSHOT_MISSING', '治理运行不存在');

  const [ruleSet] = await db.select().from(governanceRuleSets).where(eq(governanceRuleSets.id, run.ruleSetId)).limit(1);
  const rulesResult = governanceRuleSetSchema.safeParse(ruleSet?.rules);
  if (!ruleSet || !rulesResult.success) throw new GovernancePreparationError('RULE_SET_INVALID', '治理规则缺失或格式无效');

  const models = await db.select({ model: providerModels, provider: providers }).from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(eq(providerModels.isDefaultText, true)).limit(20);
  const selected = rulesResult.data.agent.modelId
    ? models.find(({ model }) => model.id === rulesResult.data.agent.modelId)
    : models.find(({ model, provider }) => model.enabled && provider.enabled
    && modelCapabilitySchema.array().safeParse(model.capabilities).success
    && modelCapabilitySchema.array().parse(model.capabilities).includes('structured_output'));
  if (!selected || !selected.model.enabled || !selected.provider.enabled
    || !modelCapabilitySchema.array().safeParse(selected.model.capabilities).success
    || !modelCapabilitySchema.array().parse(selected.model.capabilities).includes('structured_output')) {
    throw new GovernancePreparationError('MODEL_NOT_CONFIGURED', '未配置已启用且支持结构化输出的 Agent 文本模型');
  }

  const scopeResult = governanceSelectionScopeSchema.safeParse(run.scope);
  if (!scopeResult.success) throw new GovernancePreparationError('SCOPE_INVALID', '治理运行范围格式无效');
  const scope = scopeResult.data;
  const templateIds = scope.mode === 'explicit'
    ? scope.templateIds
    : (await search_templates({
      query: capturedGovernanceQuery(scope.query, scope.snapshotAt),
      pageSize: rulesResult.data.schedule.scanLimit,
    })).items.map((item) => item.id).filter((id) => !scope.exclusions.includes(id));

  const versions = templateIds.length
    ? await db.select().from(templateVersions).where(inArray(templateVersions.templateId, templateIds))
    : [];
  const templates = templateIds.length
    ? await db.select({ id: promptTemplates.id, currentVersion: promptTemplates.currentVersion }).from(promptTemplates).where(inArray(promptTemplates.id, templateIds))
    : [];
  const snapshots = templateIds.map((templateId) => {
    const current = versions.filter((row) => row.templateId === templateId).sort((a, b) => b.version - a.version)[0];
    if (!current) throw new GovernancePreparationError('SNAPSHOT_MISSING', `模板 ${templateId} 缺少版本快照，请先执行数据库迁移`);
    const template = templates.find((row) => row.id === templateId);
    if (!template) throw new GovernancePreparationError('SNAPSHOT_MISSING', `模板 ${templateId} 不存在或已被删除`);
    if (current.version !== template.currentVersion) throw new GovernancePreparationError('SNAPSHOT_STALE', `模板 ${templateId} 的快照版本落后于当前版本`);
    const parsed = templateVersionSnapshotSchema.safeParse(current.snapshot);
    if (!parsed.success) throw new GovernancePreparationError('SNAPSHOT_INVALID', `模板 ${templateId} 的版本快照格式无效`);
    return parsed.data;
  });
  const taxonomyCatalog = await db.select({ slug: taxonomyTerms.slug }).from(taxonomyTerms).where(eq(taxonomyTerms.enabled, true));
  return {
    run,
    ruleSet,
    rules: rulesResult.data,
    model: selected.model,
    provider: selected.provider,
    input: {
      targetId: run.id,
      goal: run.goal,
      promptVersion: rulesResult.data.agent.promptVersion,
      systemPrompt: rulesResult.data.agent.systemPrompt,
      snapshots,
      taxonomyCatalog,
      rules: rulesResult.data,
    },
  };
}
