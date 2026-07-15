export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[6px] bg-gray-200/80 ${className}`}
      aria-hidden
    />
  );
}

export function TemplateCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[6px] border border-gray-100 bg-white">
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-12 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
        <div className="flex justify-between border-t border-gray-50 pt-3">
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
