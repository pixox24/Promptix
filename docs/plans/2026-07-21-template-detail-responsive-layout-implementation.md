# 模板详情页响应式预览与相似模板实施计划

日期：2026-07-21

## 阶段一：建立可测试的编辑基线

涉及文件：

- `apps/web/src/hooks/usePromptStudioState.ts`
- `apps/web/src/lib/promptStudioDirtyState.ts`（新增）
- `apps/web/test/prompt-studio-dirty-state.test.ts`（新增）

步骤：

1. 提取稳定的编辑快照构建函数，包含变量、提示词模式、手动提示词和展示图。
2. 在状态中记录当前保存基线。
3. 暴露 `isDirty`。
4. 保存草稿、加载草稿、重置和模板初始化时更新基线。
5. 单元测试各种状态变化，避免对象键顺序导致误判。

## 阶段二：修正图片比例和粘性预览

涉及文件：

- `apps/web/src/components/detail/MediaCard.tsx`
- `apps/web/src/components/detail/PromptStudioDetail.tsx`
- `apps/web/src/index.css`
- `apps/web/test/detail-preview-layout.test.ts`（新增）

步骤：

1. 移除左右等高类名和固定高度 CSS。
2. 在封面加载后记录真实自然尺寸，生成图继续使用返回尺寸。
3. 改为完整显示图片，并增加动态视口高度上限。
4. 在桌面双栏中为预览卡片增加粘性容器。
5. 添加结构测试，防止固定高度和 `items-stretch` 回归。

## 阶段三：实现紧凑推荐卡和响应式侧栏

涉及文件：

- `apps/web/src/components/detail/SimilarTemplateCompactCard.tsx`（新增）
- `apps/web/src/components/detail/SimilarTemplateRail.tsx`（新增）
- `apps/web/src/components/detail/PromptStudioDetail.tsx`
- `apps/web/src/pages/DetailPage.tsx`
- `apps/web/src/index.css`
- `apps/web/test/detail-similar-layout.test.ts`（新增）

步骤：

1. 新增只包含封面和标题的紧凑链接卡片。
2. 实现双侧分组和单侧两张一页的切换逻辑。
3. 使用 CSS 媒体查询建立三档布局。
4. 侧栏模式隐藏底部重复列表；降级模式恢复完整 `TemplateGrid`。
5. 保证主工作区列宽达到最低值，防止推荐栏挤压编辑区域。

## 阶段四：实现受保护跳转

涉及文件：

- `apps/web/src/components/detail/UnsavedTemplateNavigationDialog.tsx`（新增）
- `apps/web/src/components/detail/SimilarTemplateCompactCard.tsx`
- `apps/web/src/components/detail/PromptStudioDetail.tsx`
- `apps/web/test/similar-template-navigation.test.ts`（新增）

步骤：

1. 只拦截无修饰键的普通左键点击。
2. 未修改时直接导航。
3. 已修改时打开三操作弹窗。
4. 将现有保存逻辑提取为可复用函数，使“保存并打开”能够等待保存完成后导航。
5. 实现 Escape、焦点恢复和取消行为。

## 阶段五：验证与回归

验证命令：

```bash
npm run test -w @promptix/web
npm run lint -w @promptix/web
npm run build -w @promptix/web
```

浏览器验证尺寸：

- 1920px：双侧推荐栏，四张卡分列展示。
- 1600px：单侧推荐栏，可切换两组卡片。
- 1366px：相似模板位于主区域下方。
- 1024px：双栏核心工作区可用，底部推荐不挤压主区。
- 768px 和 390px：上下布局，预览不粘性，推荐可浏览。

图片样本：

- 16:9 横图；
- 1:1 方图；
- 4:5 竖图；
- 9:16 超长竖图。

交互回归：

- 未修改直接跳转；
- 修改后取消；
- 修改后直接打开；
- 修改后保存并打开；
- Ctrl/Cmd 点击新标签；
- 草稿保存、加载、删除；
- 生成图片后脏状态；
- 收藏、复制和重置。

