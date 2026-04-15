import { test, expect } from '@playwright/test'

const TEST_EMAIL = `e2e-auth-${Date.now()}@example.com`
const TEST_PASSWORD = 'TestPass123!'

test('can register a new account', async ({ page }) => {
  await page.goto('/register')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')

  // After successful registration, redirected to recipes or login
  await expect(page).toHaveURL(/\/(recipes|login)/)
})

test('can log in with valid credentials', async ({ page, request }) => {
  // Ensure the user exists
  await request.post('/api/v1/auth/register', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })

  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')

  await page.waitForURL('/recipes')
  await expect(page).toHaveURL('/recipes')
})

test('shows error on invalid credentials', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'nobody@example.com')
  await page.fill('input[type="password"]', 'WrongPassword1!')
  await page.click('button[type="submit"]')

  // Should NOT navigate away from /login
  await expect(page).toHaveURL('/login')
  // An error message should be visible
  await expect(page.locator('[role="alert"], .error, .error-message')).toBeVisible()
})

test('redirects unauthenticated users to /login', async ({ page }) => {
  await page.goto('/recipes')
  await expect(page).toHaveURL(/\/login/)
})

test('logout clears session and redirects to /login', async ({ page, request }) => {
  await request.post('/api/v1/auth/register', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/recipes')

  // Click the logout button — adapt the selector to the actual component
  await page.click('button:has-text("Logout"), button:has-text("Log out"), [data-testid="logout"]')
  await page.waitForURL('/login')
  await expect(page).toHaveURL('/login')
})
