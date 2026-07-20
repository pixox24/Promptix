/** 提示词变量类型 */
import type { SemanticClassification } from '@promptix/shared';

export type VariableType =
  | 'text'
  | 'select'
  | 'number'
  | 'ratio'
  | 'image';

export interface PromptVariable {
  id: string;
  key: string;
  label: string;
  type: VariableType;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  options?: string[];
  suggestions?: string[];
  description?: string;
}

export type TemplateCategory =
  | 'portrait'
  | 'ecommerce'
  | 'poster'
  | 'logo'
  | 'illustration'
  | 'edit';

export interface PromptTemplate {
  id: string;
  name: string;
  summary: string;
  description: string;
  coverImage: string;
  category: TemplateCategory;
  tags: string[];
  variables: PromptVariable[];
  /** 含 {{variableKey}} 占位符的提示词骨架 */
  promptTemplate: string;
  scenarios: string[];
  semantic?: SemanticClassification;
  outputTypeLabel?: string;
  isFeatured?: boolean;
  featuredOrder?: number;
  isHot?: boolean;
  favoriteCount: number;
  useCount: number;
  createdAt: string;
}

export type SortOption = 'relevance' | 'hot' | 'featured' | 'favorites' | 'latest';

export interface SavedDraft {
  version: 2;
  id: string;
  templateId: string;
  templateName: string;
  coverImage: string;
  values: Record<string, string>;
  prompt: string;
  promptMode: 'auto' | 'manual';
  manualPrompt?: string;
  aspectRatio?: string;
  generatedImage?: {
    url: string;
    width?: number;
    height?: number;
  };
  updatedAt: string;
}

export interface RecentItem {
  templateId: string;
  usedAt: string;
}

export type PageTab = 'favorites' | 'recent' | 'drafts';
