import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-recipes-${Date.now()}@example.com`
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

test('can create a recipe manually', async ({ page }) => {
  await page.goto('/recipes/new')

  await page.fill('#recipe-title, input[name="title"], input[placeholder*="title" i]', 'E2E Test Recipe')
  await page.click('button[type="submit"], button:has-text("Save"), button:has-text("Create")')

  await page.waitForURL(/\/recipes\/[a-z0-9-]+/)
  await expect(page.locator('h1, .recipe-title')).toContainText('E2E Test Recipe')
})

test('newly created recipe appears in the recipe list', async ({ page }) => {
  // Create via API for speed
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  const createRes = await page.request.post('/api/v1/recipes', {
    data: {
      title: 'List Visibility Recipe',
      ingredients: [],
      steps: [],
      servings: 2,
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(createRes.status()).toBe(201)

  await page.goto('/recipes')
  await expect(page.locator('text=List Visibility Recipe')).toBeVisible()
})

test('can delete a recipe', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  const createRes = await page.request.post('/api/v1/recipes', {
    data: { title: 'Recipe To Delete', ingredients: [], steps: [], servings: 2 },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(createRes.status()).toBe(201)
  const recipeId = (await createRes.json()).id

  await page.goto(`/recipes/${recipeId}`)
  await page.click('button:has-text("Delete"), [data-testid="delete-recipe"]')

  // Confirm deletion dialog if present
  const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes, delete")')
  if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmBtn.click()
  }

  await page.waitForURL('/recipes')
  await expect(page.locator('text=Recipe To Delete')).not.toBeVisible()
})

test('recipe import from URL submits and shows status', async ({ page }) => {
  await page.goto('/recipes/import')

  // Click the URL import tab if there is one
  const urlTab = page.locator('button:has-text("URL"), [role="tab"]:has-text("URL")')
  if (await urlTab.isVisible({ timeout: 1000 }).catch(() => false)) {
    await urlTab.click()
  }

  await page.fill(
    'input[type="url"], input[placeholder*="url" i], input[placeholder*="paste" i]',
    'https://example.com/recipe',
  )
  await page.click('button[type="submit"], button:has-text("Import")')

  // Should show a loading/pending indicator
  await expect(
    page.locator('[data-testid="import-status"], .import-status')
      .or(page.getByText('processing', { exact: false }))
      .or(page.getByText('Importing', { exact: false })),
  ).toBeVisible({ timeout: 10_000 })
})
