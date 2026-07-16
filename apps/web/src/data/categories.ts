import type { TemplateCategory } from '../types/prompt';

export interface CategoryMeta {
  id: TemplateCategory | 'all';
  label: string;
  description: string;
  icon: string;
}

export const categories: CategoryMeta[] = [
  { id: 'all', label: '全部', description: '浏览所有模板', icon: 'grid' },
  {
    id: 'portrait',
    label: '人像写真',
    description: '肖像、时尚与氛围人像',
    icon: 'portrait',
  },
  {
    id: 'ecommerce',
    label: '电商产品',
    description: '商品主图与场景图',
    icon: 'box',
  },
  {
    id: 'poster',
    label: '海报视觉',
    description: '活动海报与宣传图',
    icon: 'poster',
  },
  {
    id: 'logo',
    label: 'Logo 品牌',
    description: '标志与品牌识别',
    icon: 'logo',
  },
  {
    id: 'illustration',
    label: '插画创意',
    description: '手绘与风格化插画',
    icon: 'illustration',
  },
  {
    id: 'edit',
    label: '图像编辑',
    description: '修图、扩图与风格迁移',
    icon: 'edit',
  },
];

/** 与 HeroPrompt 对齐的展示标签 */
export const popularTags = [
  '摄影',
  '电影 / 电影剧照',
  '人像 / 自拍',
  '网红 / 模特',
  '时尚单品',
  '复古 / 怀旧',
  '极简主义',
  '插画',
  '3D 渲染',
  '产品营销',
  '社交媒体帖子',
  '海报 / 传单',
];

export const categoryLabelMap: Record<TemplateCategory, string> = {
  portrait: '人像写真',
  ecommerce: '电商产品',
  poster: '海报视觉',
  logo: 'Logo 品牌',
  illustration: '插画创意',
  edit: '图像编辑',
};
