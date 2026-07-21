import { ChevronRight, RotateCcw } from 'lucide-react';

export function GovernancePagination({ hasCursor, hasMore, onFirst, onNext }: { hasCursor: boolean; hasMore: boolean; onFirst: () => void; onNext: () => void }) {
  if (!hasCursor && !hasMore) return null;
  return <div className="flex items-center justify-end gap-2 border-t bg-white px-3 py-2 text-xs">
    <button disabled={!hasCursor} onClick={onFirst} className="inline-flex h-8 items-center gap-1 rounded-md border px-3 disabled:opacity-40"><RotateCcw size={13}/>第一页</button>
    <button disabled={!hasMore} onClick={onNext} className="inline-flex h-8 items-center gap-1 rounded-md border px-3 disabled:opacity-40">下一页<ChevronRight size={13}/></button>
  </div>;
}
