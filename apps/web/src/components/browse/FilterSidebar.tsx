import {
  IconClock,
  IconFlame,
  IconSearch,
  IconTrophy,
} from '../icons';
import type { SortOption } from '../../types/prompt';

export const useScenarios = [
  '产品营销',
  '社交媒体帖子',
  '海报 / 传单',
  '游戏素材',
  '漫画 / 故事板',
  '信息图 / 教育视觉图',
] as const;

export const styleFilters = [
  '3D 渲染',
  '动漫 / 漫画',
  'Q版 / Q萌风',
  '电影 / 电影剧照',
  '插画',
  '等距',
  '极简主义',
  '油画',
  '摄影',
  '复古 / 怀旧',
  '水彩画',
] as const;

export const themeFilters = [
  '摘要 / 背景',
  '建筑 / 室内设计',
  '角色',
  '城市风光 / 街道',
  '时尚单品',
  '食品 / 饮料',
  '团体 / 情侣',
  '网红 / 模特',
  '风景 / 自然',
  '人像 / 自拍',
  '产品',
  '文本 / 排版',
] as const;

const sortItems: {
  id: SortOption;
  label: string;
  icon: typeof IconFlame;
}[] = [
  { id: 'hot', label: '热门', icon: IconFlame },
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

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] transition-all duration-200 ${
        checked
          ? 'bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]'
          : 'text-foreground/70 hover:bg-white/55 hover:text-foreground'
      }`}
    >
      <span
        className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-200 ${
          checked
            ? 'border-primary bg-primary shadow-[0_1px_4px_color-mix(in_srgb,var(--color-primary)_40%,transparent)]'
            : 'border-black/12 bg-white/70 group-hover:border-black/20'
        }`}
        aria-hidden
      >
        {checked && (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="leading-snug">{label}</span>
    </label>
  );
}

export function FilterSidebar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  selectedTags,
  onToggleTag,
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
        </div>

        {/* Scrollable body */}
        <div className="sidebar-scroll relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5">
          <div className="flex flex-col gap-7">
            {/* Search */}
            <div className="relative">
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
              <SectionTitle>使用场景</SectionTitle>
              <div className="flex flex-col gap-0.5">
                {useScenarios.map((s) => (
                  <CheckboxRow
                    key={s}
                    label={s}
                    checked={selectedTags.includes(s)}
                    onChange={() => onToggleTag(s)}
                  />
                ))}
              </div>
            </section>

            {/* 风格 */}
            <section>
              <SectionTitle>风格</SectionTitle>
              <div className="flex flex-col gap-0.5">
                {styleFilters.map((s) => (
                  <CheckboxRow
                    key={s}
                    label={s}
                    checked={selectedTags.includes(s)}
                    onChange={() => onToggleTag(s)}
                  />
                ))}
              </div>
            </section>

            {/* 主题 */}
            <section>
              <SectionTitle>主题</SectionTitle>
              <div className="flex flex-col gap-0.5">
                {themeFilters.map((s) => (
                  <CheckboxRow
                    key={s}
                    label={s}
                    checked={selectedTags.includes(s)}
                    onChange={() => onToggleTag(s)}
                  />
                ))}
              </div>
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
          {sort === 'hot' ? '热门' : sort === 'latest' ? '最新' : '高赞'}
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
            <SectionTitle>风格</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {styleFilters.map((s) => {
                const on = selectedTags.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onToggleTag(s)}
                    className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                      on
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-white/50 text-foreground/65 ring-1 ring-black/5'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionTitle>主题</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {themeFilters.map((s) => {
                const on = selectedTags.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onToggleTag(s)}
                    className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                      on
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-white/50 text-foreground/65 ring-1 ring-black/5'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
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
