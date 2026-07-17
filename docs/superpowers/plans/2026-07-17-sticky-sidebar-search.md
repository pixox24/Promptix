# Sticky Sidebar Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the desktop sidebar search input visible while its filters scroll, without changing query behavior or the mobile filter panel.

**Architecture:** `FilterSidebar` already has a fixed shell with a header plus a `sidebar-scroll` body. Relocate the existing controlled search input into the fixed header and leave the scroll body responsible for sort and tag controls. Add a small source-level regression test that asserts this structural boundary.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node.js built-in test runner.

## Global Constraints

- Change `apps/web/src/components/browse/FilterSidebar.tsx` markup and spacing only.
- Keep the existing `query` value and `onQueryChange` callback unchanged.
- Do not change `MobileFilterBar`.
- Use the existing search input styles unchanged.

---

### Task 1: Keep the desktop search outside the scrolling filter body

**Files:**
- Create: `apps/web/test/filter-sidebar-layout.test.mjs`
- Modify: `apps/web/src/components/browse/FilterSidebar.tsx:158-188`

**Interfaces:**
- Consumes: `FilterSidebarProps.query: string` and `FilterSidebarProps.onQueryChange: (q: string) => void`.
- Produces: a desktop search input rendered before the `sidebar-scroll` container; the mobile search input remains unchanged.

- [x] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL('../src/components/browse/FilterSidebar.tsx', import.meta.url);

test('keeps the desktop search before the scrolling filter body', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const desktopSearch = source.indexOf('placeholder="搜索标题、描述、提示词..."');
  const scrollBody = source.indexOf('sidebar-scroll relative z-10 flex-1');

  assert.ok(desktopSearch >= 0, 'desktop search input should exist');
  assert.ok(scrollBody >= 0, 'desktop filter body should exist');
  assert.ok(desktopSearch < scrollBody, 'desktop search should appear before the scroll body');
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test apps/web/test/filter-sidebar-layout.test.mjs`

Expected: FAIL with `desktop search should appear before the scroll body`, because the current search input is nested inside `sidebar-scroll`.

- [x] **Step 3: Move the existing desktop search markup into the fixed header**

Replace the desktop header and start of the scroll body with:

```tsx
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

<div className="sidebar-scroll relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5">
  <div className="flex flex-col gap-7">
    {/* Sort */}
```

Delete only the original desktop `/* Search */` block from the scroll body. Preserve its input attributes and classes exactly.

- [x] **Step 4: Run the regression test and web quality checks**

Run: `node --test apps/web/test/filter-sidebar-layout.test.mjs && npm run build:web && npm run lint`

Expected: the regression test passes; TypeScript/Vite build and web lint finish with exit code 0.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/browse/FilterSidebar.tsx apps/web/test/filter-sidebar-layout.test.mjs docs/superpowers/plans/2026-07-17-sticky-sidebar-search.md
git commit -m "fix: keep sidebar search visible"
```
