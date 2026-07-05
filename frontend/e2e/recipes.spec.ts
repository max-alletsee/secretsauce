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

  // Fill basic fields
  await page.fill('#recipe-title', 'Garlic Pasta')
  await page.fill('#rf-desc', 'A simple and delicious weeknight pasta.')
  await page.fill('#rf-servings', '4')
  await page.fill('#rf-prep', '10')
  await page.fill('#rf-cook', '20')

  // Add an ingredient via the drawer
  await page.click('button:has-text("+ Add ingredient")')
  await page.fill('#ing-name', 'spaghetti')
  await page.fill('#ing-qty', '400')
  await page.selectOption('#ing-unit', 'g')
  await page.click('.drawer .btn--primary')

  // Add a second ingredient
  await page.click('button:has-text("+ Add ingredient")')
  await page.fill('#ing-name', 'garlic')
  await page.fill('#ing-qty', '4')
  await page.selectOption('#ing-unit', 'clove')
  await page.click('.drawer .btn--primary')

  // Add a step via the drawer
  await page.click('button:has-text("+ Add step")')
  await page.fill('#step-instruction', 'Boil salted water and cook spaghetti until al dente.')
  await page.click('.drawer .btn--primary')

  // Add a second step
  await page.click('button:has-text("+ Add step")')
  await page.fill('#step-instruction', 'Fry garlic in olive oil and toss with drained pasta.')
  await page.click('.drawer .btn--primary')

  // Submit
  await page.click('button[type="submit"]')

  await page.waitForURL(/\/recipes\/[0-9a-f-]{36}$/)

  // Verify all fields are visible on the detail page
  await expect(page.locator('h1')).toContainText('Garlic Pasta')
  await expect(page.locator('.recipe-detail__description')).toContainText('A simple and delicious weeknight pasta.')
  await expect(page.locator('.recipe-detail__meta')).toContainText('4 servings')
  await expect(page.locator('.recipe-detail__meta')).toContainText('10 min prep')
  await expect(page.locator('.recipe-detail__meta')).toContainText('20 min cook')
  await expect(page.locator('.recipe-detail__ingredients')).toContainText('spaghetti')
  await expect(page.locator('.recipe-detail__ingredients')).toContainText('garlic')
  await expect(page.locator('.recipe-detail__steps')).toContainText('Boil salted water')
  await expect(page.locator('.recipe-detail__steps')).toContainText('Fry garlic in olive oil')
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
  await expect(page.getByText('List Visibility Recipe', { exact: true })).toBeVisible()
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
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByTestId('delete-recipe').click()

  // Confirm deletion dialog
  const confirmBtn = page.getByTestId('confirm-btn')
  if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmBtn.click()
  }

  await page.waitForURL('/recipes')
  await expect(page.getByText('Recipe To Delete', { exact: true })).not.toBeVisible()
})

test('recipe import from URL submits and shows status', async ({ page }) => {
  await page.goto('/recipes')

  // Open the add-recipe bottom sheet
  await page.getByTestId('add-recipe-btn').click()
  await expect(page.getByTestId('add-recipe-sheet')).toBeVisible()

  // "From URL" is the default active tab, but select it explicitly to be robust
  // against future default-tab changes.
  await page.getByRole('tab', { name: 'From URL' }).click()

  await page.getByTestId('import-url-input').fill('https://example.com/recipe')
  await page.getByTestId('import-submit-btn').click()

  // Should show the pending/importing spinner
  await expect(page.getByTestId('import-spinner')).toBeVisible({ timeout: 10_000 })
})
