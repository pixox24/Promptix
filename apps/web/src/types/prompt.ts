/** 提示词变量类型 */
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
  isFeatured?: boolean;
  isHot?: boolean;
  favoriteCount: number;
  useCount: number;
  createdAt: string;
}

export type SortOption = 'hot' | 'latest' | 'favorites';

export interface SavedDraft {
  id: string;
  templateId: string;
  templateName: string;
  coverImage: string;
  values: Record<string, string>;
  prompt: string;
  updatedAt: string;
}

export interface RecentItem {
  templateId: string;
  usedAt: string;
}

export type PageTab = 'favorites' | 'recent' | 'drafts';
