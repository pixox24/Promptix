import assert from 'node:assert/strict';
import test from 'node:test';
import { TEMPLATE_USE_SCENARIOS } from '@promptix/shared';
import { styleFilters, themeFilters, useScenarios } from '../src/components/browse/FilterSidebar';
import { templates } from '../src/data/templates';
import { readFile } from 'node:fs/promises';

const expected = [
  '电商商品图',
  '广告与营销创意',
  '社交媒体内容',
  '产品摄影与 Mockup',
  '海报、传单与活动物料',
  '品牌视觉与 Logo 灵感',
  '人物肖像与头像',
  '角色设计与故事叙事',
  '游戏与数字资产',
  '概念艺术与灵感探索',
  '教育、信息图与演示视觉',
  '壁纸、艺术创作与个人表达',
];

test('uses the shared, ordered scenario taxonomy in the homepage sidebar', () => {
  assert.deepEqual([...TEMPLATE_USE_SCENARIOS], expected);
  assert.equal(useScenarios, TEMPLATE_USE_SCENARIOS);
});

test('keeps built-in template scenarios within the shared taxonomy', () => {
  const allowed = new Set<string>(TEMPLATE_USE_SCENARIOS);
  const used = new Set(templates.flatMap((template) => template.scenarios));

  assert.deepEqual([...used].filter((scenario) => !allowed.has(scenario)), []);
  assert.deepEqual(expected.filter((scenario) => !used.has(scenario)), []);
});

test('renders scenarios as wrapping toggle tags instead of checkboxes', async () => {
  const source = await readFile(
    new URL('../src/components/browse/FilterSidebar.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /className="flex flex-wrap gap-2"/);
  assert.match(source, /aria-pressed=\{active\}/);
  assert.doesNotMatch(source.match(/function TermTags[\s\S]*?\n}\n/)?.[0] ?? '', /type="checkbox"/);
  assert.match(source, />\s*清除\s*<\/button>/);
});

test('uses the ordered style taxonomy', () => {
  assert.deepEqual([...styleFilters], [
    '写实摄影',
    '电影感•电影剧照',
    '3D 渲染',
    '动漫•二次元',
    '商业插画',
    '概念艺术/游戏原画',
    '极简主义',
    '复古•怀旧',
    '水彩与手绘',
    '油画与古典绘画',
    'Q 版•萌系角色',
    '等距•信息可视化',
  ]);
});

test('uses the ordered subject taxonomy with bullet separators', () => {
  assert.deepEqual([...themeFilters], [
    '人像•人物',
    '产品•商品',
    '角色•IP',
    '自然•风景',
    '建筑•室内',
    '时尚•服饰',
    '城市•街头',
    '食品•饮料',
    '动物•宠物',
    '人物关系•生活方式',
    '抽象•背景',
    '文字•排版',
  ]);
});
