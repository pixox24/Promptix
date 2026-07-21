import { useEffect, useState } from 'react';
import { fetchGovernanceAgentConfig, saveGovernanceAgentConfig, type GovernanceAgentConfig, type GovernanceAgentModel } from '../../data/templateGovernanceApi';

const fallback: GovernanceAgentConfig = { modelId: null, promptVersion: 'template-governance-v1', systemPrompt: '' };

export function AgentSettingsPage({ canManage = false }: { canManage?: boolean }) {
  const [config, setConfig] = useState<GovernanceAgentConfig>(fallback);
  const [models, setModels] = useState<GovernanceAgentModel[]>([]);
  const [defaultVersion, setDefaultVersion] = useState('template-governance-v1');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchGovernanceAgentConfig().then((value) => { setConfig(value.config); setModels(value.models); setDefaultVersion(value.defaultPromptVersion); }).catch((error) => setStatus(error instanceof Error ? error.message : '加载失败')); }, []);
  async function save() {
    setBusy(true); setStatus('');
    try { const result = await saveGovernanceAgentConfig(config); setConfig(result.config); setStatus(`Agent 配置已保存为规则版本 v${result.version}`); }
    catch (error) { setStatus(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-3xl space-y-6">
    <header><h1 className="text-2xl font-semibold">Agent 设置</h1><p className="mt-1 text-sm text-slate-500">配置模板治理使用的模型和系统提示词。每次运行都会冻结当前配置。</p></header>
    <div className="space-y-5 rounded-lg border bg-white p-5 shadow-sm sm:p-6">
      {!canManage && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">当前账号为只读治理角色，只有 owner 可以修改 Agent 配置。</p>}
      <label className="block text-sm font-medium">结构化文本模型<select disabled={!canManage} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50" value={config.modelId ?? ''} onChange={(event) => setConfig({ ...config, modelId: event.target.value || null })}><option value="">使用默认模型</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.modelId}</option>)}</select><span className="mt-1 block text-xs text-slate-500">只展示启用且支持 text + structured_output 的模型。</span></label>
      <label className="block text-sm font-medium">Prompt 版本<input disabled={!canManage} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50" value={config.promptVersion} onChange={(event) => setConfig({ ...config, promptVersion: event.target.value })}/><span className="mt-1 block text-xs text-slate-500">内置版本：{defaultVersion}。修改后会显示在运行记录中。</span></label>
      <label className="block text-sm font-medium">系统提示词<textarea disabled={!canManage} className="mt-2 min-h-64 w-full rounded-lg border px-3 py-2 text-sm leading-6 disabled:bg-slate-50" value={config.systemPrompt} onChange={(event) => setConfig({ ...config, systemPrompt: event.target.value })} placeholder="留空使用内置治理系统提示词"/><span className="mt-1 block text-xs text-slate-500">留空使用内置提示词；自定义内容会随规则版本保存并冻结到后续运行。</span></label>
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">保存会生成新的治理规则版本，不影响已排队运行。</p>{canManage && <button type="button" disabled={busy} onClick={save} className="w-full whitespace-nowrap rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto">{busy ? '保存中…' : '保存 Agent 配置'}</button>}</div>
      {status && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{status}</p>}
    </div>
  </section>;
}
