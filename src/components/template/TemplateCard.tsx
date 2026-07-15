import { Link } from 'react-router-dom';
import type { PromptTemplate } from '../../types/prompt';
import { useLibrary } from '../../context/UserLibraryContext';
import { IconHeart } from '../icons';

interface TemplateCardProps {
  template: PromptTemplate;
  compact?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

function formatDate(iso: string): string {
  // HeroPrompt style: 2026-03-26 17:42
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/**
 * Pixel-level recreation of HeroPrompt card:
 * rounded-[6px], aspect-[3/4], lime tags, heart count + date footer
 */
export function TemplateCard({ template }: TemplateCardProps) {
  const { isFavorite, toggleFavorite } = useLibrary();
  const fav = isFavorite(template.id);
  const displayCount = template.favoriteCount || template.useCount;

  return (
    <Link
      to={`/template/${template.id}`}
      className="group block h-full w-full"
    >
      <div className="group relative flex h-full cursor-zoom-in flex-col overflow-hidden rounded-[6px] border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Image 3:4 */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-50">
          <div className="relative h-full w-full">
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
            <span className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-400">
              {formatDate(template.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
