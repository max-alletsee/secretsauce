import { test, expect, Page, APIRequestContext } from '@playwright/test'

// Each test uses an isolated user so plan/shortlist state can't leak between specs.

interface UserCtx {
  email: string
  password: string
  recipeA: string
  recipeB: string
}

async function registerAndLogin(page: Page, request: APIRequestContext): Promise<UserCtx> {
  const email = `e2e-mealplan-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`
  const password = 'TestPass123!'
  const reg = await request.post('/api/v1/auth/register', {
    data: { email, password },
  })
  if (!reg.ok()) throw new Error(`register failed: ${reg.status()} ${await reg.text()}`)

  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/recipes')

  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  if (!token) throw new Error('no access token after login')

  async function makeRecipe(title: string): Promise<string> {
    const res = await page.request.post('/api/v1/recipes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title,
        description: null,
        servings: 2,
        prep_time_minutes: 5,
        cook_time_minutes: 10,
        ingredients: [{ name: 'water', quantity: '1', unit: 'cup' }],
        steps: [{ order: 1, instruction: 'Boil water.' }],
        tags: [],
      },
    })
    if (!res.ok()) throw new Error(`create recipe failed: ${res.status()} ${await res.text()}`)
    return (await res.json()).id as string
  }

  const recipeA = await makeRecipe('E2E Pasta')
  const recipeB = await makeRecipe('E2E Salad')
  return { email, password, recipeA, recipeB }
}

test('timeline view loads and shows the meal plan grid', async ({ page, request }) => {
  await registerAndLogin(page, request)
  await page.goto('/meal-plan')
  await expect(page.locator('.grid-section')).toBeVisible()
  await expect(page.locator('button', { hasText: 'Show earlier' })).toBeVisible()
})

test('assign from /recipes (cross-view): card add → pick slot → entry visible on plan', async ({ page, request }) => {
  await registerAndLogin(page, request)
  await page.goto('/recipes')
  await page.locator('.recipe-card').filter({ hasText: 'E2E Pasta' }).first()
    .locator('[data-testid="add-to-plan-btn"]').click()
  await page.locator('[data-testid="day-meal-picker"]').waitFor()
  await page.locator('[data-testid="picker-confirm"]').click()
  await expect(page.locator('[data-testid="day-meal-picker"]')).toHaveCount(0)

  await page.goto('/meal-plan')
  await expect(page.locator('.grid-section')).toContainText('E2E Pasta')
})

test('assign from /recipes/:id (detail page primary button)', async ({ page, request }) => {
  const ctx = await registerAndLogin(page, request)
  await page.goto(`/recipes/${ctx.recipeB}`)
  await page.locator('.recipe-detail__primary-actions [data-testid="add-to-plan-btn"]').click()
  await page.locator('[data-testid="day-meal-picker"]').waitFor()
  await page.locator('[data-testid="picker-confirm"]').click()
  await expect(page.locator('[data-testid="day-meal-picker"]')).toHaveCount(0)

  await page.goto('/meal-plan')
  await expect(page.locator('.grid-section')).toContainText('E2E Salad')
})

test('fill an empty slot via slot-add → RecipePicker', async ({ page, request }) => {
  const ctx = await registerAndLogin(page, request)
  await page.goto('/meal-plan')
  const addBtn = page.locator('.day-row:not(.day-row--past) [data-testid^="slot-add-"]').first()
  await addBtn.click()
  await page.locator('[data-testid="recipe-picker"]').waitFor()
  await page.locator(`[data-testid="recipe-picker-recipe-${ctx.recipeA}"]`).first().click()
  await expect(page.locator('[data-testid="recipe-picker"]')).toHaveCount(0)
  await expect(page.locator('.grid-section')).toContainText('E2E Pasta')
})

test('move plan entry → shortlist via ⋮ menu', async ({ page, request }) => {
  await registerAndLogin(page, request)
  await page.goto('/recipes')
  await page.locator('.recipe-card').filter({ hasText: 'E2E Pasta' }).first()
    .locator('[data-testid="add-to-plan-btn"]').click()
  await page.locator('[data-testid="day-meal-picker"]').waitFor()
  await page.locator('[data-testid="picker-confirm"]').click()

  await page.goto('/meal-plan')
  const entry = page.locator('.grid-section .slot-entry').filter({ hasText: 'E2E Pasta' }).first()
  await expect(entry).toBeVisible()
  await entry.locator('[data-testid^="entry-menu-btn-"]').click()
  await page.locator('[data-testid="entry-action-move-shortlist"]').click()

  await expect(page.locator('.grid-section').getByText('E2E Pasta')).toHaveCount(0)
  await expect(page.locator('.shortlist-panel')).toContainText('E2E Pasta')
})

test('save (copy) to shortlist via ⋮ menu — stays in plan', async ({ page, request }) => {
  await registerAndLogin(page, request)
  await page.goto('/recipes')
  await page.locator('.recipe-card').filter({ hasText: 'E2E Salad' }).first()
    .locator('[data-testid="add-to-plan-btn"]').click()
  await page.locator('[data-testid="day-meal-picker"]').waitFor()
  await page.locator('[data-testid="picker-confirm"]').click()

  await page.goto('/meal-plan')
  const entry = page.locator('.grid-section .slot-entry').filter({ hasText: 'E2E Salad' }).first()
  await entry.locator('[data-testid^="entry-menu-btn-"]').click()
  await page.locator('[data-testid="entry-action-save-shortlist"]').click()

  await expect(page.locator('.shortlist-panel')).toContainText('E2E Salad')
  await expect(page.locator('.grid-section')).toContainText('E2E Salad')
})

test('stacking: a slot can hold multiple entries', async ({ page, request }) => {
  const ctx = await registerAndLogin(page, request)
  await page.goto('/meal-plan')
  const slot = page.locator('.day-row:not(.day-row--past) .meal-slot').first()
  await slot.locator('[data-testid^="slot-add-"]').click()
  await page.locator('[data-testid="recipe-picker"]').waitFor()
  await page.locator(`[data-testid="recipe-picker-recipe-${ctx.recipeA}"]`).first().click()
  await expect(page.locator('[data-testid="recipe-picker"]')).toHaveCount(0)

  await slot.locator('[data-testid^="slot-add-"]').click()
  await page.locator('[data-testid="recipe-picker"]').waitFor()
  await page.locator(`[data-testid="recipe-picker-recipe-${ctx.recipeB}"]`).first().click()
  await expect(page.locator('[data-testid="recipe-picker"]')).toHaveCount(0)

  await expect(slot.locator('.slot-entry')).toHaveCount(2)
})

// Regression guard for the served UI. Drag-and-drop assignment was removed in
// commit 48e2fc5 and replaced with explicit selection. Because this runs against
// `BASE_URL`, it can be pointed at a deployed environment (e.g.
//   BASE_URL=https://secretsauce.food:8443 npx playwright test -g "no drag-and-drop"
// ) to catch a stale build serving the old drag-and-drop bundle — the exact
// failure mode where source is fixed but the deployed artifact is outdated.
test('meal plan UI exposes no drag-and-drop affordances, only selection', async ({ page, request }) => {
  const ctx = await registerAndLogin(page, request)

  // Seed one entry so a populated slot (which previously carried drag handles) is rendered.
  await page.goto('/recipes')
  await page.locator('.recipe-card').filter({ hasText: 'E2E Pasta' }).first()
    .locator('[data-testid="add-to-plan-btn"]').click()
  await page.locator('[data-testid="day-meal-picker"]').waitFor()
  await page.locator('[data-testid="picker-confirm"]').click()

  await page.goto('/meal-plan')
  await expect(page.locator('.grid-section')).toContainText('E2E Pasta')

  // No element anywhere on the plan opts into native HTML5 drag.
  await expect(page.locator('[draggable="true"]')).toHaveCount(0)

  // No vuedraggable/SortableJS-rendered handles (it stamps .sortable-* classes).
  await expect(page.locator('[class*="sortable-"]')).toHaveCount(0)

  // The explicit-selection affordance IS present (proves it's the new UI, not a
  // blank/old page that trivially has zero draggable elements).
  const addBtn = page.locator('.day-row:not(.day-row--past) [data-testid^="slot-add-"]').first()
  await addBtn.click()
  await page.locator('[data-testid="recipe-picker"]').waitFor()
  await page.locator(`[data-testid="recipe-picker-recipe-${ctx.recipeB}"]`).first().click()
  await expect(page.locator('[data-testid="recipe-picker"]')).toHaveCount(0)
  await expect(page.locator('.grid-section')).toContainText('E2E Salad')
})
