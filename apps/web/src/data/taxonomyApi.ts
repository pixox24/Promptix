import type { TaxonomyDimension } from '@promptix/shared';
import { api } from '../lib/api';

export type TaxonomyTerm = {
  id: string;
  dimension: TaxonomyDimension;
  slug: string;
  label: string;
  description: string;
  aliases?: string[];
  enabled?: boolean;
  sortOrder: number;
  referenceCount?: number;
};

export async function fetchTaxonomy(options: {
  admin?: boolean;
  dimension?: TaxonomyDimension;
  includeDisabled?: boolean;
} = {}) {
  const params = new URLSearchParams();
  if (options.dimension) params.set('dimension', options.dimension);
  if (options.includeDisabled) params.set('includeDisabled', 'true');
  const base = options.admin ? '/api/admin/taxonomy' : '/api/taxonomy';
  return (await api<{ items: TaxonomyTerm[] }>(`${base}?${params}`)).items;
}
