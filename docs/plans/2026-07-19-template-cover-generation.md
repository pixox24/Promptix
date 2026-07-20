# 模板封面生成落地方案

## 目标

管理员在编辑模板时生成的封面必须代表模板的实际视觉能力，而不是把 `{{variable}}` 骨架直接发送给生图模型。

## 现状与问题

编辑页原先把 `form.promptTemplate` 直接放入 `image_generate` job。变量未渲染，`defaultValue`、`negativePrompt` 和 `ratio` 也未参与请求。普通用户生成链路已通过 `renderPromptTemplate` 正确渲染，因此本方案只改管理员封面链路。

## 目标链路

1. 前端只提交 `type=image_generate`、`templateId`、`source=template_cover` 和数量。
2. API 读取模板并校验变量 schema。
3. 每个变量按 `defaultValue -> suggestions/options 首项 -> 空字符串` 解析默认值。
4. 服务端调用共享 `renderPromptTemplate`，拒绝残留占位符。
5. 服务端自动提取默认 `ratio`，合并模板负面提示词，并追加封面专用约束。
6. 将最终 prompt、negativePrompt、aspectRatio 和 metadata 写入 generation job input，供 worker 和后台审计。
7. worker 沿用现有 `image_generate` 适配器，生图结果继续通过 `set-cover` 保存。

## 封面专用约束

要求主体突出、主体与背景分离、适合模板预览；禁止在画面中渲染变量占位符、UI 标签、水印和解释性文字。

## 默认值策略

`defaultValue` 优先；text/number 使用第一条 suggestions；select/ratio 使用第一条 options；没有候选值时使用空字符串。管理员应在发布前为关键变量配置默认值。

## 可观测性

job input.metadata 保存 `source`、原始 `templatePromptTemplate` 和 `resolvedValues`，同时保存实际发送的最终 prompt，便于定位生图质量问题。

## 验证

覆盖未渲染占位符防护、默认值渲染、负面词和比例传递；运行 shared、API、worker、web 测试及 TypeScript 构建。
