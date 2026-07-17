# Prompt Detail Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the prompt detail hero as a polished, viewport-contained desktop workspace without changing its business behavior.

**Architecture:** Keep state and actions in `DetailPage`, but regroup the visual/media metadata and form/action surfaces into one responsive shell. Tighten `VariableForm` and `PromptPreview` through opt-in presentation props so their behavior remains reusable.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Node test runner, Vite.

## Global Constraints

- At 1440×900, cover image, metadata, variables, prompt entry, and primary actions must be visible without page scroll.
- Desktop workspace uses a roughly 16:9 horizontal composition; mobile and tablet remain natural single-column layouts.
- Preserve all current data, validation, favorites, copy, draft, and generate handlers.
- Do not add dependencies or synthetic visual assets.

---

### Task 1: Lock the desktop layout contract

**Files:**
- Create: `apps/web/test/prompt-detail-layout.test.mjs`
- Modify: `apps/web/src/pages/DetailPage.tsx`

**Interfaces:**
- Consumes: existing `PromptTemplate`, `VariableForm`, `PromptPreview`, and action handlers.
- Produces: `data-testid="prompt-detail-workspace"`, `data-testid="prompt-detail-media"`, and `data-testid="prompt-detail-panel"` layout anchors.

- [x] **Step 1: Write failing source-contract tests** for the shared workspace, viewport height, media overlay, internal variable scroller, and persistent action footer.
- [x] **Step 2: Run** `node --test apps/web/test/prompt-detail-layout.test.mjs`; expect failures because the anchors and layout contracts do not exist.
- [x] **Step 3: Recompose `DetailPage`** into the responsive media/panel shell while preserving all handlers.
- [x] **Step 4: Run the focused test again** and expect all assertions to pass.

### Task 2: Refine the form and prompt controls

**Files:**
- Modify: `apps/web/src/components/template/VariableForm.tsx`
- Modify: `apps/web/src/components/template/PromptPreview.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Consumes: current component props and Tailwind theme tokens.
- Produces: compact control styling and shared `detail-*` surface utilities without changing form behavior.

- [x] **Step 1: Add failing assertions** for compact field rhythm and prompt surface styling.
- [x] **Step 2: Run the focused test** and confirm the new assertions fail for missing classes.
- [x] **Step 3: Apply compact spacing, premium focus/selected states, and layered surface utilities.**
- [x] **Step 4: Run the focused test** and expect all assertions to pass.

### Task 3: Verify behavior and visual fit

**Files:**
- Create: `design-qa.md`
- Save evidence: `.codex-audit/prompt-detail/02-after.png`

**Interfaces:**
- Consumes: running Vite detail route at `http://localhost:4173/template/tpl-portrait-golden`.
- Produces: fresh automated checks, build output, browser screenshot, interaction evidence, and final design QA status.

- [x] **Step 1: Run** `node --test apps/web/test/*.test.mjs`, `npm run lint -w @promptix/web`, and `npm run build -w @promptix/web`.
- [x] **Step 2: Inspect at 1440×900** and confirm the workspace and primary CTA are visible with no horizontal overflow.
- [x] **Step 3: Test one text input, one select-style variable, Prompt expansion, favorite, and copy interaction.**
- [x] **Step 4: Save the final screenshot and record `final result: passed` only if P0/P1/P2 issues are cleared.**
