import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Heart, LoaderCircle } from 'lucide-react';
import type { PromptTemplate } from '../../types/prompt';
import type { DisplayedImage } from '../../hooks/usePromptStudioState';

export function MediaCard({ template, image, ratio, favorite, busy, error, onFavorite }: { template: PromptTemplate; image: DisplayedImage; ratio: string; favorite: boolean; busy: boolean; error: string; onFavorite: () => void }) {
  const favoriteBaseline = useRef({ templateId: template.id, favorite });
  if (favoriteBaseline.current.templateId !== template.id) favoriteBaseline.current = { templateId: template.id, favorite };
  const [plusOneKey, setPlusOneKey] = useState(0);
  const favoriteCount = Math.max(0, template.favoriteCount + Number(favorite) - Number(favoriteBaseline.current.favorite));
  const handleFavorite = () => {
    if (!favorite) setPlusOneKey(key => key + 1);
    onFavorite();
  };

  return <section className="media-card flex flex-col gap-4 rounded-lg border border-slate-100 bg-white p-4 sm:p-5 lg:p-6" data-testid="media-card">
    <div className="media-stage relative flex items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-2" data-testid="media-stage">
      <AnimatePresence mode="wait"><motion.img key={image.url} src={image.url} alt={template.name} data-ratio={ratio} className="media-stage-image rounded-md bg-slate-900 object-contain shadow-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /></AnimatePresence>
      {busy && <div className="absolute inset-0 grid place-items-center bg-white/75 backdrop-blur-sm"><div className="flex items-center gap-2 text-sm font-medium text-slate-700"><LoaderCircle className="animate-spin" size={18} />正在生成</div></div>}
      {error && <div role="alert" className="absolute inset-x-4 bottom-4 rounded-md bg-red-950/90 px-3 py-2 text-xs text-white">{error}</div>}
    </div>
    <div className="flex min-w-0 items-center gap-3">
      <div className="tag-rail min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap" aria-label="模板标签">{template.tags.map(tag => <span key={tag} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{tag}</span>)}</div>
      <button type="button" onClick={handleFavorite} aria-label={favorite ? `取消收藏，当前 ${favoriteCount} 次收藏` : `收藏模板，当前 ${favoriteCount} 次收藏`} className={`relative flex h-8 shrink-0 items-center gap-1.5 px-1 text-sm font-medium transition-colors ${favorite ? 'text-rose-500' : 'text-slate-500 hover:text-rose-500'}`}>
        <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
        <span className="tabular-nums">{favoriteCount.toLocaleString()}</span>
        <AnimatePresence>{plusOneKey > 0 && <motion.span key={plusOneKey} className="pointer-events-none absolute -top-3 left-0 text-xs font-semibold text-rose-500" initial={{ opacity: 0, y: 6, scale: 0.85 }} animate={{ opacity: 1, y: -4, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.55 }}>+1</motion.span>}</AnimatePresence>
      </button>
    </div>
  </section>;
}
