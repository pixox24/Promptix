import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import type { PromptVariable } from "../types/prompt";
import type { SemanticClassification } from "@promptix/shared";
import { ProviderModelsPage } from "./admin/ProviderModelsPage";
import type { AdminModel } from "../types/adminModels";
import { api } from "../lib/api";
import { IngestPage } from "./admin/IngestPage";
import { fetchTaxonomy, type TaxonomyTerm } from "../data/taxonomyApi";
import { TaxonomyPage } from "./admin/TaxonomyPage";

type Admin = { id: string; email: string; displayName: string; role: string };
type Template = {
  id: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  semantic?: SemanticClassification;
  tags: string[];
  scenarios: string[];
  variables: PromptVariable[];
  promptTemplate: string;
  negativePrompt?: string;
  coverUrl?: string;
  status: string;
  source: string;
  isFeatured: boolean;
  featuredOrder: number;
  updatedAt: string;
  coverJob?: Job | null;
  taxonomyReviewStatus?: "pending" | "needs_attention" | "reviewed";
};
type Job = {
  id: string;
  type: string;
  status: string;
  input: unknown;
  output: unknown;
  errorMessage?: string;
  createdAt: string;
  templateId?: string | null;
  resultMeta?: unknown;
};
type DraftForm = {
  name: string;
  summary: string;
  description: string;
  semantic: SemanticClassification;
  variables: PromptVariable[];
  promptTemplate: string;
  negativePrompt: string;
  source: string;
  isFeatured: boolean;
  featuredOrder: number;
};
const blank = (): DraftForm => ({
  name: "",
  summary: "",
  description: "",
  semantic: { workflowType: "generate", outputType: null, tags: [], scenarios: [], styles: [], subjects: [], unmappedTerms: [], confidence: {} },
  variables: [
    {
      id: "var-1",
      key: "subject",
      label: "主体",
      type: "text",
      required: true,
    },
  ],
  promptTemplate: "{{subject}}",
  negativePrompt: "",
  source: "manual",
  isFeatured: false,
  featuredOrder: 0,
});
const field =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
const button =
  "rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50";

export function AdminPage() {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);
  const refresh = useCallback(
    () =>
      api<Admin>("/api/admin/auth/me")
        .then(setAdmin)
        .catch(() => setAdmin(null)),
    [],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  if (admin === undefined)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-gray-500">
        正在验证会话…
      </div>
    );
  if (!admin) return <Login onLogin={setAdmin} />;
  return (
    <AdminShell
      admin={admin}
      onLogout={async () => {
        await api("/api/admin/auth/logout", { method: "POST" });
        setAdmin(null);
      }}
    />
  );
}

function Login({ onLogin }: { onLogin: (a: Admin) => void }) {
  const rememberedEmail =
    window.localStorage.getItem("promptix_admin_email") ?? "";
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(rememberedEmail));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const admin = await api<Admin>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
      });
      if (remember)
        window.localStorage.setItem("promptix_admin_email", admin.email);
      else window.localStorage.removeItem("promptix_admin_email");
      onLogin(admin);
    } catch (x) {
      setError(x instanceof Error ? x.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl"
      >
        <p className="text-xs font-bold uppercase tracking-[.25em] text-violet-600">
          Promptix Admin
        </p>
        <h1 className="mt-3 text-2xl font-semibold">运营后台登录</h1>
        <div className="mt-7 space-y-4">
          <input
            className={field}
            type="email"
            name="username"
            autoComplete="username"
            placeholder="邮箱"
            aria-label="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className={field}
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="密码"
            aria-label="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              className="h-4 w-4 rounded border-gray-300 accent-violet-600"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>记住密码</span>
            <span className="ml-auto text-xs text-gray-400">保持登录 7 天</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button className={`${button} w-full`} disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
        </div>
        <Link to="/" className="mt-5 block text-center text-xs text-gray-400">
          返回前台
        </Link>
      </form>
    </div>
  );
}

function AdminShell({
  admin,
  onLogout,
}: {
  admin: Admin;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-slate-950 text-white">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-5 py-4">
          <Link to="/admin/templates" className="text-lg font-bold">
            Promptix <span className="text-violet-400">Admin</span>
          </Link>
          <nav className="flex flex-1 gap-1 text-sm">
            <Nav to="/admin/templates">模板</Nav>
            <Nav to="/admin/ingest">智能入库</Nav>
            <Nav to="/admin/taxonomy">分类词库</Nav>
            <Nav to="/admin/jobs">任务</Nav>
            <Nav to="/admin/providers">模型</Nav>
          </nav>
          <span className="hidden text-xs text-gray-400 md:inline">
            {admin.email}
          </span>
          <button
            onClick={onLogout}
            className="text-sm text-gray-300 hover:text-white"
          >
            退出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] p-5 md:p-8">
        <Routes>
          <Route index element={<Navigate to="templates" replace />} />
          <Route path="templates" element={<TemplateList />} />
          <Route path="templates/new" element={<TemplateEditor />} />
          <Route path="templates/:id" element={<TemplateEditor />} />
          <Route path="ingest" element={<IngestPage />} />
          <Route path="taxonomy" element={<TaxonomyPage />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="providers" element={<ProviderModelsPage />} />
          <Route path="*" element={<Navigate to="templates" replace />} />
        </Routes>
      </main>
    </div>
  );
}
function Nav({ to, children }: { to: string; children: string }) {
  return (
    <Link
      className="rounded-lg px-3 py-2 text-gray-300 hover:bg-white/10 hover:text-white"
      to={to}
    >
      {children}
    </Link>
  );
}
function Header({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">
          Operations
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      </div>
      {action}
    </div>
  );
}

function TemplateList() {
  const [items, setItems] = useState<Template[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [featured, setFeatured] = useState("");
  const [outputType, setOutputType] = useState("");
  const [taxonomyTerms, setTaxonomyTerms] = useState<TaxonomyTerm[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      api<Template[]>(
        `/api/admin/templates?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(featured ? { featured } : {}), ...(outputType ? { outputType } : {}) })}`,
      )
        .then(setItems)
        .catch((e) => setError(e.message)),
    [q, status, featured, outputType],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetchTaxonomy().then(setTaxonomyTerms).catch((reason) => setError(reason instanceof Error ? reason.message : "分类词库加载失败"));
  }, []);
  const outputTypes = taxonomyTerms.filter((term) => term.dimension === "output_type");
  const outputLabels = new Map(outputTypes.map((term) => [term.slug, term.label]));
  async function action(id: string, op: string) {
    try {
      await api(`/api/admin/templates/${id}/${op}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }
  async function toggleFeatured(template: Template) {
    try {
      await api(`/api/admin/templates/${template.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isFeatured: !template.isFeatured,
          featuredOrder: template.isFeatured ? 0 : template.featuredOrder,
        }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "精选状态更新失败");
    }
  }
  return (
    <>
      <Header
        title="模板管理"
        action={
          <Link className={button} to="new">
            新建模板
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className={`${field} max-w-sm`}
          placeholder="搜索模板"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={`${field} max-w-36`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
          <option value="archived">已下架</option>
        </select>
        <select
          className={`${field} max-w-36`}
          value={featured}
          onChange={(e) => setFeatured(e.target.value)}
        >
          <option value="">全部精选状态</option>
          <option value="true">仅精选</option>
          <option value="false">非精选</option>
        </select>
        <select className={`${field} max-w-44`} value={outputType} onChange={(event) => setOutputType(event.target.value)}>
          <option value="">全部产物类型</option>
          {outputTypes.map((term) => <option key={term.id} value={term.slug}>{term.label}</option>)}
        </select>
      </div>
      {error && <Notice text={error} />}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="p-3">模板</th>
              <th>分类</th>
              <th>精选</th>
              <th>状态</th>
              <th>更新时间</th>
              <th className="p-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3">
                  <Link className="font-medium hover:text-violet-600" to={t.id}>
                    {t.name}
                  </Link>
                  <p className="mt-1 max-w-xl truncate text-xs text-gray-400">
                    {t.summary}
                  </p>
                </td>
                <td>{t.semantic?.outputType ? outputLabels.get(t.semantic.outputType) ?? t.semantic.outputType : "待分类"}</td>
                <td>
                  {t.isFeatured ? (
                    <span className="text-xs font-medium text-violet-600">
                      精选 · {t.featuredOrder}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">否</span>
                  )}
                </td>
                <td>
                  <Status value={t.status} />
                </td>
                <td className="text-xs text-gray-500">
                  {new Date(t.updatedAt).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => toggleFeatured(t)}
                    className="mr-3 text-violet-600"
                  >
                    {t.isFeatured ? "取消精选" : "设为精选"}
                  </button>
                  <Link className="mr-3 text-violet-600" to={t.id}>
                    编辑
                  </Link>
                  {t.status !== "published" ? (
                    <button
                      onClick={() => action(t.id, "publish")}
                      className="text-emerald-600"
                    >
                      发布
                    </button>
                  ) : (
                    <button
                      onClick={() => action(t.id, "archive")}
                      className="text-amber-600"
                    >
                      下架
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="p-10 text-center text-sm text-gray-400">暂无模板</p>
        )}
      </div>
    </>
  );
}

function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(blank());
  const [existing, setExisting] = useState<Template | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [taxonomyTerms, setTaxonomyTerms] = useState<TaxonomyTerm[]>([]);
  const [taxonomyConfirmed, setTaxonomyConfirmed] = useState(false);
  const [genJob, setGenJob] = useState<Job | null>((location.state as { coverJob?: Job } | null)?.coverJob ?? null);
  useEffect(() => {
    fetchTaxonomy().then(setTaxonomyTerms).catch((error) => setMessage(error instanceof Error ? error.message : "分类词库加载失败"));
  }, []);
  useEffect(() => {
    if (id)
      api<Template>(`/api/admin/templates/${id}`)
        .then((t) => {
          setExisting(t);
          if (t.coverJob) setGenJob(t.coverJob);
          setForm({
            ...blank(),
            ...t,
            semantic: t.semantic ?? blank().semantic,
            variables: t.variables ?? [],
            negativePrompt: t.negativePrompt ?? "",
          });
          setTaxonomyConfirmed(t.taxonomyReviewStatus === "reviewed");
        })
        .catch((e) => setMessage(e.message));
  }, [id]);
  useEffect(() => {
    if (!genJob || !['queued', 'pending', 'running'].includes(genJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await api<Job>(`/api/admin/jobs/${genJob.id}`);
        setGenJob(next);
        if (['succeeded', 'failed', 'cancelled'].includes(next.status)) {
          window.clearInterval(timer);
          const input = next.input && typeof next.input === 'object' ? next.input as Record<string, unknown> : undefined;
          const metadata = input?.metadata && typeof input.metadata === 'object' ? input.metadata as Record<string, unknown> : undefined;
          if (next.status === 'succeeded' && metadata?.source === 'image_reverse_auto_cover') await applyGeneratedCover(next.id);
        }
      } catch { /* keep the current snapshot; a later page refresh can recover it */ }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [genJob?.id, genJob?.status]);
  const set = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const payload = { ...form, taxonomyConfirmed };
      const t = await api<Template>(
        id ? `/api/admin/templates/${id}` : "/api/admin/templates",
        { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setExisting(t);
      setMessage("已保存");
      if (!id) navigate(`/admin/templates/${t.id}`, { replace: true });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!id) {
      setMessage("请先保存模板，再上传封面");
      return;
    }
    const body = new FormData();
    body.set("file", file);
    try {
      const t = await api<Template>(`/api/admin/templates/${id}/cover`, {
        method: "POST",
        body,
      });
      setExisting(t);
      setMessage("封面已上传");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "上传失败");
    }
  }
  async function publish() {
    if (!id) return;
    try {
      const t = await api<Template>(`/api/admin/templates/${id}/publish`, {
        method: "POST",
      });
      setExisting(t);
      setMessage("发布成功");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "发布失败");
    }
  }
  async function generate() {
    if (!id) return;
    try {
      const x = await api<{ jobId: string }>(`/api/admin/jobs`, {
        method: "POST",
        body: JSON.stringify({
          type: "image_generate",
          templateId: id,
          input: { n: 1, source: "template_cover" },
        }),
      });
      setMessage("生图任务已提交");
      poll(x.jobId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "提交失败");
    }
  }
  function poll(jobId: string) {
    const timer = window.setInterval(async () => {
      const j = await api<Job>(`/api/admin/jobs/${jobId}`);
      setGenJob(j);
      if (["succeeded", "failed"].includes(j.status)) {
        window.clearInterval(timer);
        if (j.status === "succeeded") await applyGeneratedCover(j.id);
      }
    }, 1500);
  }
  async function applyGeneratedCover(jobId: string) {
    if (!id) return;
    try {
      const t = await api<Template>(`/api/admin/jobs/${jobId}/set-cover`, {
        method: "POST",
        body: JSON.stringify({ templateId: id, imageIndex: 0 }),
      });
      setExisting(t);
      setMessage("生成图已自动设为封面");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "生成图设为封面失败");
    }
  }
  async function setGeneratedCover() {
    if (genJob) await applyGeneratedCover(genJob.id);
  }
  function updateVar(i: number, key: string, value: unknown) {
    set(
      "variables",
      form.variables.map((v, n) => (n === i ? { ...v, [key]: value } : v)),
    );
  }
  const setSemantic = (patch: Partial<SemanticClassification>) =>
    set("semantic", { ...form.semantic, ...patch });
  const toggleSemantic = (key: "scenarios" | "styles" | "subjects", slug: string) => {
    const values = form.semantic[key];
    setSemantic({ [key]: values.includes(slug) ? values.filter((value) => value !== slug) : [...values, slug] });
  };
  const termsFor = (dimension: TaxonomyTerm["dimension"]) => taxonomyTerms.filter((term) => term.dimension === dimension);
  const coverInput =
    genJob?.input && typeof genJob.input === "object"
      ? (genJob.input as Record<string, unknown>)
      : undefined;
  const coverMetadata =
    coverInput?.metadata && typeof coverInput.metadata === "object"
      ? (coverInput.metadata as Record<string, unknown>)
      : undefined;
  const resolvedValues =
    coverMetadata?.resolvedValues &&
    typeof coverMetadata.resolvedValues === "object"
      ? (coverMetadata.resolvedValues as Record<string, unknown>)
      : undefined;
  const textValue = (value: unknown) =>
    typeof value === "string"
      ? value
      : value == null
        ? ""
        : JSON.stringify(value, null, 2);
  const coverAudit = coverInput?.metadata ? (
    <div className="mb-6 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">本次实际发送内容</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-gray-500 md:col-span-2">最终 Prompt<textarea readOnly className={`${field} mt-1 min-h-28 font-mono text-xs`} value={textValue(coverInput.prompt)} /></label>
        <label className="block text-xs text-gray-500">负面 Prompt<textarea readOnly className={`${field} mt-1 min-h-20 font-mono text-xs`} value={textValue(coverInput.negativePrompt)} /></label>
        <div className="text-xs"><span className="text-gray-500">画幅比例</span><p className="mt-1 font-mono">{textValue(coverInput.aspectRatio) || "未指定"}</p><span className="mt-3 block text-gray-500">变量解析</span><pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 font-mono text-[10px]">{textValue(resolvedValues) || "无"}</pre></div>
        <label className="block text-xs text-gray-500 md:col-span-2">模板骨架<textarea readOnly className={`${field} mt-1 min-h-20 font-mono text-xs`} value={textValue(coverMetadata?.templatePromptTemplate)} /></label>
      </div>
    </div>
  ) : null;
  return (
    <>
      <Header
        title={id ? "编辑模板" : "新建模板"}
        action={
          <div className="flex gap-2">
            <Link
              className="rounded-lg border px-4 py-2 text-sm"
              to="/admin/templates"
            >
              返回
            </Link>
            <button className={button} onClick={save} disabled={busy}>
              {busy ? "保存中…" : "保存草稿"}
            </button>
            {id && (
              <button
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                onClick={publish}
              >
                发布
              </button>
            )}
          </div>
        }
      />
      {message && <Notice text={message} />}
      {coverAudit}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">基础信息</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="名称"
              value={form.name}
              onChange={(v) => set("name", v)}
            />
            <label className="text-sm">
              产物类型
              <select
                className={`${field} mt-1`}
                value={form.semantic.outputType ?? ""}
                onChange={(e) => setSemantic({ outputType: e.target.value || null })}
              >
                <option value="">待选择</option>
                {termsFor("output_type").map((term) => (
                  <option key={term.id} value={term.slug}>{term.label}</option>
                ))}
              </select>
            </label>
          </div>
          <Input
            label="摘要"
            value={form.summary}
            onChange={(v) => set("summary", v)}
          />
          <Area
            label="描述"
            value={form.description}
            onChange={(v) => set("description", v)}
          />
          <label className="text-sm">工作模式<select className={`${field} mt-1`} value={form.semantic.workflowType} onChange={(event) => setSemantic({ workflowType: event.target.value as "generate" | "edit" })}><option value="generate">生成图片</option><option value="edit">编辑图片</option></select></label>
          {([['scenario', 'scenarios', '使用场景'], ['style', 'styles', '视觉风格'], ['subject', 'subjects', '画面主体']] as const).map(([dimension, key, label]) => <fieldset key={dimension}><legend className="mb-2 text-sm font-medium">{label}</legend><div className="flex flex-wrap gap-2">{termsFor(dimension).map((term) => { const active = form.semantic[key].includes(term.slug); return <button type="button" key={term.id} aria-pressed={active} onClick={() => toggleSemantic(key, term.slug)} className={`rounded-full border px-3 py-1.5 text-xs ${active ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600'}`}>{term.label}</button>; })}</div></fieldset>)}
          <Input label="自由标签（逗号分隔）" value={form.semantic.tags.join(",")} onChange={(value) => setSemantic({ tags: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
          {form.semantic.unmappedTerms.length > 0 && <Notice text={`还有 ${form.semantic.unmappedTerms.length} 个待处理分类词，请在智能入库校对页处理后再确认。`} />}
          <label className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm"><input className="mt-0.5" type="checkbox" checked={taxonomyConfirmed} onChange={(event) => setTaxonomyConfirmed(event.target.checked)} /><span>我已人工确认产物类型、使用场景、风格和画面主体</span></label>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">变量</h2>
            <button
              className="text-sm text-violet-600"
              onClick={() =>
                set("variables", [
                  ...form.variables,
                  {
                    id: `var-${Date.now()}`,
                    key: "variable",
                    label: "变量",
                    type: "text",
                  },
                ])
              }
            >
              + 添加变量
            </button>
          </div>
          {form.variables.map((v, i) => (
            <div
              key={v.id}
              className="grid gap-2 rounded-lg bg-gray-50 p-3 md:grid-cols-[1fr_1fr_130px_auto]"
            >
              <input
                className={field}
                value={v.key}
                onChange={(e) => updateVar(i, "key", e.target.value)}
                placeholder="key"
              />
              <input
                className={field}
                value={v.label}
                onChange={(e) => updateVar(i, "label", e.target.value)}
                placeholder="标签"
              />
              <select
                className={field}
                value={v.type}
                onChange={(e) => updateVar(i, "type", e.target.value)}
              >
                {["text", "select", "number", "ratio", "image"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <button
                className="px-2 text-red-500"
                onClick={() =>
                  set(
                    "variables",
                    form.variables.filter((_, n) => n !== i),
                  )
                }
              >
                删除
              </button>
            </div>
          ))}
          <Area
            label="Prompt 骨架"
            value={form.promptTemplate}
            onChange={(v) => set("promptTemplate", v)}
            rows={8}
          />
          <Area
            label="负面提示词"
            value={form.negativePrompt}
            onChange={(v) => set("negativePrompt", v)}
            rows={3}
          />
        </section>
        <aside className="space-y-5">
          <div className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">封面与状态</h2>
            {existing?.coverUrl ? (
              <img
                className="mt-4 aspect-[4/3] w-full rounded-lg object-cover"
                src={existing.coverUrl}
              />
            ) : (
              <div className="mt-4 grid aspect-[4/3] place-items-center rounded-lg bg-gray-100 text-sm text-gray-400">
                暂无封面
              </div>
            )}
            <label className="mt-3 block cursor-pointer rounded-lg border border-dashed p-3 text-center text-sm text-violet-600">
              上传封面
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(e) =>
                  e.target.files?.[0] && upload(e.target.files[0])
                }
              />
            </label>
            <p className="mt-3 text-sm">
              状态：
              <Status value={existing?.status ?? "draft"} />
            </p>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">精选排序</h2>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => {
                  set("isFeatured", e.target.checked);
                  if (!e.target.checked) set("featuredOrder", 0);
                }}
              />
              设为精选
            </label>
            <label className="mt-3 block text-sm">
              精选顺序
              <input
                type="number"
                min="0"
                max="1000000"
                disabled={!form.isFeatured}
                className={`${field} mt-1 disabled:bg-gray-100 disabled:text-gray-400`}
                value={form.featuredOrder}
                onChange={(e) =>
                  set("featuredOrder", Math.max(0, Number(e.target.value) || 0))
                }
              />
            </label>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              数值越小越靠前；相同时按热门程度排序。精选不足时由热门内容自动补齐。
            </p>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">AI 生成封面</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              按模板默认值生成并提交封面；下方会显示本次实际请求内容。
            </p>
            <button
              className={`${button} mt-3 w-full`}
              onClick={generate}
              disabled={!id}
            >
              生成封面
            </button>
            {genJob && (
              <div className="mt-3 text-sm">
                <Status value={genJob.status} />
                {genJob.status === "succeeded" && (
                  <button
                    className="ml-3 text-violet-600"
                    onClick={setGeneratedCover}
                  >
                    设为封面
                  </button>
                )}
                {genJob.errorMessage && (
                  <p className="mt-2 text-xs text-red-600">
                    {genJob.errorMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

export function LegacyIngest() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [job, setJob] = useState<Job>();
  const [message, setMessage] = useState("");
  const [modelItems, setModelItems] = useState<AdminModel[]>([]);
  const [modelId, setModelId] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    api<AdminModel[]>("/api/admin/models?capability=text")
      .then((list) => {
        const eligible = list.filter(
          (model) =>
            model.enabled &&
            model.providerEnabled &&
            model.capabilities.includes("structured_output"),
        );
        setModelItems(eligible);
        const preferred =
          eligible.find((model) => model.isDefaultText) ?? eligible[0];
        if (preferred) setModelId(preferred.id);
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Model 加载失败"),
      );
  }, []);
  async function submit() {
    try {
      let x: { jobId: string };
      if (file) {
        const body = new FormData();
        body.set("file", file);
        if (modelId) body.set("modelId", modelId);
        x = await api("/api/admin/jobs/image-reverse", {
          method: "POST",
          body,
        });
      } else {
        x = await api("/api/admin/jobs", {
          method: "POST",
          body: JSON.stringify({
            type: "text_expand",
            input: { text },
            modelId: modelId || undefined,
          }),
        });
      }
      poll(x.jobId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "提交失败");
    }
  }
  function poll(id: string) {
    const timer = window.setInterval(async () => {
      const j = await api<Job>(`/api/admin/jobs/${id}`);
      setJob(j);
      if (["succeeded", "failed"].includes(j.status))
        window.clearInterval(timer);
    }, 1500);
  }
  async function save() {
    if (!job?.output) return;
    try {
      const t = await api<Template>("/api/admin/templates", {
        method: "POST",
        body: JSON.stringify({ ...(job.output as object), source: job.type }),
      });
      navigate(`/admin/templates/${t.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    }
  }
  return (
    <>
      <Header title="智能入库" />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">提示词优化 / 图片反推</h2>
          <label className="mt-4 block text-sm">
            优化与结构化模型
            <select
              className={`${field} mt-1`}
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              <option value="">使用默认文本模型</option>
              {modelItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.providerName} · {m.name} · {m.modelId}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            选择 DeepSeek
            时，文本会直接优化；图片会先经过已标记“支持图片理解”的视觉
            Provider，再由 DeepSeek 结构化。
          </p>
          <textarea
            className={`${field} mt-4 min-h-44`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setFile(undefined);
            }}
            placeholder="粘贴现有提示词或创意需求，DeepSeek 将进行扩写、优化和结构化…"
          />
          <p className="my-4 text-center text-xs text-gray-400">或</p>
          <label className="block rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
            {file ? file.name : "上传参考图进行反推"}
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                if (e.target.files?.[0]) setText("");
              }}
            />
          </label>
          <button
            className={`${button} mt-4 w-full`}
            disabled={!text && !file}
            onClick={submit}
          >
            提交异步任务
          </button>
          {message && <p className="mt-3 text-sm text-red-600">{message}</p>}
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">任务结果</h2>
          {!job ? (
            <p className="mt-12 text-center text-sm text-gray-400">
              提交后结果会显示在这里
            </p>
          ) : (
            <div className="mt-4">
              <Status value={job.status} />
              {job.errorMessage && (
                <p className="mt-3 text-sm text-red-600">{job.errorMessage}</p>
              )}
              {Boolean(job.output) && (
                <pre className="mt-4 max-h-[440px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-200">
                  {JSON.stringify(job.output, null, 2)}
                </pre>
              )}
              {job.status === "succeeded" && (
                <button className={`${button} mt-4`} onClick={save}>
                  保存为草稿模板
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Jobs() {
  const [items, setItems] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      api<Job[]>("/api/admin/jobs")
        .then(setItems)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  async function retry(id: string) {
    try {
      await api(`/api/admin/jobs/${id}/retry`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重试失败");
    }
  }
  return (
    <>
      <Header title="任务中心" />
      {error && <Notice text={error} />}
      <div className="space-y-3">
        {items.map((j) => (
          <div
            key={j.id}
            className="flex items-center gap-4 rounded-xl border bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex gap-2">
                <b className="text-sm">{j.type}</b>
                <Status value={j.status} />
              </div>
              <p className="mt-1 truncate font-mono text-xs text-gray-400">
                {j.id}
              </p>
              {j.errorMessage && (
                <p className="mt-2 text-xs text-red-600">{j.errorMessage}</p>
              )}
            </div>
            <time className="hidden text-xs text-gray-400 sm:block">
              {new Date(j.createdAt).toLocaleString()}
            </time>
            {j.status === "failed" && (
              <button
                className="text-sm text-violet-600"
                onClick={() => retry(j.id)}
              >
                重试
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className={`${field} mt-1`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Area({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      {label}
      <textarea
        rows={rows}
        className={`${field} mt-1`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Notice({ text }: { text: string }) {
  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${text.includes("成功") || text.includes("已") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}
    >
      {text}
    </div>
  );
}
function Status({ value }: { value: string }) {
  const good = ["published", "succeeded", "enabled", "default"].includes(value),
    bad = ["failed", "cancelled"].includes(value);
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${good ? "bg-emerald-100 text-emerald-700" : bad ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
    >
      {value}
    </span>
  );
}
