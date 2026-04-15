import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = `e2e-admin-${Date.now()}@example.com`
const ADMIN_PASSWORD = 'AdminPass123!'
const REGULAR_EMAIL = `e2e-regular-${Date.now()}@example.com`
const REGULAR_PASSWORD = 'RegularPass123!'

test.beforeAll(async ({ request }) => {
  await request.post('/api/v1/auth/register', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  await request.post('/api/v1/auth/register', {
    data: { email: REGULAR_EMAIL, password: REGULAR_PASSWORD },
  })
})

test('regular user cannot access /admin', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', REGULAR_EMAIL)
  await page.fill('input[type="password"]', REGULAR_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/recipes')

  await page.goto('/admin')
  // Should redirect away from /admin — to /recipes or /login
  await expect(page).not.toHaveURL('/admin')
})

test('superuser can access admin users table', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/recipes')

  const token = await page.evaluate(() => localStorage.getItem('access_token') ?? '')

  test.skip(!token, 'Requires pre-seeded superuser in test DB')

  await page.goto('/admin')
  await expect(
    page.locator('table, [data-testid="users-table"], .admin-users'),
  ).toBeVisible({ timeout: 5_000 })
})

test('admin users table shows user records', async () => {
  test.skip(true, 'Requires pre-seeded superuser in test DB — run manually after setup')
})
