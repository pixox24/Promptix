import type { PromptTemplate, SortOption } from '../types/prompt';

function stableFallback(a: PromptTemplate, b: PromptTemplate) {
  const created = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return created || a.id.localeCompare(b.id);
}

export function compareTemplates(sort: SortOption) {
  return (a: PromptTemplate, b: PromptTemplate) => {
    if (sort === 'featured') {
      const featured = Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
      if (featured) return featured;
      if (a.isFeatured && b.isFeatured) {
        const manualOrder = (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0);
        if (manualOrder) return manualOrder;
      }
      return b.useCount - a.useCount || stableFallback(a, b);
    }
    if (sort === 'latest') return stableFallback(a, b);
    if (sort === 'favorites') {
      return b.favoriteCount - a.favoriteCount || stableFallback(a, b);
    }
    return b.useCount - a.useCount || stableFallback(a, b);
  };
}
