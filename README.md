# Promptix

帮助用户发现、浏览、填写变量、保存并使用高质量 AI 图像生成提示词模板。

## 技术栈

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- React Router

## 本地运行

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
npm run preview
```

## 页面结构

| 路径 | 说明 |
|------|------|
| `/` | 发现页：价值主张、搜索、分类、精选/热门/最新 |
| `/library` | 模板库：搜索、分类/标签筛选、排序 |
| `/template/:id` | 详情：变量填写、Prompt 预览/复制、收藏/草稿 |
| `/my` | 我的提示词：收藏、最近使用、草稿 |

## MVP 边界

已实现：浏览搜索、筛选排序、变量化 Prompt、复制、收藏/最近/草稿（localStorage）、「立即生成」占位。

未实现：真实模型 API、登录账号、社区投稿、评论、付费与团队协作。
