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

test('can create a meal plan and navigate to it', async ({ page }) => {
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.waitForURL('/meal-plans/new')

  await page.fill('#plan-name', 'E2E Test Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-13')
  await page.click('button[type="submit"]')

  await page.waitForURL(/\/meal-plans\/[0-9a-f-]{36}$/)
  await expect(page.locator('h1, .plan-title')).toContainText('E2E Test Plan')
})

test('can type free text into a meal slot', async ({ page }) => {
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.fill('#plan-name', 'Slot Test Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-09')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/meal-plans\/[0-9a-f-]{36}$/)

  // Click the first empty slot
  const emptySlot = page.locator('[data-testid="slot-empty"]').first()
  await emptySlot.click()

  // Type in the inline input
  const input = page.locator('[data-testid="slot-text-input"]').first()
  await input.fill('Restaurant X')
  await input.press('Enter')

  await expect(page.locator('.slot-content.freetext').first()).toContainText('Restaurant X')
})

test('can confirm a plan', async ({ page }) => {
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.fill('#plan-name', 'Confirm Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-09')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/meal-plans\/[0-9a-f-]{36}$/)

  await page.click('button:has-text("Confirm Plan")')
  await expect(page.locator('button:has-text("Log meals")')).toBeVisible()
})

test('can log a plan and see success message', async ({ page }) => {
  // Create and confirm a plan
  await page.goto('/meal-plans')
  await page.click('button:has-text("New Plan")')
  await page.fill('#plan-name', 'Log E2E Plan')
  await page.fill('#start-date', '2026-04-07')
  await page.fill('#end-date', '2026-04-07')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/meal-plans\/[0-9a-f-]{36}$/)
  const planUrl = page.url()
  const planId = planUrl.split('/').pop()!

  // Confirm plan via API
  await page.request.post(`/api/v1/meal-plans/${planId}/confirm`, {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('access_token'))}` },
  })

  // Navigate to log view
  await page.goto(`/meal-plans/${planId}/log`)
  await page.click('button:has-text("Submit log")')

  // Verify success message (no recipe entries so no carryovers)
  await expect(page.getByText('Plan logged successfully', { exact: true })).toBeVisible()
})
