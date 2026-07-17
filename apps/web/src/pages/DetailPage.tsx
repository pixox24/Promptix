import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { categoryLabelMap } from '../data/categories';
import { getSimilarTemplates, getTemplateById as getStaticTemplateById } from '../data/templates';
import { fetchTemplate } from '../data/templateApi';
import type { PromptTemplate } from '../types/prompt';
import { useLibrary } from '../context/UserLibraryContext';
import { useToast } from '../context/ToastContext';
import {
  buildPrompt,
  getDefaultValues,
  validateRequired,
} from '../utils/promptBuilder';
import { TemplateGrid } from '../components/template/TemplateGrid';
import { VariableForm } from '../components/template/VariableForm';
import { PromptPreview } from '../components/template/PromptPreview';
import {
  IconCopy,
  IconExternal,
  IconFile,
  IconHeart,
  IconSpark,
} from '../components/icons';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

export function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<PromptTemplate | undefined>(() => id ? getStaticTemplateById(id) : undefined);
  const [templateLoading, setTemplateLoading] = useState(true);
  const { isFavorite, toggleFavorite, addRecent, saveDraft } = useLibrary();
  const { toast } = useToast();

  const [values, setValues] = useState<Record<string, string>>({});
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!id) { setTemplateLoading(false); return; }
    let active = true;
    setTemplateLoading(true);
    fetchTemplate(id).then((value) => { if (active) setTemplate(value); })
      .catch(() => { if (active) setTemplate(getStaticTemplateById(id)); })
      .finally(() => { if (active) setTemplateLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (template) {
      setValues(getDefaultValues(template));
      setManualPrompt(null);
      setErrors([]);
      addRecent(template.id);
    }
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoPrompt = useMemo(
    () => (template ? buildPrompt(template, values) : ''),
    [template, values],
  );

  const prompt = manualPrompt ?? autoPrompt;

  if (templateLoading && !template) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-gray-400">正在加载模板…</div>;
  }

  if (!template) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <EmptyState
          title="模板不存在"
          description="该提示词模板可能已被移除，或链接不正确。"
          actionLabel="返回模板库"
          actionTo="/library"
        />
      </div>
    );
  }

  const fav = isFavorite(template.id);
  const similar = getSimilarTemplates(template, 4);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setManualPrompt(null);
    setErrors((prev) =>
      prev.filter((label) => {
        const v = template.variables.find((x) => x.label === label);
        return v ? v.key !== key : true;
      }),
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast('提示词已复制到剪贴板');
    } catch {
      toast('复制失败，请手动选择文本', 'error');
    }
  };

  const handleFavorite = () => {
    toggleFavorite(template.id);
    toast(fav ? '已取消收藏' : '已收藏模板');
  };

  const handleSaveDraft = () => {
    saveDraft({
      templateId: template.id,
      templateName: template.name,
      coverImage: template.coverImage,
      values,
      prompt,
    });
    toast('草稿已保存到「我的提示词」');
  };

  const handleGenerate = () => {
    const missing = validateRequired(template.variables, values);
    if (missing.length) {
      setErrors(missing);
      toast('请先填写必填变量', 'error');
      return;
    }
    setGenerating(true);
    window.setTimeout(() => {
      setGenerating(false);
      toast('已准备跳转生成（MVP 占位）', 'info');
      // 占位：真实场景可跳转外部模型或内部生成页
      window.alert(
        `「立即生成」为 MVP 占位入口。\n\n完整 Prompt 已就绪，可复制后粘贴到你的 AI 图像工具中使用。\n\n模板：${template.name}`,
      );
    }, 600);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-12 pt-4 md:px-8 md:pb-16">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center text-xs font-medium text-slate-400">
        <Link to="/" className="transition-colors hover:text-slate-700">
          发现
        </Link>
        <span className="mx-2 text-slate-300">/</span>
        <span className="max-w-[60vw] truncate text-slate-600">
          {template.name}
        </span>
      </nav>

      <div
        data-testid="prompt-detail-workspace"
        className="detail-workspace grid overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] xl:h-[calc(100dvh-8.5rem)] xl:min-h-[640px] xl:max-h-[820px] xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.95fr)]"
      >
        {/* Left: media & metadata */}
        <section
          data-testid="prompt-detail-media"
          className="relative min-h-[560px] overflow-hidden bg-slate-950 xl:min-h-0"
        >
          <img
            src={template.coverImage}
            alt={template.name}
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 hover:scale-[1.015]"
          />

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5 sm:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(154,218,32,0.18)]" />
              {categoryLabelMap[template.category]}
            </div>
            <button
              type="button"
              onClick={handleFavorite}
              className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/45 ${
                fav
                  ? 'border-rose-200/70 bg-rose-50/95 text-rose-600'
                  : 'border-white/25 bg-slate-950/70 text-white hover:bg-slate-950/85'
              }`}
            >
              <IconHeart size={16} filled={fav} />
              {fav ? '已收藏' : '收藏'}
            </button>
          </div>

          <div className="detail-media-scrim absolute inset-x-0 bottom-0 z-10 p-6 text-white sm:p-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {template.tags.slice(0, 5).map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl xl:text-[2.65rem] xl:leading-[1.05]">
                {template.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/76 sm:text-[15px]">
                {template.description}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/15 pt-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    适用场景
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/80">
                    {template.scenarios.map((scenario) => (
                      <li key={scenario} className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        {scenario}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="ml-auto flex items-center gap-4 text-xs text-white/58">
                  <span>
                    <strong className="mr-1 text-sm font-semibold text-white">
                      {template.variables.length}
                    </strong>
                    变量
                  </span>
                  <span>
                    <strong className="mr-1 text-sm font-semibold text-white">
                      {template.useCount.toLocaleString()}
                    </strong>
                    使用
                  </span>
                  <span>
                    <strong className="mr-1 text-sm font-semibold text-white">
                      {template.favoriteCount.toLocaleString()}
                    </strong>
                    收藏
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right: variables & actions */}
        <section
          data-testid="prompt-detail-panel"
          className="detail-control-panel flex min-h-0 flex-col bg-[#fbfbf8]"
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white shadow-sm">
                01
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  填写变量
                </h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  调整参数，Prompt 会同步更新
                </p>
              </div>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 shadow-sm">
              Live
            </span>
          </header>

          <div
            data-testid="prompt-variable-scroll"
            className="detail-panel-scroll min-h-0 flex-1 overflow-visible px-5 py-4 sm:px-6 xl:overflow-y-auto"
          >
            <VariableForm
              variables={template.variables}
              values={values}
              onChange={handleChange}
              errors={errors}
              compact
            />
          </div>

          <div className="shrink-0 border-t border-slate-200/70 px-5 py-3 sm:px-6">
            <PromptPreview
              prompt={prompt}
              onChange={(v) => setManualPrompt(v)}
              onCopy={handleCopy}
              compact
            />
          </div>

          <footer
            data-testid="prompt-action-footer"
            className="shrink-0 border-t border-slate-200/70 bg-white px-5 py-4 sm:px-6"
          >
            <div className="flex gap-2">
              <Button
                size="lg"
                fullWidth
                onClick={handleGenerate}
                disabled={generating}
                className="h-12 rounded-xl shadow-[0_8px_20px_rgba(154,218,32,0.28)] sm:flex-[1.35]"
              >
                <IconSpark size={18} />
                {generating ? '准备中…' : '立即生成'}
                <IconExternal size={14} className="opacity-70" />
              </Button>
              <Button
                size="lg"
                variant="secondary"
                fullWidth
                onClick={handleCopy}
                className="h-12 rounded-xl border-slate-200 sm:flex-1"
              >
                <IconCopy size={16} />
                复制提示词
              </Button>
            </div>
            <div className="mt-2 flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={handleSaveDraft}
                className="rounded-lg"
              >
                <IconFile size={16} />
                保存草稿
              </Button>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={() => navigate('/')}
                className="rounded-lg"
              >
                返回发现
              </Button>
            </div>
          </footer>
        </section>
      </div>

      {/* Similar */}
      {similar.length > 0 && (
        <section className="mt-14 border-t border-gray-100 pt-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              相似模板
            </h2>
            <Link
              to={`/library?category=${template.category}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              查看同分类
            </Link>
          </div>
          <TemplateGrid templates={similar} />
        </section>
      )}
    </div>
  );
}
