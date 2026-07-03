# Secretsauce UX/UI Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This file is the single source of truth.** As you complete AND verify each task, check its box here and commit.

**Goal:** Transform the working-but-barebones secretsauce frontend into a warm, family-friendly, lightly playful product built on a real design system ("Honey & Poppy"), with reusable primitives, proper navigation, and polished per-view UX — presentation layer only, no backend changes.

**Architecture:** Introduce a token-driven CSS design system in `src/assets/main.css`, vendored fonts (Inter + SN Pro), Lucide icons, and a library of reusable primitive components under `src/components/base/`. Then rework each view to consume those primitives. Reuse all existing stores/API/composables — this is a presentation-layer overhaul.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vite, Pinia, Vue Router, axios, Vitest (unit), Playwright (e2e), `@lucide/vue` (new — the maintained successor to the deprecated `lucide-vue-next`; same icon names/API), web fonts via `@fontsource`. **PrimeVue is present but unstyled** — do not build new UI on PrimeVue; build the primitives ourselves.

---

## 🔖 SESSION HANDOFF / RESUME HERE  *(updated 2026-06-29 — through Task 0.5)*

> Read this section first when resuming in a new session. It captures live state that isn't obvious from the plan body.

### Where the work lives
- **Worktree:** `C:\github\secretsauce\.claude\worktrees\ux-overhaul` — branch **`worktree-ux-overhaul`**, branched from the `ui-shell-rework` HEAD (so it carries all prior unmerged work + this plan). Run all commands from here. Do NOT use the parent checkout.
- **Frontend:** `frontend/` (Vue 3 + TS). Verify with (from `frontend/`): `npm run type-check`, `npm run build`, `npx vitest run`. If `cd frontend` fails after a worktree switch, use the absolute path `C:\github\secretsauce\.claude\worktrees\ux-overhaul\frontend`.
- **Deps already installed:** `@fontsource/inter`, `@fontsource/sn-pro`, `@lucide/vue`. (The deprecated `lucide-vue-next` was removed.)

### How this is being executed
- Skill: **superpowers:subagent-driven-development** — fresh implementer subagent per task → task review (spec + quality) → fix loop if needed → mark complete → commit. One implementer in flight at a time; the next task that touches the same files must wait for the prior to land.
- **Progress ledger:** `.superpowers/sdd/progress.md` (git-ignored scratch) — the recovery map. Per-task briefs/reports/diffs also live under `.superpowers/sdd/`. On resume: `cat .superpowers/sdd/progress.md` and trust it + `git log` over memory.
- Helper scripts (in the SDD skill dir): `task-brief PLAN N`, `review-package BASE HEAD`. Reviewer/implementer prompt templates are in that skill dir too.
- **Checkpoint discipline:** pause for user sign-off at each phase boundary. **Phase 0 has not been signed off yet.**

### Decisions made with the user (binding)
1. **Cook stats:** ONE sanctioned backend change approved (Task 3.0) to expose `times_cooked`/`last_cooked_at` from `RecipeCookLog` on the recipe read schema. Everything else stays presentation-only.
2. **Fonts:** sourced via `@fontsource/inter` + `@fontsource/sn-pro` (npm) instead of hand-vendoring woff2 from GitHub (raw fetch was sandbox-blocked). Same fonts, registered families `'Inter'` / `'SN Pro'` match the tokens.
3. **Icons:** use `@lucide/vue` (not the deprecated `lucide-vue-next`). Same icon names/API: `import { Camera } from '@lucide/vue'`.

### Baseline note
Before Phase 0, the branch's `type-check`/`build` were already RED (pre-existing tsconfig test-glob bug + a real RecipeForm `undefined`→`null` bug + 5 leaked test rejections). Fixed in commit `ddc6991` (`fix: green the frontend type-check/build baseline`). Baseline is now green: type-check ✓, build ✓, tests ✓.

### Commit history so far (oldest→newest)
- `91d5b4d` docs: add UX/UI overhaul implementation plan
- `ddc6991` fix: green the frontend type-check/build baseline
- `a292fac` feat(ui): add Honey & Poppy design tokens  *(Task 0.1)*
- `8e35b25` feat(ui): wire Inter and SN Pro fonts via @fontsource  *(Task 0.2+0.3)*
- `a960f14` feat(ui): add lucide-vue-next and BaseIcon wrapper  *(Task 0.4)*
- `909c42d` refactor(ui): migrate to @lucide/vue  *(Task 0.4 follow-up, review-driven)*
- `125b434` docs: add session-handoff/resume section
- `9159121` feat(ui): add BaseButton and IconButton primitives  *(Task 0.5)*
- `44bf46c` fix(ui): primary button hover no longer borrows danger red  *(0.5 fix)*
- `bc90983` fix(ui): address Task 0.5 review findings  *(0.5 fix)*

**Integration:** after Task 0.5, `ui-shell-rework` was fast-forwarded (local only) to the worktree branch `worktree-ux-overhaul`, so both branches point at the same commit. Continue work on `worktree-ux-overhaul` in the worktree; fast-forward `ui-shell-rework` again at later checkpoints. Nothing pushed to origin yet.

### Status snapshot
- ✅ **Task 0.1** — design tokens (reviewed, clean)
- ✅ **Task 0.2+0.3** — Inter + SN Pro fonts (reviewed, clean)
- ✅ **Task 0.4** — `BaseIcon` + `@lucide/vue` (reviewed, clean; 9 tests)
- ✅ **Task 0.5** — `BaseButton` + `IconButton` (reviewed clean after fix loop; 18 tests). Test suite at **193 tests passing**.
- ⏭️ **NEXT: Task 0.6** — `BaseInput` + `BaseTextarea`. Extract brief: `task-brief docs/plans/ux-overhaul.md 0.6`; dispatch a fresh implementer (TDD); review; commit. New BASE for 0.6 = `bc90983`.
- ⏳ **Tasks 0.7 → 0.17** — not started (chips, card/skeleton, PourLoader, wordmark+favicon, progress/stepper, segmented/empty, confirm, draglist, bottomsheet+toast tokenize, tabbar/usermenu/avatar, emoji sweep). **Reminder:** when Task 0.9 builds `PourLoader`, swap BaseButton's temporary inline spinner for it.
- ⏳ **Phases 1–11** — not started. Phase 0 checkpoint (user sign-off) still pending after 0.17.

### Cross-task reminders for later phases
- `BottomSheet.vue`, `useToast.ts`/`ToastHost.vue` already exist — UPGRADE/tokenize them (Task 0.15), don't duplicate.
- Build our own `BaseCard`/`ConfirmDialog` (avoid PrimeVue's `Card`/`ConfirmDialog` name clash).
- `RecipeForm.vue` will be reworked in Phase 5; its two `?? null` baseline fixes are already in.
- Test convention: colocated `*.test.ts` next to the component; `tsconfig.app.json` excludes `*.test.ts`, `tsconfig.vitest.json` includes them (fixed in baseline commit).

---

## Global Constraints

(Every task's requirements implicitly include this section. Values copied verbatim from the spec.)

- **Tokens only.** No new hardcoded hex values in components — consume the CSS variables from Phase 0. Replace existing hardcoded colors as you touch each view.
- **Mobile-first**, then enhance for desktop. All features must work at **375px**. Avoid horizontal-scroll grids on phones.
- **Accessibility:** semantic checkboxes for checkable lists; `aria-label` on icon-only buttons; keyboard-operable menus/sheets/dialogs; AA color contrast (brand red `#D2452B` carries white text — verify in context); visible `:focus-visible` styles.
- **Reduced motion:** every animation (including the pour loader) needs a `prefers-reduced-motion: reduce` fallback.
- **Swipe actions need a non-swipe fallback** (same action in an overflow `⋯` menu) for desktop and assistive tech.
- **AI is a means to an end** — never brand/label anything "the AI app." Prefer warm, human, kitchen language over "AI/generate/magic" wording. Regenerate icon is `RefreshCw`/`RotateCw`, never a sparkle/AI glyph.
- **No backend/schema changes.** Consume existing APIs/models. Surfacing existing fields is expected.
- **No OAuth/social login.** Email + password only.
- **Recipe-detail ingredient/step check state is in-memory only** — not persisted across sessions/reloads.
- **No print/share on recipe detail.**
- **Admin stays dark**, but driven from the same token system.
- **Component conventions** (from `frontend/CLAUDE.md`): Composition API only, `<script setup lang="ts">`, scoped styles only, `defineProps<T>()`/`defineEmits<T>()`, never mutate props, PascalCase components, `Base*` prefix for generic primitives, domain prefix otherwise. Components don't call API directly — props in, events out.

### Definition of Done (gate for checking ANY box)

A box may only be checked when **all** hold:
- `npm run type-check` passes and `npm run build` passes.
- `npm run test:unit` passes; new tests exist for any logic added (scaling, progress, selection, reordering).
- The affected view renders correctly at **375px** and a desktop width.
- No regression in existing behavior except the changes this spec calls for.
- Icon-only controls have `aria-label`s; interactive states have visible `:focus-visible`; motion respects `prefers-reduced-motion`.

### Verification commands (run from `frontend/`)

```bash
npm run type-check      # vue-tsc --build
npm run build           # type-check + vite build
npm run test:unit       # vitest (use: npx vitest run <file> for a single file)
npm run lint            # oxlint + eslint
```

> **Cook-stats data gap — RESOLVED (user decision, read before Phase 3):** The cook-count / last-cooked data from `RecipeCookLog` is **NOT currently exposed** by the recipe API or `schemas/recipe.py`. The spec's "no backend changes" constraint conflicts with surfacing it on cards. **The user has approved a small, targeted backend change** to expose cook stats on the recipe read schema/route so cards show real data. Phase 3 therefore includes a backend task (3.0) that adds `times_cooked` + `last_cooked_at` to the recipe read schema, populated from `RecipeCookLog`, plus matching frontend type fields. This is the **only** sanctioned backend change in this overhaul — everything else stays presentation-only.

---

# PART A — Design-System Reference

This is the canonical reference for tokens, fonts, icons, and primitives. Every later phase consumes these.

## A.1 Color tokens — theme "Honey & Poppy"

Defined as CSS custom properties on `:root` in `src/assets/main.css`. Brand values are locked; supporting neutrals/tints are derived.

```css
:root{
  /* brand (locked) */
  --color-bg:            #FFF9F0;
  --color-surface:       #FFFFFF;
  --color-text:          #3A2E20;
  --color-primary:       #D2452B;
  --color-accent:        #F2A23C;
  --color-success:       #4E8A48;
  --color-warning:       #E59A2B;
  --color-danger:        #9B3320;

  /* derived neutrals & tints */
  --color-surface-2:     #FFF1DC;
  --color-border:        #EFE1C9;
  --color-text-muted:    #8B7A60;
  --color-primary-ink:   #FFFFFF;   /* text on primary */
  --color-primary-soft:  #FBE5DE;   /* primary tint: hovers, ghost bg */
  --color-accent-soft:   #FFEDD2;   /* accent tint: chips, badges */
  --color-danger-soft:   #F7E2DC;

  /* meal-type tints (Timeline) */
  --meal-breakfast:      #FFF0D6;
  --meal-lunch:          #FFE3D6;
  --meal-dinner:         #FBE0E0;

  /* spacing (4px base) */
  --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem;
  --space-5:1.5rem; --space-6:2rem; --space-8:3rem;

  /* radius / shadow */
  --radius-sm:10px; --radius:16px; --radius-pill:999px;
  --shadow-sm:0 2px 8px rgba(40,30,20,.06);
  --shadow:0 6px 20px rgba(40,30,20,.09);

  /* type scale */
  --font-sans:'Inter', system-ui, -apple-system, sans-serif;
  --font-display:'SN Pro', 'Inter', system-ui, sans-serif;
  --text-xs:.75rem; --text-sm:.875rem; --text-base:1rem;
  --text-lg:1.125rem; --text-xl:1.375rem; --text-2xl:1.75rem; --text-3xl:2.25rem;
}
```

**Preserve** the existing `--bp-tablet: 768px` / `--bp-desktop: 1024px` breakpoint vars already in `main.css`. Update `body` to use `--font-sans`, `color: var(--color-text)`, `background: var(--color-bg)`.

## A.2 Fonts

- **Body / UI:** Inter → `--font-sans`. Vendor woff2 from https://github.com/rsms/inter under `src/assets/fonts/inter/` and declare `@font-face` (or use the variable font). `font-display: swap`.
- **Headings / titles / wordmark:** **SN Pro** from https://github.com/supernotes/sn-pro → `--font-display`. Not on npm — fetch woff2 from that repo (respect its license), vendor under `src/assets/fonts/sn-pro/`, declare `@font-face`. `font-display: swap`.
- Apply `--font-display` to `h1`–`h3`, recipe titles, wordmark, and major section headers; everything else uses `--font-sans`.

## A.3 Icons

- Install `@lucide/vue` (maintained successor to the deprecated `lucide-vue-next`; identical icon names + API; import as `import { Camera } from '@lucide/vue'`). Replace **every** emoji-as-icon in the codebase with a Lucide icon at standardized sizes (16 / 20 / 24).
- Build a tiny `BaseIcon` wrapper (`src/components/base/BaseIcon.vue`) that takes an icon component + size to standardize sizing and stroke.
- **Mapping** (adjust to context): camera→`Camera`, settings→`Settings`, edit→`Pencil`, delete→`Trash2`, favorite→`Heart`, book→`BookOpen`, overflow→`EllipsisVertical`, close→`X`, up/down→`ChevronUp`/`ChevronDown`, add→`Plus`, search→`Search`, check→`Check`, link→`Link`, image→`Image`, regenerate→`RefreshCw`/`RotateCw` (NOT a sparkle/AI glyph), shopping→`ShoppingCart`, plan/calendar→`CalendarDays`, recipes→`UtensilsCrossed`/`CookingPot`, user→`User`/`CircleUser`.

**Emoji-as-icon audit (replace all of these):** `App.vue` nav icons (🍳📅🛒⚙️). Grep the whole `frontend/src/` tree for emoji before declaring Phase 0 complete — search for the specific glyphs and any others found in MealSlot/EntryActionsMenu/Timeline/RecipeListView.

## A.4 Primitive components (build once under `src/components/base/`, reuse everywhere)

| Component | Responsibility | Notes |
|---|---|---|
| `BaseButton` | variants `primary`\|`secondary`\|`ghost`\|`danger`; sizes; loading/disabled | renders `<button>`; `:focus-visible` ring |
| `IconButton` | icon-only button; **requires `label` prop → `aria-label`** | wraps `BaseIcon` |
| `BaseInput` | labeled text input + error slot | v-model |
| `BaseTextarea` | labeled textarea + error slot | v-model |
| `Chip` | static pill label | tints via `--color-accent-soft` |
| `ToggleChip` | selectable pill; `v-model` boolean or in a group | semantic `aria-pressed` |
| `BaseCard` | surface container w/ radius+shadow | (named `BaseCard` to avoid PrimeVue `Card` clash) |
| `BottomSheet` | **UPGRADE existing** `src/components/BottomSheet.vue` to tokens + `BaseIcon` close | mobile sheet / desktop modal |
| `ConfirmDialog` | titled confirm/cancel dialog | (PrimeVue has one; build our own named `ConfirmDialog` in base/) |
| `Toast` / toast service | **REUSE existing** `composables/useToast.ts` + `ToastHost.vue`; restyle to tokens | already supports undo |
| `Skeleton` | shimmer placeholder block | reduced-motion → static |
| `EmptyState` | illustration slot + title + body + action slot | |
| `ProgressBar` | value/max thin bar + optional label | `role="progressbar"` aria values |
| `Stepper` | numeric +/− control | for servings; min/max props |
| `SegmentedTabs` | segmented control | for add-recipe sheet |
| `TabBar` | bottom nav (mobile) | Phase 1 |
| `BaseAvatar` / `UserMenu` | account icon + dropdown/sheet | Phase 1 |
| `DragList` | reorderable list wrapper; emits reordered array | reindex correctly (tested) |
| `PourLoader` | red dot falling top→bottom loop; static reduced-motion fallback | replaces all spinner/"Loading…" |
| `Wordmark` | red-dot + "secretsauce" display-font wordmark; dot-only variant | Phase 0/1 |

> **Reuse note:** `BottomSheet.vue`, `useToast.ts`, and `ToastHost.vue` already exist. Upgrade/restyle them to tokens; do NOT create parallel copies. Keep their existing `data-testid`s and event contracts so current tests keep passing. PrimeVue ships `Card`/`ConfirmDialog` names — we deliberately build our own `BaseCard`/`ConfirmDialog`; never import PrimeVue components for these.

## A.5 Branding primitives

- **Wordmark = a red dot.** Filled dot in `--color-primary` (drop of sauce) next to the "secretsauce" wordmark (display font). `Wordmark` component used in app shell + auth screens. Dot-only variant for favicon/app icon.
- **`PourLoader`** — a red dot (`--color-primary`) falling top→bottom on a loop; the global loading indicator and the motif inside skeleton/loading states. Static/reduced-motion fallback required. Replace `"Loading…"` text and current spinners with it.

---

# PART B — Per-View Implementation Specs

Each phase below restates its spec + acceptance criteria. Tasks live in PART C.

## Phase 0 — Design system & primitives *(do first — unblocks everything)*
Tokens in `main.css`; Inter + SN Pro vendored & wired; `lucide-vue-next` installed + all emoji replaced; primitives built under `src/components/base/`; `Wordmark` + dot favicon; `PourLoader` with reduced-motion fallback replacing text/spinner loaders.
**Acceptance:** typecheck+build pass; primitives each have a unit test or are exercised by a view test; no emoji icons remain in `frontend/src/`; loaders use `PourLoader`.

## Phase 1 — App shell & navigation (`App.vue`, new nav components)
- **Mobile:** fixed **bottom tab bar** — Recipes / Plan / Shopping (Lucide icon + label, clear active state) + a **user/account icon** at the end.
- **Desktop:** **top bar** — `Wordmark` left, same destinations as horizontal links, **user/account icon** right.
- **User/account icon opens a menu/sheet** with **Settings** + **Log out** (this is how Settings becomes reachable — not a top-level tab). Move existing "Log out" here. Admin link (superuser) stays reachable.
- Ensure routes exist/are linked for all destinations.
**Acceptance:** Settings + Shopping reachable; existing `data-testid="bottom-nav"` and `data-testid="logout"` still resolve (logout now inside the menu); 375px + desktop correct.

## Phase 2 — Auth (`LoginView.vue`, `RegisterView.vue`)
- Single **centered card** on themed background; `Wordmark` above the form. `BaseInput`/`BaseButton` primitives; inline field validation feedback. **No OAuth** — email+password (name on register).
**Acceptance:** validation messages render inline; existing login/register submit flow unchanged.

## Phase 3 — Recipe list (`RecipeListView.vue`, `RecipeCard.vue`)
- **Demote import:** remove inline import block. Single **"Add recipe"** action (primary button and/or FAB) opens a `BottomSheet` with three `SegmentedTabs`: **From URL / From photo / Write manually**, each hosting the corresponding flow.
- **Filter bar:** sticky, horizontally-scrollable chip row (`ToggleChip`s) — filters never push content down on mobile.
- **Card upgrades:** display-font title (hero, `--color-text`, strong hierarchy); time + servings as icon+value pairs; subtle favorite/heart; **cook-count/last-cooked from `RecipeCookLog`** (exposed via the sanctioned backend change in Task 3.0); **whole card is the tap target** (→ detail); **"Add to plan" is a small secondary affordance**, not competing with card click.
- **Loading:** `Skeleton` cards (pour motif), not "Loading recipes…". **Empty state:** illustrated `EmptyState` — title "No recipes yet", body "Import your first from a URL or snap a cookbook page", with Add-recipe action.
**Acceptance:** inline import gone; add-recipe sheet has 3 working tabs; filter row sticky & horizontal-scroll on mobile; card click → detail, add-to-plan still works without navigating; skeletons + empty state present.

## Phase 4 — Recipe detail (`RecipeDetailView.vue`)
"Cookbook" reading layout: hero title block (display font); **sticky meta bar** with a servings `Stepper` that **live-scales all ingredient quantities** (scale from base servings; sensible fraction/decimal formatting; **presentational only, do not persist**); two columns (ingredients | steps) desktop, single column mobile; **checkable ingredients** (semantic checkboxes) + **step done/progress** (in-memory only); **"Add ingredients to shopping list"** wired to shopping API; Edit quieter; **Delete inside overflow `⋯` menu** (existing confirm). **No print/share.**
**Acceptance:** scaling math tested; check state resets on reload; add-to-shopping wired; delete in overflow with confirm.

## Phase 5 — Recipe create/edit (`RecipeForm.vue`, `RecipeCreateView.vue`, `RecipeEditView.vue`)
- **Sticky bottom save bar** with primary save. **Inline validation hints** next to empty required sections (title, ≥1 ingredient, ≥1 step) — visible, not only disabled button. **Drag-to-reorder** ingredients + steps (`DragList`; reindex correctly — tested). **Imported recipes:** when `importedRecipe` present, banner **"Imported — please review"** + subtly mark prefilled fields + **"Confirm review"** button to acknowledge before/at save.
**Acceptance:** reindex tested; validation hints visible; imported banner + confirm-review gate present.

## Phase 6 — Meal plan / Timeline (`TimelineView.vue`, `MealPlanGrid.vue`, `MealSlot.vue`)
- Replace horizontal grid with **vertical scroll of day sections**; each day shows meal slots as cards. No horizontal grid on phones. **Past days greyed but tappable** — open recipe + log "cooked" must work for past slots (remove current `pointer-events:none`). **Recolor "Regen"** to primary/accent (reserve red strictly for delete); Lucide `RefreshCw`/`RotateCw`; warm wording ("Swap"/"Another idea"), not "AI". Replace all emoji actions with Lucide icons. **Header** with visible date range + one prominent **"Generate plan"** CTA (warm wording ok). **Meal types differentiated** by tint (`--meal-breakfast/lunch/dinner`) and/or icon. Keep suggestions/shortlist but don't crowd the plan on mobile (collapse/below the fold).
**Acceptance:** no horizontal grid at 375px; past slots actionable; regen not red; emoji gone; date-range header + Generate CTA; meal types visually distinct.

## Phase 7 — Shopping lists index (`ShoppingListsView.vue`)
- Card **status:** progress indicator ("12 / 20 checked" + thin `ProgressBar`), item count, linked plan/date range. **Swipe-to-delete** on mobile + overflow `⋯` delete fallback.
**Acceptance:** progress/count/plan shown; swipe + overflow-fallback both delete.

## Phase 8 — Shopping list detail (`ShoppingListView.vue`)
- **Sticky progress header + controls:** checked/total + `ProgressBar`, **"Hide checked"** toggle, **"Clear checked."** **"+ Add item"** input for ad-hoc items; **inline quantity editing**. Move **Regenerate** into overflow `⋯` + `ConfirmDialog` (it can wipe manual checks/additions). Keep aisle grouping.
**Acceptance:** hide/clear work; add-item + inline qty edit wired; regenerate gated behind confirm in overflow; aisle grouping intact.

## Phase 9 — Shopping list builder (`ShoppingListNewView.vue`)
- Replace dense days×meals table with **chip multi-select:** selectable meals as `ToggleChip`s grouped under each day heading. No horizontal scroll. Preserve select-all/clear at day or page level. Keep sticky footer CTA; list name optional/secondary.
**Acceptance:** chips grouped by day; select-all/clear preserved; sticky CTA; no horizontal scroll at 375px.

## Phase 10 — Profile & settings (`ProfileSettingsView.vue`)
- Add missing fields backend already expects: **chip multi-selects** for **dietary restrictions / allergies / favorite cuisines**, and a **token/tag input** for **disliked ingredients** (fields exist on `User`/`UserUpdatePayload`: `dietary_restrictions`, `allergies`, `favorite_cuisines`, `disliked_ingredients`). Wire to existing model fields so they persist + feed meal-plan generation. **Sticky save bar** (or autosave with `Toast`). Keep existing profile + meal-planning fields; restyle with primitives.
**Acceptance:** all four fields wired to `UserUpdatePayload` and persist; sticky save/autosave; existing fields retained.

## Phase 11 — Admin (`AdminLayout.vue`, `src/views/admin/*`)
- **Keep dark theme deliberately**, driven from the same token system — define a dark palette via `[data-theme="dark"]` scope on the admin layout mapping the **same roles** (bg/surface/text/primary/accent/semantic) to dark values; reuse same spacing/type/primitives. Add **`ConfirmDialog`** to **"Run Cleanup"**. Tables **horizontally scrollable inside a contained card** or **collapse to stacked rows on mobile**.
**Acceptance:** dark palette via tokens (no hardcoded dark hex in components); cleanup confirmed; tables don't overflow viewport at 375px.

---

# PART C — Master Task Checklist (bite-sized)

Work phases in order. Each task ends with type-check + build + relevant tests + commit. Commits scoped to their phase. **Check the box only when the Definition of Done holds.**

Standard per-task verification (referenced as **VERIFY** below):
```bash
npm run type-check && npm run build && npm run test:unit
```

---

### Phase 0 — Design system & primitives

#### Task 0.1: Color tokens + base CSS reset to tokens ✅
**Files:** Modify `frontend/src/assets/main.css`
- [x] Add the full `:root` token block from A.1 (keep existing `--bp-*` vars).
- [x] Update `body`: `font-family: var(--font-sans)`, `color: var(--color-text)`, `background: var(--color-bg)`.
- [x] Add global `:focus-visible` outline using `--color-primary`; add a global `@media (prefers-reduced-motion: reduce){ *{animation:none!important;transition:none!important} }` baseline (primitives may override with explicit fallbacks).
- [x] **VERIFY** + commit `feat(ui): add Honey & Poppy design tokens` (a292fac).

#### Task 0.2 + 0.3: Wire Inter + SN Pro fonts (combined — user-approved @fontsource sourcing)
**Files:** Modify `package.json`, `frontend/src/main.ts` (or `main.css`)
> **Decision (user-approved):** Direct GitHub raw fetch of the woff2 was blocked by the sandbox; both fonts are available on npm as `@fontsource/inter` (Inter, OFL) and `@fontsource/sn-pro` (SN Pro, OFL) with woff2 + `@font-face` + license bundled. Use these packages — same fonts, properly licensed/packaged. This satisfies the spec's intent (vendor woff2, declare `@font-face`, map to tokens, respect license) without scraping GitHub. Supersedes the literal "vendor into `src/assets/fonts/`" wording.
- [x] `cd frontend && npm i @fontsource/inter @fontsource/sn-pro`.
- [x] Import the needed weight CSS in `main.ts` (before `./assets/main.css`): Inter 400/500/600/700, SN Pro 400/600/700. `@fontsource` sets `font-display: swap` by default.
- [x] Family names confirmed: `@fontsource` registers `'Inter'` and `'SN Pro'` — match the tokens exactly.
- [x] `h1,h2,h3{font-family:var(--font-display)}` added to main.css global block.
- [x] **VERIFY** + commit `feat(ui): wire Inter and SN Pro fonts via @fontsource` (8e35b25).

#### Task 0.4: Install @lucide/vue + BaseIcon ✅
**Files:** Modify `package.json`; Create `frontend/src/components/base/BaseIcon.vue`, `BaseIcon.test.ts`
- [x] `cd frontend && npm i @lucide/vue` (migrated from the deprecated `lucide-vue-next` after review flagged the deprecation; user-approved).
- [x] `BaseIcon` props: `{ icon: Component; size?: 16|20|24; label?: string }`. `label` → `aria-label` + `role="img"`; else `aria-hidden="true"`. Default size 20; stroke = lucide default (2).
- [x] Test: renders given icon, applies size, sets `aria-hidden` when no label and `aria-label` when label given (9 tests).
- [x] **VERIFY** + commit `feat(ui): add lucide-vue-next and BaseIcon wrapper` (a960f14) + migration `refactor(ui): migrate to @lucide/vue`.

#### Task 0.5: BaseButton + IconButton ✅
**Files:** Create `base/BaseButton.vue`, `base/IconButton.vue`, `BaseButton.test.ts`, `IconButton.test.ts`
- [x] `BaseButton` props `{ variant?: 'primary'|'secondary'|'ghost'|'danger'; type?; disabled?; loading? }`; primary `--color-primary`/`--color-primary-ink`; danger `--color-danger`; ghost `--color-primary-soft` hover; primary/icon hover darkens in-hue via `brightness(0.92)` (NOT red). Loading shows a temporary inline spinner (TODO: swap for `PourLoader` in Task 0.9). `:focus-visible` ring (global).
- [x] `IconButton` props `{ icon; label: string; variant?; size? }` — `label` REQUIRED → `aria-label`; inner `BaseIcon` decorative (aria-hidden).
- [x] Tests (18): variant class, disabled/loading disables, IconButton aria-label, decorative svg, size propagation.
- [x] **VERIFY** + commit `feat(ui): add BaseButton and IconButton primitives` (9159121) + review fixes (44bf46c, bc90983).

#### Task 0.6: BaseInput + BaseTextarea ✅
**Files:** Create `base/BaseInput.vue`, `base/BaseTextarea.vue`, tests
- [x] `v-model` (modelValue/update:modelValue); props `{ label?; error?; id?; type?; placeholder?; required? }`; error text in `--color-danger`, `aria-invalid` + `aria-describedby` wired to error id.
- [x] Tests: v-model round-trip; error renders + `aria-invalid="true"`.
- [x] **VERIFY** + commit `feat(ui): add BaseInput and BaseTextarea primitives` (ffa018f) + focus-visible fix (04b19ef).

#### Task 0.7: Chip + ToggleChip ✅
**Files:** Create `base/Chip.vue`, `base/ToggleChip.vue`, `ToggleChip.test.ts`
- [x] `Chip` props `{ tone?: 'accent'|'neutral' }`, slot label. `ToggleChip` props `{ modelValue: boolean; label?: string }`, emits `update:modelValue`, `aria-pressed`, `:focus-visible`.
- [x] Test: ToggleChip toggles modelValue on click + sets `aria-pressed`.
- [x] **VERIFY** + commit `feat(ui): add Chip and ToggleChip primitives` (1a0d926) + review fixes (b628ed3).

#### Task 0.8: BaseCard + Skeleton ✅
**Files:** Create `base/BaseCard.vue`, `base/Skeleton.vue`, `Skeleton.test.ts`
- [x] `BaseCard`: surface + `--radius` + `--shadow-sm`, padding via `--space-4`, default slot.
- [x] `Skeleton`: props `{ width?; height?; radius? }`; shimmer animation; `prefers-reduced-motion` → static `--color-surface-2` block.
- [x] Test: Skeleton renders with given dimensions.
- [x] **VERIFY** + commit `feat(ui): add BaseCard and Skeleton primitives` (a21abe4) + review fixes (cbc7272).

#### Task 0.9: PourLoader (with reduced-motion fallback) ✅
**Files:** Create `base/PourLoader.vue`, `PourLoader.test.ts`
- [x] Red dot (`--color-primary`) falling top→bottom on a loop (CSS keyframes). Props `{ size?; label? }` (default label "Loading"). `role="status"` + visually-hidden label. `prefers-reduced-motion` → static centered dot (no animation).
- [x] Test: renders `role="status"` with accessible label.
- [x] Swapped BaseButton's temporary inline spinner for PourLoader (cross-task reminder done).
- [x] **VERIFY** + commit `feat(ui): add PourLoader animated loading indicator` (f1472aa).

#### Task 0.10: Wordmark + dot favicon ✅
**Files:** Create `base/Wordmark.vue`, `Wordmark.test.ts`; Modify `frontend/index.html`; Create favicon asset
- [x] `Wordmark` props `{ dotOnly?: boolean }` — red dot (`--color-primary`) + "secretsauce" in `--font-display`; `dotOnly` renders just the dot.
- [x] Generate a dot-only SVG favicon (red dot on transparent/cream), reference it in `index.html`.
- [x] Test: renders wordmark text by default, hides text when `dotOnly`.
- [x] **VERIFY** + commit `feat(ui): add Wordmark and dot favicon` (fa54af3).

#### Task 0.11: ProgressBar + Stepper ✅
**Files:** Create `base/ProgressBar.vue`, `base/Stepper.vue`, `ProgressBar.test.ts`, `Stepper.test.ts`
- [x] `ProgressBar` props `{ value: number; max: number; label?: string }`; `role="progressbar"` + `aria-valuenow/min/max` (aria-valuenow clamped to [0,max]); thin bar, `--color-success` fill.
- [x] `Stepper` props `{ modelValue:number; min?:number; max?:number; step?:number; label? }`; +/− `IconButton`s (`Plus`/`Minus`), emits clamped `update:modelValue`, disables at bounds, group `aria-label`.
- [x] Tests: ProgressBar sets aria values + fill width % = value/max; Stepper increments/decrements/clamps.
- [x] **VERIFY** + commit `feat(ui): add ProgressBar and Stepper primitives` (f86f8ef) + review fixes (b6e38d0).

#### Task 0.12: SegmentedTabs + EmptyState
**Files:** Create `base/SegmentedTabs.vue`, `base/EmptyState.vue`, `SegmentedTabs.test.ts`
- [ ] `SegmentedTabs` props `{ modelValue: string; tabs: {value:string;label:string}[] }`; emits `update:modelValue`; `role="tablist"`/`tab`, keyboard arrow support; active tab styled with `--color-primary`.
- [ ] `EmptyState` slots: `illustration`, default(body) + props `{ title; body? }` + `action` slot.
- [ ] Test: SegmentedTabs switches modelValue on tab click + arrow keys.
- [ ] **VERIFY** + commit `feat(ui): add SegmentedTabs and EmptyState primitives`.

#### Task 0.13: ConfirmDialog
**Files:** Create `base/ConfirmDialog.vue`, `ConfirmDialog.test.ts`
- [ ] Props `{ open:boolean; title; message?; confirmLabel?; cancelLabel?; danger?: boolean }`; emits `confirm`/`cancel`; teleported, `role="dialog"` `aria-modal`, focus trap + Escape→cancel (mirror existing `BottomSheet` focus handling). Danger confirm uses `--color-danger`.
- [ ] Test: emits `confirm` on confirm button, `cancel` on cancel + Escape.
- [ ] **VERIFY** + commit `feat(ui): add ConfirmDialog primitive`.

#### Task 0.14: Stepper-free — DragList (with reindex test)
**Files:** Create `base/DragList.vue`, `base/DragList.test.ts`
- [ ] `DragList<T>` props `{ items: T[]; keyField: keyof T }`; default slot per item; emits `update:items` (or `reorder`) with the reordered array. Provide non-pointer reorder fallback: up/down `IconButton`s (`ChevronUp`/`ChevronDown`) per row so it's keyboard/assistive accessible (satisfies the swipe-fallback guardrail spirit + reindex logic is testable without simulating drag).
- [ ] **Logic to test (TDD):** a pure `moveItem(items, from, to)` helper that returns a new reordered array. Test: moving index 0→2 reorders correctly and preserves all elements; moving up/down reindexes.
- [ ] Write failing test for `moveItem` → run (fail) → implement → run (pass).
- [ ] Test the component emits reordered array when up/down pressed.
- [ ] **VERIFY** + commit `feat(ui): add DragList with reorder + reindex helper`.

#### Task 0.15: Upgrade BottomSheet + ToastHost to tokens
**Files:** Modify `frontend/src/components/BottomSheet.vue`, `frontend/src/components/ToastHost.vue`
- [ ] Replace hardcoded hex in `BottomSheet.vue` with tokens; swap `×` close glyph for `IconButton` w/ `X` icon (keep `data-testid="sheet-close"` + `aria-label="Close"`); animation gets reduced-motion fallback. Keep all existing props/emits/testids.
- [ ] Restyle `ToastHost.vue` to tokens (surface, text, primary for undo). Keep behavior.
- [ ] **VERIFY** (existing `BottomSheet.test.ts` must still pass) + commit `refactor(ui): tokenize BottomSheet and ToastHost`.

#### Task 0.16: TabBar + UserMenu + BaseAvatar (primitives for Phase 1)
**Files:** Create `base/TabBar.vue`, `base/UserMenu.vue`, `base/BaseAvatar.vue`, tests
- [ ] `TabBar` props `{ items: {to;label;icon}[] }` renders RouterLinks w/ active state (icons via `BaseIcon`).
- [ ] `BaseAvatar` props `{ name?: string }` → initials or `CircleUser` icon fallback.
- [ ] `UserMenu` props `{ items: {label;onClick?;to?}[] }`; account `IconButton` (`label="Account"`) toggles a menu/`BottomSheet`; keyboard + Escape close; `aria-expanded`.
- [ ] Tests: TabBar renders all items; UserMenu opens/closes and emits item selection.
- [ ] **VERIFY** + commit `feat(ui): add TabBar, UserMenu, BaseAvatar primitives`.

#### Task 0.17: Emoji sweep + global loader replacement
**Files:** repo-wide under `frontend/src/`
- [ ] Grep `frontend/src/` for emoji-as-icon glyphs; list every hit. Replace each with `BaseIcon` + a Lucide icon per A.3 (touch only the icon, not behavior; deeper view reworks happen in their phases — here just swap obvious nav/decoration emoji and any inline `Loading…` text/spinners for `PourLoader`).
- [ ] Confirm no emoji icons remain (re-grep).
- [ ] **VERIFY** + commit `refactor(ui): replace emoji icons and text loaders`.

**Phase 0 checkpoint:** typecheck+build+tests green; primitives exist + tested; no emoji icons; loaders use PourLoader. **Pause for user sign-off before Phase 1** (per executing-plans checkpoints).

---

### Phase 1 — App shell & nav (`App.vue`)

#### Task 1.1: Desktop top bar with Wordmark + UserMenu
**Files:** Modify `frontend/src/App.vue`
- [ ] Replace dark `app-nav` with token-styled top bar: `Wordmark` left; horizontal links Recipes (`/recipes`) / Plan (`/meal-plan`) / Shopping (`/shopping-lists`) center/left; `UserMenu` right with items **Settings** (`/settings`), **Admin** (if `userStore.isSuperuser`), **Log out** (calls existing `handleLogout`). Keep `data-testid="logout"` on the logout control.
- [ ] **VERIFY** + commit `feat(nav): desktop top bar with wordmark and user menu`.

#### Task 1.2: Mobile bottom TabBar + account
**Files:** Modify `frontend/src/App.vue`
- [ ] Use `TabBar` for mobile: Recipes / Plan / Shopping (Lucide icon + label) + account item at the end opening the same `UserMenu` (sheet on mobile). Keep `data-testid="bottom-nav"`. Remove the old Settings top-level tab (now in the menu). Ensure `app-main` bottom padding for the fixed bar.
- [ ] Confirm router still has all routes (it does — `/recipes`,`/meal-plan`,`/shopping-lists`,`/settings`,`/admin`).
- [ ] **VERIFY** (existing `App.test.ts` + `router.test.ts` pass; update assertions only if they referenced the removed Settings tab) + commit `feat(nav): mobile bottom tab bar with account menu`.

**Phase 1 checkpoint.**

---

### Phase 2 — Auth

#### Task 2.1: LoginView centered card
**Files:** Modify `frontend/src/views/LoginView.vue`
- [ ] Centered `BaseCard` on `--color-bg`; `Wordmark` above; `BaseInput` email/password; `BaseButton` primary submit; inline `error` props on inputs for field validation; keep existing submit/store flow + any testids.
- [ ] **VERIFY** + commit `feat(auth): restyle login with card, wordmark, inline validation`.

#### Task 2.2: RegisterView centered card
**Files:** Modify `frontend/src/views/RegisterView.vue`
- [ ] Same treatment; include display name field; inline validation; no OAuth.
- [ ] **VERIFY** + commit `feat(auth): restyle register to match login`.

**Phase 2 checkpoint.**

---

### Phase 3 — Recipe list

#### Task 3.0: Expose cook stats on the recipe read schema/route (sanctioned backend change) — TDD
**Files:** Modify `backend/app/schemas/recipe.py` (`RecipeResponse`), `backend/app/services/recipe_service.py` (recipe read/list); Test `backend/tests/integration/test_recipe_routes.py`
- [ ] Add `times_cooked: int = 0` and `last_cooked_at: datetime | None = None` to `RecipeResponse` (NOT on `RecipeVersionResponse` — these are recipe-level, derived from `RecipeCookLog`).
- [ ] In `recipe_service`, when building recipe responses (detail + list), aggregate from `RecipeCookLog`: `times_cooked = count(cooked_at)` for that recipe+user, `last_cooked_at = max(cooked_at)`. Use an efficient grouped query for the list path (avoid N+1) — e.g. one `GROUP BY recipe_id` query keyed into the page.
- [ ] **TDD:** write a failing integration test: seed a recipe with 0 cook logs → response `times_cooked == 0`, `last_cooked_at is None`; seed 2 cook logs → `times_cooked == 2`, `last_cooked_at` equals the latest. Run (fail) → implement → run (pass).
- [ ] Run backend suite: `cd backend && pytest tests/integration/test_recipe_routes.py -q`.
- [ ] Commit `feat(recipes): expose cook stats on recipe read schema`.

#### Task 3.1: Add cook-stats fields to Recipe type (frontend)
**Files:** Modify `frontend/src/types/recipe.ts`
- [ ] Add `times_cooked: number` and `last_cooked_at: string | null` to `Recipe` (now always sent by the backend per Task 3.0).
- [ ] **VERIFY** + commit `chore(types): add cook-stats fields to Recipe`.

#### Task 3.2: RecipeCard upgrade
**Files:** Modify `frontend/src/components/RecipeCard.vue`
- [ ] Display-font title; time + servings as `BaseIcon`(`Clock`/`Users`)+value pairs; subtle `Heart` `IconButton` (favorite affordance — non-persisting visual unless a store hook exists; `aria-label`); cook-count/last-cooked rendered when `recipe.times_cooked > 0` (e.g. "Cooked 3×" / "Last cooked …"); whole card stays the RouterLink tap target; `AddToPlanButton` demoted to a small quiet/secondary affordance (icon button) that does NOT trigger navigation (`@click.stop`/`.prevent` as already done).
- [ ] **VERIFY** + commit `feat(recipes): upgrade RecipeCard to design system`.

#### Task 3.3: Add-recipe BottomSheet with SegmentedTabs
**Files:** Modify `frontend/src/views/RecipeListView.vue`; possibly new `components/AddRecipeSheet.vue`
- [ ] Remove inline import block. Add primary "Add recipe" button + FAB (mobile) → opens `BottomSheet` containing `SegmentedTabs` (From URL / From photo / Write manually); each tab hosts the existing flow (URL import form, image upload, link to/inline manual create). Reuse existing import store/composable calls.
- [ ] **VERIFY** + commit `feat(recipes): add-recipe sheet with URL/photo/manual tabs`.

#### Task 3.4: Sticky filter chip row
**Files:** Modify `frontend/src/views/RecipeListView.vue` (and/or `TagFilter.vue`)
- [ ] Render filters as a sticky, horizontally-scrollable `ToggleChip` row (no wrap, `overflow-x:auto`, `position:sticky; top:0`). Wire to existing filter state.
- [ ] **VERIFY** + commit `feat(recipes): sticky horizontal filter chip row`.

#### Task 3.5: Skeletons + EmptyState
**Files:** Modify `frontend/src/views/RecipeListView.vue`
- [ ] Replace loading text with `Skeleton` cards (pour motif). Empty state → `EmptyState` (title "No recipes yet", body "Import your first from a URL or snap a cookbook page", action = open add-recipe sheet).
- [ ] **VERIFY** (existing `RecipeListView.test.ts` passes/updated) + commit `feat(recipes): skeleton loading and empty state`.

**Phase 3 checkpoint** (raise the cook-stats data gap with the user here).

---

### Phase 4 — Recipe detail

#### Task 4.1: Ingredient scaling helper (TDD)
**Files:** Create `frontend/src/composables/useScaledQuantity.ts` + test
- [ ] Pure helper `scaleQuantity(raw: string, factor: number): string` that parses freeform quantity strings (`"1½"`, `"2-3"`, `"1.5"`, `"2"`, `""`), multiplies by factor, formats sensibly (whole numbers stay whole; common fractions like .5/.25/.75 render as ½/¼/¾; ranges scale both ends; unparseable returns original unchanged).
- [ ] Write failing tests covering: `"2"`×2→`"4"`, `"1.5"`×2→`"3"`, `"½"`×2→`"1"`, `"2-3"`×2→`"4-6"`, `"a pinch"`×2→`"a pinch"`. Run (fail) → implement → run (pass).
- [ ] **VERIFY** + commit `feat(recipes): add ingredient quantity scaling helper`.

#### Task 4.2: Cookbook layout + sticky meta bar + Stepper scaling
**Files:** Modify `frontend/src/views/RecipeDetailView.vue`
- [ ] Hero title (display font); sticky meta bar with `Stepper` bound to a local `servings` ref (init = recipe base servings); ingredient quantities rendered through `scaleQuantity(ing.quantity, servings/baseServings)` — **presentational only, never persisted**. Two-column (ingredients|steps) desktop, single mobile.
- [ ] **VERIFY** + commit `feat(recipes): cookbook detail layout with live servings scaling`.

#### Task 4.3: Checkable ingredients + step progress (in-memory)
**Files:** Modify `frontend/src/views/RecipeDetailView.vue`
- [ ] Semantic `<input type="checkbox">` per ingredient (local reactive set); steps show subtle done state + a `ProgressBar` of completed steps. State is `ref`-local — resets on reload (do NOT persist).
- [ ] **VERIFY** + commit `feat(recipes): in-memory ingredient/step checkoff`.

#### Task 4.4: Add-to-shopping + Edit/Delete relocation
**Files:** Modify `frontend/src/views/RecipeDetailView.vue`
- [ ] "Add ingredients to shopping list" button wired to existing shopping-list store/API. Edit demoted to quiet `BaseButton secondary`/`IconButton`; Delete moved into an overflow `⋯` (`EllipsisVertical`) menu using `ConfirmDialog` (reuse existing confirm logic). No print/share buttons.
- [ ] **VERIFY** + commit `feat(recipes): add-to-shopping and overflow delete on detail`.

**Phase 4 checkpoint.**

---

### Phase 5 — Recipe form

#### Task 5.1: Sticky save bar + inline validation hints
**Files:** Modify `frontend/src/components/RecipeForm.vue`
- [ ] Sticky bottom bar with primary `BaseButton` save. Inline validation hints beside empty required sections (title, ≥1 ingredient, ≥1 step) — visible text, not just a disabled button.
- [ ] **VERIFY** + commit `feat(recipes): sticky save bar and inline validation hints`.

#### Task 5.2: Drag-to-reorder ingredients + steps
**Files:** Modify `frontend/src/components/RecipeForm.vue`
- [ ] Wrap ingredient + step lists in `DragList`; on reorder, reindex `step.order` correctly. Add a test asserting reorder updates `order` sequentially (1..n) using the `moveItem` helper.
- [ ] **VERIFY** + commit `feat(recipes): drag-reorder ingredients and steps`.

#### Task 5.3: Imported review banner + confirm
**Files:** Modify `frontend/src/components/RecipeForm.vue` (+ `RecipeCreateView.vue` if it owns `importedRecipe`)
- [ ] When `importedRecipe` present: banner "Imported — please review"; subtly mark prefilled fields (e.g., accent left-border/badge); "Confirm review" button required before/at save.
- [ ] **VERIFY** + commit `feat(recipes): imported review banner and confirm gate`.

**Phase 5 checkpoint.**

---

### Phase 6 — Timeline

#### Task 6.1: Vertical day sections with meal-slot cards
**Files:** Modify `frontend/src/views/TimelineView.vue`, `components/MealPlanGrid.vue`, `components/MealSlot.vue`
- [ ] Replace horizontal grid with a vertical scroll of day sections; each day renders its meal slots as `BaseCard`s. No horizontal grid at 375px. Meal types get tint (`--meal-breakfast/lunch/dinner`) and/or icon.
- [ ] **VERIFY** (existing `MealPlanGrid.test.ts`/`MealSlot.test.ts` pass/updated) + commit `feat(timeline): vertical day sections with meal cards`.

#### Task 6.2: Past days greyed but tappable
**Files:** Modify `components/MealSlot.vue` / `MealPlanGrid.vue`
- [ ] Remove `pointer-events:none` on past days; grey them (muted tokens) but keep open-recipe + log-cooked working for past slots.
- [ ] **VERIFY** + commit `fix(timeline): make past meal slots viewable and loggable`.

#### Task 6.3: Recolor Regen + replace emoji + warm wording
**Files:** Modify `components/MealSlot.vue`, `components/EntryActionsMenu.vue`, `TimelineView.vue`
- [ ] "Regen" → primary/accent (NOT red), Lucide `RefreshCw`/`RotateCw`, warm label ("Swap"/"Another idea"). Reserve red strictly for delete. Replace all emoji actions with Lucide icons (via `BaseIcon`, with `aria-label`s).
- [ ] **VERIFY** + commit `feat(timeline): recolor regen and replace emoji actions`.

#### Task 6.4: Header date range + Generate CTA
**Files:** Modify `frontend/src/views/TimelineView.vue`
- [ ] Header showing visible date range + one prominent "Generate plan" primary CTA (warm wording ok). Keep suggestions/shortlist but collapse/move below the fold on mobile so it doesn't crowd the plan.
- [ ] **VERIFY** + commit `feat(timeline): date-range header and generate CTA`.

**Phase 6 checkpoint.**

---

### Phase 7 — Shopping lists index

#### Task 7.1: Card status (progress + count + plan)
**Files:** Modify `frontend/src/views/ShoppingListsView.vue`
- [ ] Each card: `ProgressBar` + "n / total checked", item count, linked plan / date range. Pull from existing list payload (inspect `types/shoppingList.ts` + store for available fields; if checked/total counts aren't on the index payload, derive from what's available or show count only — do not add backend calls beyond existing).
- [ ] **VERIFY** + commit `feat(shopping): list cards show progress, count, plan`.

#### Task 7.2: Swipe-to-delete + overflow fallback
**Files:** Modify `frontend/src/views/ShoppingListsView.vue`
- [ ] Mobile swipe-to-delete gesture + an overflow `⋯` menu delete fallback (desktop/AT). Both call existing delete action with confirm/undo per current pattern.
- [ ] **VERIFY** + commit `feat(shopping): swipe-to-delete with overflow fallback`.

**Phase 7 checkpoint.**

---

### Phase 8 — Shopping list detail

#### Task 8.1: Sticky progress header + Hide/Clear checked
**Files:** Modify `frontend/src/views/ShoppingListView.vue`
- [ ] Sticky header: checked/total + `ProgressBar`; "Hide checked" toggle (filters list); "Clear checked" action. Keep aisle grouping.
- [ ] **VERIFY** + commit `feat(shopping): sticky progress header with hide/clear`.

#### Task 8.2: Add item + inline quantity edit
**Files:** Modify `frontend/src/views/ShoppingListView.vue`
- [ ] "+ Add item" input creates ad-hoc items via existing store/API; inline quantity editing on items (BaseInput inline, save on blur/enter to existing update call).
- [ ] **VERIFY** + commit `feat(shopping): add ad-hoc items and inline quantity edit`.

#### Task 8.3: Regenerate → overflow + confirm
**Files:** Modify `frontend/src/views/ShoppingListView.vue`
- [ ] Move Regenerate into overflow `⋯` menu behind `ConfirmDialog` (warns it can wipe manual checks/additions).
- [ ] **VERIFY** + commit `feat(shopping): guard regenerate behind overflow confirm`.

**Phase 8 checkpoint.**

---

### Phase 9 — Shopping list builder

#### Task 9.1: Chip multi-select grouped by day
**Files:** Modify `frontend/src/views/ShoppingListNewView.vue` (and/or `components/DayMealPicker.vue`)
- [ ] Replace days×meals table with `ToggleChip`s grouped under each day heading. Preserve select-all/clear at day or page level. Sticky footer CTA retained; list name optional/secondary. No horizontal scroll at 375px.
- [ ] **VERIFY** (existing `DayMealPicker.test.ts` passes/updated) + commit `feat(shopping): chip multi-select builder grouped by day`.

**Phase 9 checkpoint.**

---

### Phase 10 — Settings

#### Task 10.1: Chip multi-selects + disliked-ingredients token input
**Files:** Modify `frontend/src/views/ProfileSettingsView.vue`
- [ ] Add `ToggleChip` multi-selects for `dietary_restrictions`, `allergies`, `favorite_cuisines` (use pre-built tag lists from CLAUDE.md / constants where sensible). Add a token/tag input for `disliked_ingredients` (free text → array). Wire all four into `UserUpdatePayload` (fields already exist) so they persist.
- [ ] **VERIFY** (existing `ProfileSettingsView.test.ts` passes/updated) + commit `feat(settings): preference chip selects and disliked tags`.

#### Task 10.2: Sticky save bar / autosave toast + restyle
**Files:** Modify `frontend/src/views/ProfileSettingsView.vue`
- [ ] Sticky save bar with primary save (or autosave + `Toast` confirmation). Restyle existing profile + meal-planning fields with primitives. Keep all existing fields.
- [ ] **VERIFY** + commit `feat(settings): sticky save bar and tokenized fields`.

**Phase 10 checkpoint.**

---

### Phase 11 — Admin

#### Task 11.1: Dark palette via shared tokens
**Files:** Modify `frontend/src/components/admin/AdminLayout.vue` (+ `main.css` for the `[data-theme="dark"]` scope)
- [ ] Define a `[data-theme="dark"]` token scope mapping the same roles (bg/surface/text/primary/accent/semantic/border/muted) to dark-appropriate values. Apply `data-theme="dark"` on the admin layout root. Replace hardcoded dark hex in admin components with these tokens; reuse primitives.
- [ ] **VERIFY** + commit `feat(admin): drive dark theme from shared tokens`.

#### Task 11.2: Confirm dialog on Run Cleanup
**Files:** Modify the admin view hosting "Run Cleanup" (grep admin views for "Cleanup")
- [ ] Wrap "Run Cleanup" in `ConfirmDialog` before executing.
- [ ] **VERIFY** + commit `feat(admin): confirm before run cleanup`.

#### Task 11.3: Responsive admin tables
**Files:** Modify `src/views/admin/*` table views, `components/admin/*`
- [ ] Make data tables horizontally scrollable inside a contained `BaseCard`, or collapse to stacked rows at 375px. No viewport overflow on mobile.
- [ ] **VERIFY** + commit `feat(admin): responsive contained data tables`.

**Phase 11 checkpoint — final.** Run full suite + `npm run build`; then use `superpowers:finishing-a-development-branch`.

---

## Self-Review notes (author)

- **Spec coverage:** every §17 checklist line maps to a task above (Phase 0 split into 0.1–0.17; Phases 1–11 each covered). ✅
- **Known conflict resolved:** cook-count data gap — user approved one sanctioned backend change (Task 3.0 exposes `times_cooked`/`last_cooked_at` from `RecipeCookLog`; Task 3.1 mirrors the FE type). Every other phase stays presentation-only. ✅
- **TDD targets:** scaling (`scaleQuantity`, 4.1), reorder reindex (`moveItem`, 0.14 + 5.2), progress calc (ProgressBar 0.11), selection (ToggleChip 0.7) — all have explicit failing-test-first steps. ✅
- **Reuse, not duplicate:** `BottomSheet`, `useToast`/`ToastHost` upgraded in place (0.15); PrimeVue `Card`/`ConfirmDialog` deliberately not used (own `BaseCard`/`ConfirmDialog`). ✅
- **Type consistency:** `moveItem(items, from, to)`, `scaleQuantity(raw, factor)`, `times_cooked?`/`last_cooked_at?` used consistently across tasks. ✅
