# Task 0.8 Report: BaseCard + Skeleton Primitives

## Status: DONE

**Commit:** `a21abe41cb767d7836166b024d52d6974ab94f2e`
**Branch:** `worktree-ux-overhaul`
**Message:** `feat(ui): add BaseCard and Skeleton primitives`

## Files Created

| File | Description |
|------|-------------|
| `frontend/src/components/base/BaseCard.vue` | Surface container with `card` class, `--color-surface` background, `--radius`, `--shadow-sm`, `--space-4` padding, default slot |
| `frontend/src/components/base/Skeleton.vue` | Shimmer placeholder with `width`, `height`, `radius` props, shimmer animation, `prefers-reduced-motion` static fallback |
| `frontend/src/components/base/BaseCard.test.ts` | 4 tests: slot renders, `card` class present, renders as `div`, renders empty without errors |
| `frontend/src/components/base/Skeleton.test.ts` | 7 tests: root element present, default width 100%, custom width/height/radius, all three props simultaneously, `skeleton` class present |

## Implementation Notes

### BaseCard
- No props (pure surface container)
- Scoped styles use only design tokens: `--color-surface`, `--radius`, `--shadow-sm`, `--space-4`

### Skeleton
- `withDefaults` used for all three optional props: `width='100%'`, `height='1rem'`, `radius='var(--radius-sm)'`
- Inline styles applied via computed property binding all three dimensions
- `aria-hidden="true"` since skeleton is decorative
- Shimmer animation via `background-image: linear-gradient(...)` + `background-position` keyframes
- `@media (prefers-reduced-motion: reduce)` block: removes `background-image`, sets static `--color-surface-2` fill, sets `animation: none`

## Verification Results

```
npm run type-check  → PASS (vue-tsc --build, zero errors)
npm run build       → PASS (vite build, 244 modules, 7.32s)
npx vitest run      → PASS (38 test files, 249 tests, all green)
```

All 11 new tests (4 BaseCard + 7 Skeleton) pass within the 249 total.

---

## Review Fix: Strengthen Skeleton Tests and Drop Dead CSS

**Commit:** (see below)
**Message:** `fix(ui): strengthen Skeleton tests and drop dead CSS`

### Changes Made

#### `frontend/src/components/base/Skeleton.test.ts`

1. **Vacuous test fixed** — Renamed `renders a single root element` to `renders a div root element` and replaced `expect(wrapper.element.tagName).toBeDefined()` (unfailable) with `expect(wrapper.element.tagName).toBe('DIV')`.

2. **Missing default-value assertions added** — Extended the existing `applies default width of 100%...` test to also assert `height: 1rem` and `border-radius: var(--radius-sm)`, matching the `withDefaults` values confirmed in `Skeleton.vue` (lines 10-14).

#### `frontend/src/components/base/Skeleton.vue`

3. **Dead CSS removed** — Inside `@media (prefers-reduced-motion: reduce)`, removed `background-image: none;` which was immediately overridden by the subsequent `background: var(--color-surface-2);` shorthand. Kept `background: var(--color-surface-2);` and `animation: none;`.

### Verification Results

```
npm run type-check  → PASS (vue-tsc --build, zero errors)
npm run build       → PASS (vite build, 244 modules, 8.23s)
npx vitest run src/components/base/Skeleton.test.ts src/components/base/BaseCard.test.ts
                    → PASS (2 test files, 11 tests, all green)
```
