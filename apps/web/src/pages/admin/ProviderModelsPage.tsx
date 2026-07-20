import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type {
  AdminModel,
  ModelCapability,
  ProviderAdapter,
  ProviderConnection,
  ProviderTextTestJob,
} from '../../types/adminModels';
import {
  eligibleProviderTextModels,
  initialProviderTextTestModelId,
  isProviderTextTestPending,
  providerTextTestStatusAnnouncement,
} from '../../lib/provider-text-test-ui';
import { useToast } from '../../context/ToastContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { ModelSelector } from '../../components/admin/ModelSelector';

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

function providerKey(value: Pick<ProviderConnection, 'adapterType' | 'baseUrl' | 'apiKeyEnv' | 'authStyle'>) {
  return [value.adapterType, value.baseUrl.trim().replace(/\/+$/, '').toLowerCase(), (value.apiKeyEnv ?? '').trim().toUpperCase(), value.authStyle].join('|');
}

export function ProviderModelsPage() {
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(blankProvider);
  const [modelForm, setModelForm] = useState<ModelForm>(blankModel);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [testProvider, setTestProvider] = useState<ProviderConnection | null>(null);
  const [selectedTestModelId, setSelectedTestModelId] = useState('');
  const [providerTestJob, setProviderTestJob] = useState<ProviderTextTestJob | null>(null);
  const [providerTestSubmitting, setProviderTestSubmitting] = useState(false);
  const [testMode, setTestMode] = useState<'text'|'image'>('text');
  const [discoveredModels, setDiscoveredModels] = useState<Array<{id:string;name:string;capabilities:ModelCapability[]}>>([]);
  const [discovering, setDiscovering] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const testDialogRef = useRef<HTMLDialogElement>(null);
  const testModels = testProvider ? (testMode==='text' ? eligibleProviderTextModels(testProvider, models) : models.filter((model)=>model.providerId===testProvider.id&&model.providerEnabled&&model.enabled&&model.capabilities.includes('image'))) : [];
  const selectedTestModel = testModels.find((model) => model.id === selectedTestModelId);
  const providerTestStatus = providerTestSubmitting
    ? 'Creating connection test.'
    : providerTextTestStatusAnnouncement(providerTestJob?.status ?? null, providerTestJob?.errorMessage);

  const load = useCallback(async () => {
    const [providerRows, modelRows] = await Promise.all([
      api<ProviderConnection[]>('/api/admin/providers'),
      api<AdminModel[]>('/api/admin/models'),
    ]);
    const uniqueProviders = Array.from(new Map(providerRows.map((provider) => [providerKey(provider), provider])).values());
    setProviders(uniqueProviders);
    setModels(modelRows);
    setModelForm((current) => current.providerId || !uniqueProviders[0]
      ? current
      : { ...current, providerId: uniqueProviders[0].id });
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : '配置加载失败'));
  }, [load]);
  useEffect(()=>{if(!message)return;const error=/失败|错误|不能|未配置|不存在/.test(message);toast(message,error?'error':message.includes('未')?'warning':'success');setMessage('')},[message,toast]);

  useEffect(() => {
    const dialog = testDialogRef.current;
    if (!testProvider || !dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLSelectElement>('select')?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [testProvider]);

  useEffect(() => {
    if (!providerTestJob || !isProviderTextTestPending(providerTestJob.status)) return;

    let disposed = false;
    const refresh = async () => {
      try {
        const nextJob = await api<ProviderTextTestJob>(`/api/admin/jobs/${providerTestJob.id}`);
        if (!disposed) setProviderTestJob(nextJob);
      } catch {
        if (!disposed) {
          setProviderTestJob((current) => current && {
            ...current,
            status: 'failed',
            errorMessage: 'Unable to retrieve test status. See Task Center for details.',
          });
        }
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 1500);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [providerTestJob?.id, providerTestJob?.status]);

  function openProviderTest(provider: ProviderConnection) {
    const eligibleModels = eligibleProviderTextModels(provider, models);
    const imageModels=models.filter((model)=>model.providerId===provider.id&&model.providerEnabled&&model.enabled&&model.capabilities.includes('image'));
    const mode=eligibleModels.length?'text':'image'; const candidates=mode==='text'?eligibleModels:imageModels;
    if (candidates.length === 0) {
      setMessage('请先添加并启用可测试的文本或图片 Model');
      return;
    }
    setTestMode(mode);
    setTestProvider(provider);
    setSelectedTestModelId(mode==='text'?initialProviderTextTestModelId(eligibleModels):candidates[0]!.id);
    setProviderTestJob(null);
    setProviderTestSubmitting(false);
  }

  function closeProviderTest() {
    if (providerTestSubmitting || (providerTestJob && isProviderTextTestPending(providerTestJob.status))) return;
    setTestProvider(null);
    setSelectedTestModelId('');
    setProviderTestJob(null);
  }

  async function submitProviderTest() {
    if (!testProvider || !selectedTestModelId || providerTestSubmitting
      || (providerTestJob && isProviderTextTestPending(providerTestJob.status))) return;

    setProviderTestSubmitting(true);
    setProviderTestJob(null);
    try {
      const created = testMode==='text'
        ? await api<{ jobId: string; status: 'queued' }>(`/api/admin/providers/${testProvider.id}/test`,{ method: 'POST', body: JSON.stringify({ modelId: selectedTestModelId }) })
        : await api<{ jobId: string; status: 'queued' }>('/api/admin/jobs',{method:'POST',body:JSON.stringify({type:'image_generate',modelId:selectedTestModelId,input:{prompt:'minimal black circle centered on a white background',n:1,size:'1024x1024'}})});
      setProviderTestJob({
        id: created.jobId,
        status: created.status,
        modelId: selectedTestModelId,
      });
    } catch (error) {
      setProviderTestJob({
        id: '',
        status: 'failed',
        modelId: selectedTestModelId,
        errorMessage: error instanceof Error ? error.message : 'Unable to start the connection test.',
      });
    } finally {
      setProviderTestSubmitting(false);
    }
  }

  function toggleCapability(capability: ModelCapability) {
    setModelForm((current) => ({
      ...current,
      capabilities: current.capabilities.includes(capability)
        ? current.capabilities.filter((item) => item !== capability)
        : [...current.capabilities, capability],
    }));
  }

  async function discoverModels() {
    if (!modelForm.providerId) return;
    setDiscovering(true); setMessage('');
    try {
      const rows = await api<Array<{id:string;name:string;capabilities:ModelCapability[]}>>(`/api/admin/providers/${modelForm.providerId}/models`);
      setDiscoveredModels(rows);
      if (!rows.length) setMessage('厂商未返回可用模型，请手动输入 Model ID');
    } catch (error) {
      setDiscoveredModels([]);
      setMessage(error instanceof Error ? error.message : '模型拉取失败，可手动输入 Model ID');
    } finally { setDiscovering(false); }
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
      if (providers.some((provider) => providerKey(provider) === providerKey(providerForm))) {
        setMessage('相同的 Provider 连接已经存在，未重复新增；已选中已有 Provider。');
        const existing = providers.find((provider) => providerKey(provider) === providerKey(providerForm));
        if (existing) setModelForm((current) => ({ ...current, providerId: existing.id }));
        return;
      }
      const created = await api<ProviderConnection>(editingProviderId ? `/api/admin/providers/${editingProviderId}` : '/api/admin/providers', {
        method: editingProviderId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...providerForm,
          apiKeyEnv: providerForm.apiKeyEnv || null,
        }),
      });
      setModelForm((current) => ({ ...current, providerId: created.id }));
      setEditingProviderId(null);
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
      await api(editingModelId ? `/api/admin/models/${editingModelId}` : '/api/admin/models', {
        method: editingModelId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...modelForm,
          defaults,
          defaultsText: undefined,
        }),
      });
      setEditingModelId(null);
      setMessage('Model 已保存');
      setModelForm((current) => ({ ...blankModel(), providerId: current.providerId }));
      await load();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'MODEL_ALREADY_EXISTS') {
        const existing = models.find((item) => item.providerId === modelForm.providerId && item.modelId.trim().toLowerCase() === modelForm.modelId.trim().toLowerCase());
        if (existing) { editModel(existing); setMessage(`已找到已有 Model「${existing.name}」，已加载到编辑表单`); }
        else setMessage('该 Provider 已存在相同 Model ID，请编辑已有配置');
      } else setMessage(error instanceof Error ? error.message : 'Model 保存失败');
    } finally {
      setBusy(false);
    }
  }

  function editProvider(provider: ProviderConnection) {
    setEditingProviderId(provider.id);
    setProviderForm({ name: provider.name, adapterType: provider.adapterType, baseUrl: provider.baseUrl, apiKeyEnv: provider.apiKeyEnv ?? '', authStyle: provider.authStyle, enabled: provider.enabled });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editModel(model: AdminModel) {
    setEditingModelId(model.id);
    setModelForm({ providerId: model.providerId, name: model.name, modelId: model.modelId, capabilities: model.capabilities, defaultsText: JSON.stringify(model.defaults ?? {}, null, 2), enabled: model.enabled, isDefaultText: model.isDefaultText, isDefaultVision: model.isDefaultVision, isDefaultImage: model.isDefaultImage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (!await confirm({title:'永久删除 Model？',description:`${model.name} 将被永久删除。\n历史任务会解除模型关联，且无法直接重试。`,confirmLabel:'永久删除',danger:true})) return;
    try {
      await api(`/api/admin/models/${model.id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setMessage(code === 'DEFAULT_MODEL_DELETE_FORBIDDEN'
        ? '该模型仍是默认模型，请先为对应角色设置其他默认模型。'
        : error instanceof Error ? error.message : 'Model 永久删除失败');
    }
  }

  async function removeProvider(provider: ProviderConnection) {
    const ownedModels = models.filter((model) => model.providerId === provider.id);
    if (ownedModels.length > 0) {
      setMessage(`Provider「${provider.name}」仍包含 ${ownedModels.length} 个 Model，请先处理这些 Model。`);
      return;
    }
    if (!await confirm({title:'删除未完成的 Provider？',description:`${provider.name} 尚未配置 Model。删除后连接配置无法恢复。`,confirmLabel:'删除 Provider',danger:true})) return;
    try {
      await api(`/api/admin/providers/${provider.id}`, { method: 'DELETE' });
      setMessage(`Provider ${provider.name} 已删除`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Provider 删除失败');
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
        <button className={`${button} w-full`} disabled={busy || !providerForm.name || !providerForm.baseUrl} onClick={saveProvider}>{editingProviderId ? '保存 Provider 修改' : '保存 Provider'}</button>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">新增 Model</h2>
        <label className="block text-sm">所属 Provider<select className={`${field} mt-1`} value={modelForm.providerId} onChange={(e) => { setModelForm((v) => ({ ...v, providerId: e.target.value })); setDiscoveredModels([]); }}><option value="">请选择</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">显示名称<input className={`${field} mt-1`} value={modelForm.name} onChange={(e) => setModelForm((v) => ({ ...v, name: e.target.value }))}/></label>
          <label className="block text-sm">厂商 Model ID<div className="mt-1 flex gap-2"><input className={field} value={modelForm.modelId} onChange={(e) => setModelForm((v) => ({ ...v, modelId: e.target.value }))}/><button type="button" className="shrink-0 rounded-lg border px-3 text-xs" disabled={!modelForm.providerId || discovering} onClick={discoverModels}>{discovering ? '拉取中…' : '拉取模型'}</button></div></label>
        </div>
        {discoveredModels.length > 0 && <label className="block text-sm">选择拉取结果<select className={`${field} mt-1`} value="" onChange={(e) => { const item = discoveredModels.find((row) => row.id === e.target.value); if (item) setModelForm((v) => ({ ...v, modelId: item.id, name: item.name, capabilities: item.capabilities })); }}><option value="">请选择模型以自动填充</option>{discoveredModels.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label>}
        <div><p className="mb-2 text-sm">Capabilities</p><div className="flex flex-wrap gap-3">{capabilities.map((cap) => <label key={cap} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.capabilities.includes(cap)} onChange={() => toggleCapability(cap)}/>{cap}</label>)}</div></div>
        <div><p className="mb-2 text-sm">默认用途</p><div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultText} onChange={(e) => setModelForm((v) => ({ ...v, isDefaultText: e.target.checked }))}/>文本结构化</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultVision} onChange={(e) => setModelForm((v) => ({ ...v, isDefaultVision: e.target.checked }))}/>视觉分析</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelForm.isDefaultImage} onChange={(e) => setModelForm((v) => ({ ...v, isDefaultImage: e.target.checked }))}/>图片生成</label>
        </div></div>
        <label className="block text-sm">Defaults JSON<textarea className={`${field} mt-1 min-h-52 font-mono text-xs`} value={modelForm.defaultsText} onChange={(e) => setModelForm((v) => ({ ...v, defaultsText: e.target.value }))}/></label>
        <button className={`${button} w-full`} disabled={busy || !modelForm.providerId || !modelForm.name || !modelForm.modelId || modelForm.capabilities.length === 0} onClick={saveModel}>{editingModelId ? '保存 Model 修改' : '保存 Model'}</button>
      </section>
    </div>

    <section className="mt-6 space-y-4">
      {providers.map((provider) => { const ownedModels = models.filter((model) => model.providerId === provider.id); const ready = ownedModels.length > 0; return <div key={provider.id} className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{provider.name}</h2>{!ready&&<span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-700">配置未完成</span>}</div><p className="mt-1 text-xs text-gray-500">{provider.adapterType} · {provider.baseUrl}</p></div><span className={`rounded-full px-2 py-1 text-xs ${provider.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{provider.enabled ? 'enabled' : 'disabled'} · key {provider.apiKeyConfigured ? '✓' : '未配置'}</span></div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => editProvider(provider)}>编辑 Provider</button>
          <button
            type="button"
            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
            onClick={() => openProviderTest(provider)} disabled={!ready}
          >
            Test connection
          </button>
          {!ready && <button type="button" className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600" onClick={() => removeProvider(provider)}>删除 Provider</button>}
        </div>
        {!ready&&<p className="mt-4 text-sm text-gray-500">尚未添加 Model。可以继续编辑连接、拉取模型，或删除此 Provider。</p>}<div className="mt-4 grid gap-3 lg:grid-cols-2">{ownedModels.map((model) => <div key={model.id} className="rounded-lg border bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3"><div><b className="text-sm">{model.name}</b><p className="mt-1 font-mono text-xs text-gray-500">{model.modelId}</p></div><div className="flex gap-2"><button className="text-xs text-blue-600" onClick={() => editModel(model)}>编辑</button><button className="text-xs text-violet-600" onClick={() => setModelEnabled(model, !model.enabled)}>{model.enabled ? '归档' : '恢复归档'}</button><button className="text-xs text-red-600" onClick={() => removeModel(model)}>永久删除</button></div></div>
          <p className="mt-3 text-xs text-gray-500">{model.capabilities.join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">{model.isDefaultText && <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">默认文本</span>}{model.isDefaultVision && <span className="rounded bg-cyan-100 px-2 py-1 text-cyan-700">默认视觉</span>}{model.isDefaultImage && <span className="rounded bg-violet-100 px-2 py-1 text-violet-700">默认生图</span>}</div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">{model.capabilities.includes('text') && model.capabilities.includes('structured_output') && !model.isDefaultText && <button className="text-blue-600" onClick={() => setDefaultRole(model, 'text')}>设为默认文本</button>}{model.capabilities.includes('vision') && !model.isDefaultVision && <button className="text-cyan-600" onClick={() => setDefaultRole(model, 'vision')}>设为默认视觉</button>}{model.capabilities.includes('image') && !model.isDefaultImage && <button className="text-violet-600" onClick={() => setDefaultRole(model, 'image')}>设为默认生图</button>}</div>
        </div>)}</div>
      </div>})}
    </section>

    {testProvider && <dialog
        ref={testDialogRef}
        aria-labelledby="provider-text-test-title"
        onCancel={(event) => {
          event.preventDefault();
          closeProviderTest();
        }}
        className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-lg rounded-xl border-0 bg-white p-6 shadow-xl backdrop:bg-gray-950/40"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="provider-text-test-title" className="text-lg font-semibold">{testMode==='text'?'文本连接测试':'图片生成测试'}</h2>
            <p className="mt-1 text-sm text-gray-600">{testProvider.name}</p>
          </div>
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50"
            onClick={closeProviderTest}
            disabled={providerTestSubmitting || Boolean(providerTestJob && isProviderTextTestPending(providerTestJob.status))}
          >
            Close
          </button>
        </div>

        <p className="mt-4 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
          {testMode==='text'?'发送一次固定的低成本文本请求（最多 16 tokens）。':'发送一次 1024x1024 最小测试图片请求，此操作可能产生少量费用。'}
        </p>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{providerTestStatus}</p>

        <label className="mt-4 block text-sm font-medium text-gray-700">
          {testMode==='text'?'文本 Model':'图片 Model'}
          <div className="mt-1"><ModelSelector models={testModels} value={selectedTestModelId} onChange={setSelectedTestModelId} role={testMode === 'text' ? 'text' : 'image'} disabled={providerTestSubmitting || Boolean(providerTestJob && isProviderTextTestPending(providerTestJob.status))} onModelsUpdated={setModels} /></div>
        </label>

        {providerTestSubmitting && <p className="mt-4 text-sm text-gray-600">Creating connection test…</p>}
        {providerTestJob && <div className="mt-4 rounded-lg border border-gray-200 p-3 text-sm">
          {isProviderTextTestPending(providerTestJob.status) && <p className="text-gray-700">
            Connection test {providerTestJob.status}…
          </p>}
          {providerTestJob.status === 'succeeded' && <div className="space-y-1 text-emerald-700">
            <p>{testMode==='text'?'连接和文本调用成功。':'连接和图片生成调用成功。'}</p>
            <p>Model: {selectedTestModel?.name ?? 'Selected model'}</p>
            {testMode==='text'&&<p>Latency: {typeof providerTestJob.output?.latencyMs === 'number'
              ? `${providerTestJob.output.latencyMs} ms`
              : 'not reported'}</p>}
          </div>}
          {providerTestJob.status === 'failed' && <div className="space-y-2 text-red-700">
            <p>{providerTestJob.errorMessage ?? 'Connection test failed.'}</p>
            <a className="font-medium text-violet-700 underline" href="/admin/jobs">Open Task Center</a>
          </div>}
          {providerTestJob.status === 'cancelled' && <div className="space-y-2 text-gray-700">
            <p>Connection test was cancelled.</p>
            <a className="font-medium text-violet-700 underline" href="/admin/jobs">Open Task Center</a>
          </div>}
        </div>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={closeProviderTest}
            disabled={providerTestSubmitting || Boolean(providerTestJob && isProviderTextTestPending(providerTestJob.status))}
          >
            Close
          </button>
          <button
            type="button"
            className={button}
            onClick={submitProviderTest}
            disabled={!selectedTestModelId || providerTestSubmitting || Boolean(providerTestJob && isProviderTextTestPending(providerTestJob.status))}
          >
            {providerTestSubmitting || (providerTestJob && isProviderTextTestPending(providerTestJob.status))
              ? 'Testing…'
              : testMode==='text'?'测试文本连接':'生成测试图片'}
          </button>
        </div>
    </dialog>}
  </>;
}
