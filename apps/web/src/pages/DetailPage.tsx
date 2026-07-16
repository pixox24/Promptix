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
    <div className="mx-auto max-w-[1920px] px-4 py-6 md:px-8 md:py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-400">
        <Link to="/" className="hover:text-gray-700">
          发现
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">{template.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-10">
        {/* Left: cover & meta */}
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-[6px] border border-gray-100 bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <img
              src={template.coverImage}
              alt={template.name}
              className="aspect-[3/4] w-full object-cover object-center"
            />
          </div>

          <div className="rounded-[6px] border border-gray-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {template.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {template.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Tag>{categoryLabelMap[template.category]}</Tag>
              {template.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>

            <div className="mt-5 border-t border-gray-50 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                适用场景
              </h3>
              <ul className="mt-2 space-y-1.5">
                {template.scenarios.map((s) => (
                  <li
                    key={s}
                    className="flex items-center gap-2 text-sm text-gray-600"
                  >
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex gap-4 text-xs text-gray-400">
              <span>{template.variables.length} 个变量</span>
              <span>{template.useCount.toLocaleString()} 次使用</span>
              <span>{template.favoriteCount.toLocaleString()} 收藏</span>
            </div>
          </div>
        </div>

        {/* Right: form & actions */}
        <div className="space-y-5">
          <div className="rounded-[6px] border border-gray-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  填写变量
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  修改下方字段，Prompt 将自动更新
                </p>
              </div>
              <button
                type="button"
                onClick={handleFavorite}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
                  fav
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <IconHeart size={16} filled={fav} />
                {fav ? '已收藏' : '收藏'}
              </button>
            </div>

            <VariableForm
              variables={template.variables}
              values={values}
              onChange={handleChange}
              errors={errors}
            />
          </div>

          <PromptPreview
            prompt={prompt}
            onChange={(v) => setManualPrompt(v)}
            onCopy={handleCopy}
          />

          <div className="sticky bottom-4 z-20 space-y-3 rounded-[6px] border border-gray-100 bg-white/95 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                fullWidth
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-full sm:flex-[1.4]"
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
                className="rounded-full sm:flex-1"
              >
                <IconCopy size={16} />
                复制提示词
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="md"
                fullWidth
                onClick={handleSaveDraft}
              >
                <IconFile size={16} />
                保存草稿
              </Button>
              <Button
                variant="ghost"
                size="md"
                fullWidth
                onClick={() => navigate('/')}
              >
                返回发现
              </Button>
            </div>
          </div>
        </div>
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
