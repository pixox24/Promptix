import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  AdminModel,
  ModelCapability,
  ProviderAdapter,
  ProviderConnection,
} from '../../types/adminModels';

const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100';
const button = 'rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50';
const capabilities: ModelCapability[] = ['text', 'structured_output', 'vision', 'image'];

type ProviderForm = {
  name: string;
  adapterType: ProviderAdapter;
  baseUrl: string;
  apiKeyEnv: string;
  authStyle: 'bearer' | 'header';
  enabled: boolean;
};

type ModelForm = {
  providerId: string;
  name: string;
  modelId: string;
  capabilities: ModelCapability[];
  defaultsText: string;
  enabled: boolean;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};

const blankProvider = (): ProviderForm => ({
  name: '',
  adapterType: 'openai_compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyEnv: 'LLM_API_KEY',
  authStyle: 'bearer',
  enabled: true,
});

const blankModel = (): ModelForm => ({
  providerId: '',
  name: '',
  modelId: '',
  capabilities: ['text', 'structured_output'],
  defaultsText: '{}',
  enabled: true,
  isDefaultText: false,
  isDefaultVision: false,
  isDefaultImage: false,
});

export function ProviderModelsPage() {
  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(blankProvider);
  const [modelForm, setModelForm] = useState<ModelForm>(blankModel);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [providerRows, modelRows] = await Promise.all([
      api<ProviderConnection[]>('/api/admin/providers'),
      api<AdminModel[]>('/api/admin/models'),
    ]);
    setProviders(providerRows);
    setModels(modelRows);
    setModelForm((current) => current.providerId || !providerRows[0]
      ? current
      : { ...current, providerId: providerRows[0].id });
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : '配置加载失败'));
  }, [load]);

  function toggleCapability(capability: ModelCapability) {
    setModelForm((current) => ({
      ...current,
      capabilities: current.capabilities.includes(capability)
        ? current.capabilities.filter((item) => item !== capability)
        : [...current.capabilities, capability],
    }));
  }

  function loadDeepSeekPreset() {
    setProviderForm({
      name: 'DeepSeek',
      adapterType: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      authStyle: 'bearer',
      enabled: true,
    });
    setModelForm({
      ...blankModel(),
      name: 'DeepSeek V4 Pro',
      modelId: 'deepseek-v4-pro',
      capabilities: ['text', 'structured_output'],
      defaultsText: JSON.stringify({
        maxOutputTokens: 4096,
        providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
      }, null, 2),
      isDefaultText: true,
    });
    setMessage('已载入 DeepSeek 连接和模型预设；先保存 Provider，再保存 Model');
  }

  function loadAsyncImagePreset() {
    setProviderForm({
      name: '65535 Images',
      adapterType: 'custom_65535_async',
      baseUrl: 'https://img-cn.65535.space/v1',
      apiKeyEnv: 'IMAGE_65535_API_KEY',
      authStyle: 'bearer',
      enabled: true,
    });
    setModelForm({
      ...blankModel(),
      name: '65535 gpt-image-2',
      modelId: 'gpt-image-2',
      capabilities: ['image'],
      defaultsText: JSON.stringify({
        image: { size: '2048x2048', n: 1 },
        async: {
          quality: 'high',
          responseFormat: 'url',
          pollIntervalMs: 2000,
          timeoutMs: 900000,
          maxQueueSeconds: 120,
        },
      }, null, 2),
      isDefaultImage: true,
    });
    setMessage('已载入 65535 连接和模型预设；先保存 Provider，再保存 Model');
  }

  async function saveProvider() {
    setBusy(true);
    setMessage('');
    try {
      const created = await api<ProviderConnection>('/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify({
          ...providerForm,
          apiKeyEnv: providerForm.apiKeyEnv || null,
        }),
      });
      setModelForm((current) => ({ ...current, providerId: created.id }));
      setMessage(`Provider ${created.name} 已保存；现在可以保存 Model`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Provider 保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function saveModel() {
    setBusy(true);
    setMessage('');
    try {
      const defaults = JSON.parse(modelForm.defaultsText) as unknown;
      if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
        throw new Error('Model defaults 必须是 JSON object');
      }
      await api('/api/admin/models', {
        method: 'POST',
        body: JSON.stringify({
          ...modelForm,
          defaults,
          defaultsText: undefined,
        }),
      });
      setMessage('Model 已保存');
      setModelForm((current) => ({ ...blankModel(), providerId: current.providerId }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Model 保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function setModelEnabled(model: AdminModel, enabled: boolean) {
    try {
      await api(`/api/admin/models/${model.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Model 状态更新失败');
    }
  }

  async function removeModel(model: AdminModel) {
    if (!window.confirm(`确认删除 Model：${model.name}？`)) return;
    try {
      await api(`/api/admin/models/${model.id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Model 删除失败');
    }
  }

  async function setDefaultRole(model: AdminModel, role: 'text' | 'vision' | 'image') {
    const patch = role === 'text'
      ? { isDefaultText: true }
      : role === 'vision'
        ? { isDefaultVision: true }
        : { isDefaultImage: true };
    try {
      await api(`/api/admin/models/${model.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await load();
      setMessage(`${model.name} 已设为默认${role}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '默认用途更新失败');
    }
  }

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Operations</p>
        <h1 className="mt-1 text-2xl font-semibold">Providers & Models</h1>
      </div>
      <div className="flex gap-2">
        <button className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700" onClick={loadDeepSeekPreset}>DeepSeek 预设</button>
        <button className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700" onClick={loadAsyncImagePreset}>65535 预设</button>
      </div>
    </div>

    {message && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">新增 Provider 连接</h2>
        <label className="block text-sm">名称<input className={`${field} mt-1`} value={providerForm.name} onChange={(e) => setProviderForm((v) => ({ ...v, name: e.target.value }))}/></label>
        <label className="block text-sm">Adapter<select className={`${field} mt-1`} value={providerForm.adapterType} onChange={(e) => setProviderForm((v) => ({ ...v, adapterType: e.target.value as ProviderAdapter }))}>
          <option value="openai_compatible">OpenAI-compatible</option>
          <option value="openai">OpenAI native</option>
          <option value="anthropic">Anthropic native</option>
          <option value="google">Google native</option>
          <option value="deepseek">DeepSeek native</option>
          <option value="custom_65535_async">65535 async images</option>
        </select></label>
        <label className="block text-sm">Base URL<input className={`${field} mt-1`} value={providerForm.baseUrl} onChange={(e) => setProviderForm((v) => ({ ...v, baseUrl: e.target.value }))}/></label>
        <label className="block text-sm">密钥环境变量名<input className={`${field} mt-1`} value={providerForm.apiKeyEnv} onChange={(e) => setProviderForm((v) => ({ ...v, apiKeyEnv: e.target.value }))}/></label>
        <label className="block text-sm">认证方式<select className={`${field} mt-1`} value={providerForm.authStyle} onChange={(e) => setProviderForm((v) => ({ ...v, authStyle: e.target.value as 'bearer' | 'header' }))}><option value="bearer">Bearer</option><option value="header">X-API-Key</option></select></label>
        <button className={`${button} w-full`} disabled={busy || !providerForm.name || !providerForm.baseUrl} onClick={saveProvider}>保存 Provider</button>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">新增 Model</h2>
        <label className="block text-sm">所属 Provider<select className={`${field} mt-1`} value={modelForm.providerId} onChange={(e) => setModelForm((v) => ({ ...v, providerId: e.target.value }))}><option value="">请选择</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">显示名称<input className={`${field} mt-1`} value={modelForm.name} onChange={(e) => setModelForm((v) => ({ ...v, name: e.target.value }))}/></label>
          <label className="block text-sm">厂商 Model ID<input className={`${field} mt-1`} value={modelForm.modelId} onChange={(e) => setModelForm((v) => ({ ...v, modelId: e.target.value }))}/></label>
        </div>
        <div><p className="mb-2 text-sm">Capabilities</p><div className="flex flex-wrap gap-3">{capabilities.map((cap) => <label key={cap} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.capabilities.includes(cap)} onChange={() => toggleCapability(cap)}/>{cap}</label>)}</div></div>
        <div><p className="mb-2 text-sm">默认用途</p><div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultText} onChange={(e) => setModelForm((v) => ({ ...v, isDefaultText: e.target.checked }))}/>文本结构化</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultVision} onChange={(e) => setModelForm((v) => ({ ...v, isDefaultVision: e.target.checked }))}/>视觉分析</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultImage} onChange={(e) => setModelForm((v) => ({ ...v, isDefaultImage: e.target.checked }))}/>图片生成</label>
        </div></div>
        <label className="block text-sm">Defaults JSON<textarea className={`${field} mt-1 min-h-52 font-mono text-xs`} value={modelForm.defaultsText} onChange={(e) => setModelForm((v) => ({ ...v, defaultsText: e.target.value }))}/></label>
        <button className={`${button} w-full`} disabled={busy || !modelForm.providerId || !modelForm.name || !modelForm.modelId || modelForm.capabilities.length === 0} onClick={saveModel}>保存 Model</button>
      </section>
    </div>

    <section className="mt-6 space-y-4">
      {providers.map((provider) => <div key={provider.id} className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{provider.name}</h2><p className="mt-1 text-xs text-gray-500">{provider.adapterType} · {provider.baseUrl}</p></div><span className={`rounded-full px-2 py-1 text-xs ${provider.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{provider.enabled ? 'enabled' : 'disabled'} · key {provider.apiKeyConfigured ? '✓' : '未配置'}</span></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{models.filter((m) => m.providerId === provider.id).map((model) => <div key={model.id} className="rounded-lg border bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3"><div><b className="text-sm">{model.name}</b><p className="mt-1 font-mono text-xs text-gray-500">{model.modelId}</p></div><div className="flex gap-2"><button className="text-xs text-violet-600" onClick={() => setModelEnabled(model, !model.enabled)}>{model.enabled ? '停用' : '启用'}</button><button className="text-xs text-red-600" onClick={() => removeModel(model)}>删除</button></div></div>
          <p className="mt-3 text-xs text-gray-500">{model.capabilities.join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">{model.isDefaultText && <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">默认文本</span>}{model.isDefaultVision && <span className="rounded bg-cyan-100 px-2 py-1 text-cyan-700">默认视觉</span>}{model.isDefaultImage && <span className="rounded bg-violet-100 px-2 py-1 text-violet-700">默认生图</span>}</div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">{model.capabilities.includes('text') && model.capabilities.includes('structured_output') && !model.isDefaultText && <button className="text-blue-600" onClick={() => setDefaultRole(model, 'text')}>设为默认文本</button>}{model.capabilities.includes('vision') && !model.isDefaultVision && <button className="text-cyan-600" onClick={() => setDefaultRole(model, 'vision')}>设为默认视觉</button>}{model.capabilities.includes('image') && !model.isDefaultImage && <button className="text-violet-600" onClick={() => setDefaultRole(model, 'image')}>设为默认生图</button>}</div>
        </div>)}</div>
      </div>)}
    </section>
  </>;
}
