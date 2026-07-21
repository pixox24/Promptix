import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { PromptTemplate } from '../../types/prompt';
import { useLibrary } from '../../context/UserLibraryContext';
import { useToast } from '../../context/ToastContext';
import { buildTemplateCardPrompt } from '../../lib/templateCardPrompt';
import { IconCopy, IconHeart } from '../icons';

interface TemplateCardProps {
  template: PromptTemplate;
  compact?: boolean;
  onNavigateRequest?: (template: PromptTemplate, event: MouseEvent<HTMLAnchorElement>) => void;
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

/**
 * Pixel-level recreation of HeroPrompt card:
 * rounded-[6px], aspect-[3/4], lime tags, heart count + prompt copy footer
 */
export function TemplateCard({ template, onNavigateRequest }: TemplateCardProps) {
  const { isFavorite, toggleFavorite } = useLibrary();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copiedResetTimer = useRef<number | null>(null);
  const fav = isFavorite(template.id);
  const displayCount = template.favoriteCount || template.useCount;

  useEffect(() => () => {
    if (copiedResetTimer.current !== null) window.clearTimeout(copiedResetTimer.current);
  }, []);

  async function copyPrompt(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const result = buildTemplateCardPrompt(template);
    if (!result.ok) {
      toast('该模板需要补充变量，请进入详情页', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      toast('提示词已复制');
      if (copiedResetTimer.current !== null) window.clearTimeout(copiedResetTimer.current);
      copiedResetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      toast('复制失败，请进入详情页手动复制', 'error');
    }
  }

  return (
    <Link
      to={`/template/${template.id}`}
      className="group block h-full w-full"
      onClick={event => onNavigateRequest?.(template, event)}
    >
      <div className="group relative flex h-full cursor-zoom-in flex-col overflow-hidden rounded-[8px] border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Image 3:4 */}
        <div className="relative aspect-[3/4] w-full bg-white p-1">
          <div className="relative h-full w-full overflow-hidden rounded-[4px] bg-gray-50">
            <img
              src={template.coverImage}
              alt={template.name}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="absolute inset-0 h-full w-full scale-100 object-cover blur-0 transition-transform duration-700 ease-out group-hover:scale-[1.025]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
              <h3 className="line-clamp-1 text-center text-base font-bold leading-snug text-white drop-shadow-md">
                {template.name}
              </h3>
            </div>
          </div>
        </div>

        {/* Meta body */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex h-[20px] flex-wrap gap-1.5 overflow-hidden">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="whitespace-nowrap rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFavorite(template.id);
                }}
                className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 transition-colors hover:bg-gray-100"
                aria-label={fav ? '取消收藏' : '收藏'}
              >
                <IconHeart
                  size={12}
                  filled={fav}
                  className={fav ? 'text-rose-500' : 'text-gray-400'}
                />
                <span className="text-[11px] font-bold text-gray-600">
                  {formatCount(displayCount + (fav ? 1 : 0))}
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={copyPrompt}
              className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={`${copied ? '已复制' : '复制'}「${template.name}」的提示词`}
            >
              <IconCopy size={12} className={copied ? 'text-primary' : 'text-gray-400'} />
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
