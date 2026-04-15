import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-search-${Date.now()}@example.com`
const TEST_PASSWORD = 'TestPass123!'

test.beforeAll(async ({ request }) => {
  await request.post('/api/v1/auth/register', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })
})

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/recipes')
})

async function seedRecipes(page: import('@playwright/test').Page) {
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  await page.request.post('/api/v1/recipes', {
    data: { title: 'Mushroom Risotto', ingredients: [], steps: [], servings: 2, tags: ['italian', 'dinner'] },
    headers: { Authorization: `Bearer ${token}` },
  })
  await page.request.post('/api/v1/recipes', {
    data: { title: 'Chicken Tacos', ingredients: [], steps: [], servings: 4, tags: ['mexican', 'dinner'] },
    headers: { Authorization: `Bearer ${token}` },
  })
  await page.request.post('/api/v1/recipes', {
    data: { title: 'Banana Smoothie', ingredients: [], steps: [], servings: 1, tags: ['breakfast', 'vegan'] },
    headers: { Authorization: `Bearer ${token}` },
  })
}

test('search returns matching recipes', async ({ page }) => {
  await seedRecipes(page)
  await page.goto('/recipes')

  const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]')
  await searchInput.fill('risotto')
  // Wait for debounce
  await page.waitForTimeout(600)

  await expect(page.locator('text=Mushroom Risotto')).toBeVisible()
  await expect(page.locator('text=Chicken Tacos')).not.toBeVisible()
})

test('tag filter narrows results to matching tag', async ({ page }) => {
  await seedRecipes(page)
  await page.goto('/recipes')

  // Click the "breakfast" tag — adapt selector to TagFilter component
  const breakfastTag = page.locator('[data-testid="tag-breakfast"], button:has-text("breakfast")')
  await breakfastTag.click()

  await expect(page.locator('text=Banana Smoothie')).toBeVisible()
  await expect(page.locator('text=Mushroom Risotto')).not.toBeVisible()
  await expect(page.locator('text=Chicken Tacos')).not.toBeVisible()
})

test('clearing the search shows all recipes again', async ({ page }) => {
  await seedRecipes(page)
  await page.goto('/recipes')

  const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]')
  await searchInput.fill('risotto')
  await page.waitForTimeout(600)
  await expect(page.locator('text=Chicken Tacos')).not.toBeVisible()

  await searchInput.clear()
  await page.waitForTimeout(600)
  await expect(page.locator('text=Mushroom Risotto')).toBeVisible()
  await expect(page.locator('text=Chicken Tacos')).toBeVisible()
})
