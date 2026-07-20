import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTemplateById } from '../data/templates';
import { useLibrary } from '../context/UserLibraryContext';
import { useToast } from '../context/ToastContext';
import type { PageTab } from '../types/prompt';
import { TemplateGrid } from '../components/template/TemplateGrid';
import {
  IconBookmark,
  IconClock,
  IconCopy,
  IconFile,
  IconHeart,
  IconTrash,
} from '../components/icons';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

const tabs: { id: PageTab; label: string; icon: typeof IconHeart }[] = [
  { id: 'favorites', label: '收藏', icon: IconHeart },
  { id: 'recent', label: '最近使用', icon: IconClock },
  { id: 'drafts', label: '草稿', icon: IconFile },
];

export function MyPromptsPage() {
  const [tab, setTab] = useState<PageTab>('favorites');
  const { favorites, recent, drafts, deleteDraft, clearRecent } = useLibrary();
  const { toast } = useToast();

  const favoriteTemplates = useMemo(
    () =>
      favorites
        .map((id) => getTemplateById(id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t)),
    [favorites],
  );

  const recentTemplates = useMemo(
    () =>
      recent
        .map((r) => getTemplateById(r.templateId))
        .filter((t): t is NonNullable<typeof t> => Boolean(t)),
    [recent],
  );

  const handleCopyDraft = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast('草稿提示词已复制');
    } catch {
      toast('复制失败', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-[1920px] px-4 pb-12 pt-2 md:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          我的提示词
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理收藏、最近使用与已保存的草稿
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 rounded-[6px] border border-gray-100 bg-white p-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const count =
            t.id === 'favorites'
              ? favorites.length
              : t.id === 'recent'
                ? recent.length
                : drafts.length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
                active
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon size={16} />
              {t.label}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                  active
                    ? 'bg-black/10 text-primary-foreground'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'favorites' &&
        (favoriteTemplates.length === 0 ? (
          <EmptyState
            icon={<IconBookmark size={22} />}
            title="还没有收藏"
            description="在卡片上点击爱心，即可把模板收藏到这里。"
            actionLabel="去发现页看看"
            actionTo="/"
          />
        ) : (
          <TemplateGrid templates={favoriteTemplates} />
        ))}

      {tab === 'recent' && (
        <>
          {recentTemplates.length > 0 && (
            <div className="mb-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearRecent();
                  toast('已清空最近使用', 'info');
                }}
              >
                清空记录
              </Button>
            </div>
          )}
          {recentTemplates.length === 0 ? (
            <EmptyState
              icon={<IconClock size={22} />}
              title="暂无最近使用"
              description="打开任意模板详情页后，会自动记录在这里。"
              actionLabel="浏览模板"
              actionTo="/"
            />
          ) : (
            <TemplateGrid templates={recentTemplates} />
          )}
        </>
      )}

      {tab === 'drafts' &&
        (drafts.length === 0 ? (
          <EmptyState
            icon={<IconFile size={22} />}
            title="还没有草稿"
            description="在模板详情页填写变量后，点击「保存草稿」即可在此继续编辑。"
            actionLabel="开始创作"
            actionTo="/"
          />
        ) : (
          <div className="grid grid-cols-1 gap-[2px] md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((draft) => (
              <article
                key={draft.id}
                className="flex gap-4 overflow-hidden rounded-[6px] border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                <Link
                  to={`/template/${draft.templateId}?draft=${encodeURIComponent(draft.id)}`}
                  className="h-28 w-20 shrink-0 overflow-hidden rounded-[6px] bg-gray-50"
                >
                  <img
                    src={draft.coverImage}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/template/${draft.templateId}?draft=${encodeURIComponent(draft.id)}`}
                    className="block truncate text-sm font-semibold text-foreground hover:underline"
                  >
                    {draft.templateName}
                  </Link>
                  <p className="mt-1 line-clamp-2 font-mono text-xs leading-relaxed text-muted-foreground">
                    {draft.prompt}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {formatRelative(draft.updatedAt)} 更新
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopyDraft(draft.prompt)}
                      >
                        <IconCopy size={14} />
                        复制
                      </Button>
                      <Link to={`/template/${draft.templateId}?draft=${encodeURIComponent(draft.id)}`}>
                        <Button size="sm">继续编辑</Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          deleteDraft(draft.id);
                          toast('草稿已删除', 'info');
                        }}
                        aria-label="删除草稿"
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}
