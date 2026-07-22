# 模板治理运维手册

## 日常入口

- 管理工作台：`/admin/templates`
- 治理 API：`/api/admin/governance/*`
- 默认调度器 ID：`template-governance-default`
- 当前提示词版本：由活动规则集的 `agent.promptVersion` 决定

## 执行模型

一个 `AgentRun` 可以包含两个相互独立的变更集：

- `executionMode=automatic`：只包含无需审批的项目，规划完成后自动执行。
- `executionMode=approval`：只包含必须审批的项目，批准后才进入执行队列。
- `legacy_mixed`：仅用于标记迁移前的历史混合数据，禁止审批或执行，必须重新生成计划。

运行状态由所有子变更集和项目统一汇总。自动项已应用、审批项被拒绝时为 `partially_succeeded`；纯审批运行全部被拒绝时为 `cancelled`。不要直接修改运行状态。

## 审批、重试与回滚

- 发布、归档、删除、Prompt 骨架和变量修改必须审批。
- 删除审批必须输入“永久删除”并填写原因。
- 审批只校验仍在 `awaiting_approval` 的项目及其基础版本。
- `VERSION_CONFLICT` 或 `RULE_SET_CHANGED` 需要基于最新数据重新生成计划。
- 重试只处理 `failed` 项；版本冲突不应盲目重试。
- 回滚创建新的前向版本，不删除历史；超过 `rollbackUntil` 或存在后续人工版本时拒绝回滚。
- 回滚会恢复分类关联、产物类型、分类复核状态、发布时间和全部治理可变字段。
- 删除不可回滚。

## 删除与保留

产品删除采用墓碑：设置 `deleted_at`、`deleted_by` 和 `deletion_reason`。公开 API、管理列表、生成任务和治理扫描必须过滤墓碑模板，但 Proposal、ChangeSetItem、TemplateVersion 和 AuditEvent 保留。

物理清理只能由独立保留策略执行。清理前确认审计导出完整，并监控墓碑积压；禁止通过产品删除接口级联移除治理证据。

## 定时巡检

调度器使用 `template_governance_state` 记录 `last_scan_at` 与有期限租约，按“最久未扫描、更新时间、模板 ID”稳定选择。只有启用的分类词会暴露给 Agent。

租约异常时：

1. 确认对应 Worker 已停止或任务已终止。
2. 查询超过 15 分钟的 `lease_until`。
3. 仅清除确定失主的 `lease_until` 和 `lease_token`，保留 `last_scan_at`。
4. 将 `scanLimit` 暂时限制在 10 以内，观察三轮覆盖后再恢复。

## 幂等与队列诊断

HTTP 操作由 `governance_operation_idempotency` 保存唯一操作键和原响应。变更集执行通过原子 item claim 防止 BullMQ 重投重复写版本；超过 10 分钟的 `running` item 可由重投任务重新认领。

排障时核对：

- 同一操作键是否存在多种操作类型或目标。
- 幂等记录是否有空响应；长期空响应通常表示事务或数据库异常。
- 一个 Proposal 是否只关联一个 ChangeSetItem。
- 同一模板版本是否只存在一条 TemplateVersion。
- Worker 日志中的 `runId`、`changeSetId`、`proposalId`、`itemId` 和 `templateId` 是否一致。

不要记录 Prompt 全文、Provider 凭据或完整模型响应。

## 规则与模型变更

规则始终以新版本保存。模型必须处于启用状态，所属 Provider 必须启用，并同时具备 `text` 与 `structured_output` 能力；显式配置的非默认模型同样有效。

降低自动置信度、提高批量上限或调整精选策略前，先关闭定时巡检并用 3 至 5 个模板做人工 canary。历史运行继续引用原规则版本。

## 监控与告警

至少监控：

- 最老排队任务与 `queued` 数量；
- 最老审批等待时间；
- 运行耗时、失败率和冲突率；
- 自动/审批提案数及审批通过、拒绝率；
- 幂等重放和重复投递次数；
- 最老调度租约、每轮 eligible/leased/checked/skipped/failed 数；
- 回滚率与回滚冲突率；
- 队列计数与列表计数不一致；
- 墓碑物理清理积压。

## 发布顺序

1. 先部署 additive migration 和兼容读取，迁移期间关闭定时巡检。
2. 部署 API 与 Worker 的拆分批次和执行器。
3. 由 owner 对 3 至 5 个模板执行人工 canary。
4. 首个 24 小时保持 `scanLimit <= 10`。
5. 检查冲突、拒绝、重复投递、租约和回滚结果后再提高扫描上限。

发生故障时先停止 Worker 写入，保留数据库与队列证据，再按运行、变更集、项目和审计事件逐层核对；不要手工伪造终态。
