import type { SortOption } from '../types/prompt';

export interface TemplateBrowseState {
  query: string;
  normalizedQuery: string;
  hasQuery: boolean;
  sort: SortOption;
  needsCanonicalSort: boolean;
}

export function deriveBrowseState(params: URLSearchParams): TemplateBrowseState {
  const query = params.get('q') ?? '';
  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length > 0;
  const requestedSort = params.get('sort') as SortOption | null;
  const needsCanonicalSort = !hasQuery && requestedSort === 'relevance';
  const sort = needsCanonicalSort ? 'hot' : requestedSort ?? (hasQuery ? 'relevance' : 'hot');
  return { query, normalizedQuery, hasQuery, sort, needsCanonicalSort };
}

export function browseParamsWithQuery(params: URLSearchParams, value: string) {
  const current = deriveBrowseState(params);
  const next = new URLSearchParams(params);
  const normalizedValue = value.trim();
  const willHaveQuery = normalizedValue.length > 0;

  if (willHaveQuery) next.set('q', value);
  else next.delete('q');

  if (!current.hasQuery && willHaveQuery) {
    // Entering search always starts from its meaningful default: relevance.
    next.delete('sort');
  } else if (current.hasQuery && !willHaveQuery && current.sort === 'relevance') {
    // Relevance has no meaning after the search is cleared; hot is the browse default.
    next.delete('sort');
  }
  next.delete('page');
  return next;
}

export function browseParamsWithSort(params: URLSearchParams, value: SortOption) {
  const current = deriveBrowseState(params);
  const next = new URLSearchParams(params);
  const safeValue = !current.hasQuery && value === 'relevance' ? 'hot' : value;
  const defaultSort: SortOption = current.hasQuery ? 'relevance' : 'hot';

  if (safeValue === defaultSort) next.delete('sort');
  else next.set('sort', safeValue);
  next.delete('page');
  return next;
}
