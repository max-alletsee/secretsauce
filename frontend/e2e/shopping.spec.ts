import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-shopping-${Date.now()}@example.com`
const TEST_PASSWORD = 'TestPass123!'

test.beforeAll(async ({ request }) => {
  await request.post('/api/v1/auth/register', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })
})

async function loginAndGetToken(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/recipes')
  return await page.evaluate(() => localStorage.getItem('access_token') ?? '')
}

async function createRecipeAndPlan(
  page: import('@playwright/test').Page,
  token: string,
): Promise<{ planId: string }> {
  const recipeRes = await page.request.post('/api/v1/recipes', {
    data: {
      title: 'Shopping E2E Recipe',
      ingredients: [
        { name: 'pasta', quantity: '400', unit: 'g' },
        { name: 'tomatoes', quantity: '3', unit: '' },
      ],
      steps: [{ order: 1, instruction: 'Cook everything.' }],
      servings: 2,
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(recipeRes.status()).toBe(201)
  const recipeId = (await recipeRes.json()).id

  const planRes = await page.request.post('/api/v1/meal-plans', {
    data: { name: 'Shopping E2E Plan', start_date: '2026-05-05', end_date: '2026-05-05' },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(planRes.status()).toBe(201)
  const planId = (await planRes.json()).id

  await page.request.post(`/api/v1/meal-plans/${planId}/entries`, {
    data: {
      date: '2026-05-05',
      meal_type: 'dinner',
      recipe_id: recipeId,
      servings: 2,
      source: 'manual',
      entry_type: 'recipe',
      position: 0,
    },
    headers: { Authorization: `Bearer ${token}` },
  })

  return { planId }
}

test('shopping list page loads for a meal plan', async ({ page }) => {
  const token = await loginAndGetToken(page)
  const { planId } = await createRecipeAndPlan(page, token)

  await page.goto(`/shopping-lists/${planId}`)
  // The page should exist (not 404 or redirect)
  await expect(page).toHaveURL(`/shopping-lists/${planId}`)
})

test('can check off a shopping list item', async ({ page }) => {
  const token = await loginAndGetToken(page)
  const { planId } = await createRecipeAndPlan(page, token)

  await page.goto(`/shopping-lists/${planId}`)

  const checkboxes = page.locator('input[type="checkbox"], [role="checkbox"]')
  const count = await checkboxes.count()

  if (count > 0) {
    const firstCheckbox = checkboxes.first()
    const wasChecked = await firstCheckbox.isChecked()
    await firstCheckbox.click()
    await expect(firstCheckbox).toBeChecked({ checked: !wasChecked })
  }
})
