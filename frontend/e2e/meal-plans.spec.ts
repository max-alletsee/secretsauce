import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-mealplan-${Date.now()}@example.com`
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

test('timeline view loads and shows the meal plan grid', async ({ page }) => {
  await page.goto('/meal-plan')
  await expect(page.locator('.meal-plan-grid, [data-testid="meal-plan-grid"], .grid-section')).toBeVisible()
  await expect(page.locator('button', { hasText: 'Show earlier' }).or(page.locator('.show-earlier-btn'))).toBeVisible()
})

test('can type free text into a meal slot', async ({ page }) => {
  await page.goto('/meal-plan')

  // Target a slot in today's row (past rows have pointer-events: none)
  const emptySlot = page.locator('.day-row--today [data-testid="slot-empty"]').first()
  await emptySlot.waitFor({ state: 'visible' })
  await emptySlot.click()

  const input = page.locator('[data-testid="slot-text-input"]').first()
  await input.fill('Restaurant X')
  await input.press('Enter')

  await expect(page.locator('.slot-content.freetext').first()).toContainText('Restaurant X')
})
