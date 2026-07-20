import {
  IconClock,
  IconFlame,
  IconSearch,
  IconSpark,
  IconTrophy,
} from '../icons';
import type { SortOption } from '../../types/prompt';
import { TEMPLATE_USE_SCENARIOS } from '@promptix/shared';

export const useScenarios = TEMPLATE_USE_SCENARIOS;

export const styleFilters = [
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
] as const;

export const themeFilters = [
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
] as const;

const sortItems: {
  id: SortOption;
  label: string;
  icon: typeof IconFlame;
}[] = [
  { id: 'hot', label: '热门', icon: IconFlame },
  { id: 'featured', label: '精选', icon: IconSpark },
  { id: 'favorites', label: '高赞', icon: IconTrophy },
  { id: 'latest', label: '最新', icon: IconClock },
];

interface FilterSidebarProps {
  query: string;
  onQueryChange: (q: string) => void;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearScenarios: () => void;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="mb-3 px-1">
      <h3 className="text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground">
        {children}
      </h3>
      <div className="mt-2 h-px w-8 bg-gradient-to-r from-primary to-primary/0" />
    </div>
  );
}

function ScenarioTags({
  selectedTags,
  onToggleTag,
}: Pick<FilterSidebarProps, 'selectedTags' | 'onToggleTag'>) {
  return (
    <div className="flex flex-wrap gap-2">
      {useScenarios.map((scenario) => {
        const selected = selectedTags.includes(scenario);
        return (
          <button
            key={scenario}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleTag(scenario)}
            className={`max-w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug transition-colors ${
              selected
                ? 'border-primary bg-primary/12 text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_25%,transparent)]'
                : 'border-black/10 bg-white/55 text-foreground/65 hover:border-primary/40 hover:bg-white/80 hover:text-foreground'
            }`}
          >
            {scenario}
          </button>
        );
      })}
    </div>
  );
}

function FilterTags({
  options,
  selectedTags,
  onToggleTag,
}: {
  options: readonly string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = selectedTags.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleTag(option)}
            className={`max-w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug transition-colors ${
              selected
                ? 'border-primary bg-primary/12 text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_25%,transparent)]'
                : 'border-black/10 bg-white/55 text-foreground/65 hover:border-primary/40 hover:bg-white/80 hover:text-foreground'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function FilterSidebar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  selectedTags,
  onToggleTag,
  onClearScenarios,
}: FilterSidebarProps) {
  return (
    <aside className="sticky top-24 z-20 hidden h-[calc(100vh-7.5rem)] w-[17.5rem] shrink-0 md:block">
      {/* Glass shell */}
      <div className="sidebar-glass relative flex h-full flex-col overflow-hidden rounded-2xl">
        {/* Soft light orbs for glass depth */}
        <div
          className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-primary/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full bg-white/70 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 h-24 w-24 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl"
          aria-hidden
        />

        {/* Header */}
        <div className="relative z-10 border-b border-white/40 px-5 pb-4 pt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/40">
            Explore
          </p>
          <h2 className="mt-1 text-[1.75rem] font-semibold leading-none tracking-tight text-foreground">
            筛选
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-foreground/45">
            搜索与标签，快速定位模板
          </p>
          <div className="relative mt-4">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/35"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="搜索标题、描述、提示词..."
              className="h-11 w-full rounded-xl border border-white/60 bg-white/55 py-2 pl-10 pr-3.5 text-[13px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none backdrop-blur-md transition-all placeholder:text-foreground/35 focus:border-primary/50 focus:bg-white/75 focus:ring-[3px] focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="sidebar-scroll relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5">
          <div className="flex flex-col gap-7">
            {/* Sort */}
            <section>
              <SectionTitle>排序</SectionTitle>
              <nav className="flex flex-col gap-1">
                {sortItems.map((item) => {
                  const Icon = item.icon;
                  const active = sort === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSortChange(item.id)}
                      className={`inline-flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-all duration-200 ${
                        active
                          ? 'bg-white/80 text-foreground shadow-[0_2px_12px_rgba(15,23,42,0.06),inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_40%,transparent)]'
                          : 'text-foreground/65 hover:bg-white/45 hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                          active
                            ? 'bg-primary/90 text-primary-foreground'
                            : 'bg-white/50 text-foreground/45'
                        }`}
                      >
                        <Icon size={15} />
                      </span>
                      {item.label}
                      {active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </section>

            {/* 使用场景 */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <SectionTitle>使用场景</SectionTitle>
                {selectedTags.some((tag) => useScenarios.includes(tag as (typeof useScenarios)[number])) && (
                  <button
                    type="button"
                    onClick={onClearScenarios}
                    className="text-[11px] font-medium text-foreground/45 hover:text-foreground"
                  >
                    清除
                  </button>
                )}
              </div>
              <div className="mb-2 px-1 text-[11px] text-foreground/45">
                {selectedTags.filter((tag) => useScenarios.includes(tag as (typeof useScenarios)[number])).length > 0
                  ? `已选 ${selectedTags.filter((tag) => useScenarios.includes(tag as (typeof useScenarios)[number])).length}`
                  : '可多选'}
              </div>
              <ScenarioTags selectedTags={selectedTags} onToggleTag={onToggleTag} />
            </section>

            {/* 风格 */}
            <section>
              <SectionTitle>风格</SectionTitle>
              <FilterTags options={styleFilters} selectedTags={selectedTags} onToggleTag={onToggleTag} />
            </section>

            {/* 画面主体 */}
            <section>
              <SectionTitle>画面主体</SectionTitle>
              <FilterTags options={themeFilters} selectedTags={selectedTags} onToggleTag={onToggleTag} />
            </section>
          </div>
        </div>

        {/* Bottom fade over scroll */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 rounded-b-2xl bg-gradient-to-t from-white/50 to-transparent"
          aria-hidden
        />
      </div>
    </aside>
  );
}

export function MobileFilterBar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  selectedTags,
  onToggleTag,
  onClearScenarios,
  open,
  onOpenChange,
}: FilterSidebarProps & {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <div className="sticky top-14 z-30 w-full py-2 md:hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="sidebar-glass inline-flex h-11 w-full items-center justify-between rounded-2xl px-4 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/90 text-primary-foreground">
            <IconFlame size={14} />
          </span>
          筛选
          {selectedTags.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {selectedTags.length}
            </span>
          )}
        </span>
        <span className="text-xs text-foreground/45">
          {sortItems.find((item) => item.id === sort)?.label ?? '热门'}
        </span>
      </button>

      {open && (
        <div className="sidebar-glass sidebar-scroll mt-2 max-h-[70vh] space-y-5 overflow-y-auto rounded-2xl p-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">筛选</h2>
            <div className="mt-2 h-px w-8 bg-gradient-to-r from-primary to-primary/0" />
          </div>

          <div className="relative">
            <IconSearch
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/35"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="搜索标题、描述、提示词..."
              className="flex h-11 w-full rounded-xl border border-white/60 bg-white/55 py-1 pl-10 pr-3 text-sm outline-none backdrop-blur-md"
            />
          </div>

          <div>
            <SectionTitle>排序</SectionTitle>
            <div className="flex gap-2">
              {sortItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSortChange(item.id)}
                  className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition-all ${
                    sort === item.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-white/50 text-foreground/70'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionTitle>使用场景</SectionTitle>
              {selectedTags.some((tag) => useScenarios.includes(tag as (typeof useScenarios)[number])) && (
                <button
                  type="button"
                  onClick={onClearScenarios}
                  className="text-[11px] font-medium text-foreground/45 hover:text-foreground"
                >
                  清除
                </button>
              )}
            </div>
            <div className="mb-2 text-[11px] text-foreground/45">
              {selectedTags.filter((tag) => useScenarios.includes(tag as (typeof useScenarios)[number])).length > 0
                ? `已选 ${selectedTags.filter((tag) => useScenarios.includes(tag as (typeof useScenarios)[number])).length}`
                : '可多选'}
            </div>
            <ScenarioTags selectedTags={selectedTags} onToggleTag={onToggleTag} />
          </div>

          <div>
            <SectionTitle>风格</SectionTitle>
            <FilterTags options={styleFilters} selectedTags={selectedTags} onToggleTag={onToggleTag} />
          </div>

          <div>
            <SectionTitle>画面主体</SectionTitle>
            <FilterTags options={themeFilters} selectedTags={selectedTags} onToggleTag={onToggleTag} />
          </div>

          <button
            type="button"
            className="h-11 w-full rounded-xl bg-foreground text-sm font-semibold text-white shadow-sm"
            onClick={() => onOpenChange(false)}
          >
            完成
          </button>
        </div>
      )}
    </div>
  );
}
