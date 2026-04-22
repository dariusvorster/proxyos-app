import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? 'admin@proxyos.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'changeme'
// Use a timestamp suffix so parallel runs don't collide
const TEST_DOMAIN = `e2e-test-${Date.now()}.local`
const TEST_UPSTREAM = '10.0.0.99:9999'
const EDITED_NAME = 'E2E Edited Route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Log in via the /login form and wait for redirect to / */
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')

  // The login page renders two <label> elements whose visible text is "Email"
  // and "Password" (uppercase via CSS, but the DOM text is the label span).
  // We use getByLabel for resilience — if the exact label text changes this
  // will surface the breakage rather than silently doing nothing.
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Post-login the app redirects to /
  await page.waitForURL('/', { timeout: 15000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Route management flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('E2E-1: create → appear in list → edit → save → delete', async ({ page }) => {
    // ------------------------------------------------------------------
    // 1. Navigate to the "Expose service" wizard
    // ------------------------------------------------------------------
    await page.goto('/routes')
    await page.getByRole('link', { name: /expose service/i }).click()
    await page.waitForURL('/expose')

    // ------------------------------------------------------------------
    // 2. Step 0 — Source: fill IP, port, name and advance
    // ------------------------------------------------------------------
    // The expose wizard starts on "Source" step.
    // IP and port fields are plain inputs; "name" is also a plain input.
    // We locate them by visible placeholder text since there are no labels.
    await page.getByPlaceholder(/ip|host|address/i).fill('10.0.0.99')
    await page.getByPlaceholder(/port/i).fill('9999')
    await page.getByPlaceholder(/name/i).fill('E2E Test Route')
    await page.getByRole('button', { name: /next/i }).click()

    // ------------------------------------------------------------------
    // 3. Step 1 — Domain
    // ------------------------------------------------------------------
    await page.getByPlaceholder(/domain/i).fill(TEST_DOMAIN)
    // Leave TLS at default (auto) and advance
    await page.getByRole('button', { name: /next/i }).click()

    // ------------------------------------------------------------------
    // 4. Steps 2–5 — Routing / Access / Options / Monitoring
    //    Accept all defaults by clicking Next until we reach Review
    // ------------------------------------------------------------------
    // We click Next up to 4 more times; each step may or may not have
    // required fields but defaults are valid for a basic route.
    for (let i = 0; i < 4; i++) {
      const nextBtn = page.getByRole('button', { name: /next/i })
      if (await nextBtn.isVisible()) {
        await nextBtn.click()
        // Small wait for step transition
        await page.waitForTimeout(300)
      }
    }

    // ------------------------------------------------------------------
    // 5. Step 6 — Review: submit
    // ------------------------------------------------------------------
    await page.getByRole('button', { name: /expose|submit|save|create/i }).click()

    // After successful expose the mutation calls onSuccess and sets result;
    // the UI shows a success state. We just wait for the network idle.
    await page.waitForLoadState('networkidle')

    // ------------------------------------------------------------------
    // 6. Verify the new route appears in the routes list
    // ------------------------------------------------------------------
    await page.goto('/routes')
    await expect(page.getByText(TEST_DOMAIN)).toBeVisible({ timeout: 10000 })

    // ------------------------------------------------------------------
    // 7. Open the side panel by clicking the route row
    // ------------------------------------------------------------------
    await page.getByText(TEST_DOMAIN).click()

    // The SidePanel renders with the domain as its title
    const panel = page.getByRole('complementary').or(
      page.locator('[data-panel], aside, [role="dialog"]')
    ).first()
    await expect(panel).toBeVisible({ timeout: 5000 })

    // ------------------------------------------------------------------
    // 8. Click Edit (only present for local-origin routes)
    // ------------------------------------------------------------------
    await panel.getByRole('button', { name: /^edit$/i }).click()

    // ------------------------------------------------------------------
    // 9. Change the route name in the edit form
    // ------------------------------------------------------------------
    const nameInput = panel.getByRole('textbox').first()
    await nameInput.clear()
    await nameInput.fill(EDITED_NAME)

    // ------------------------------------------------------------------
    // 10. Save
    // ------------------------------------------------------------------
    await panel.getByRole('button', { name: /^save$/i }).click()

    // Wait for the optimistic update / mutation to settle
    await page.waitForLoadState('networkidle')

    // The panel should revert to read-only view (Edit button visible again)
    await expect(panel.getByRole('button', { name: /^edit$/i })).toBeVisible({ timeout: 8000 })

    // ------------------------------------------------------------------
    // 11. Verify the updated name appears somewhere in the panel
    // ------------------------------------------------------------------
    await expect(panel.getByText(EDITED_NAME)).toBeVisible()

    // ------------------------------------------------------------------
    // 12. Delete the route via the panel's Delete button
    // ------------------------------------------------------------------
    // The delete handler calls `confirm()` — Playwright auto-accepts dialogs
    // when you set a dialog handler.
    page.once('dialog', (dialog) => dialog.accept())
    await panel.getByRole('button', { name: /^delete$/i }).click()

    await page.waitForLoadState('networkidle')

    // ------------------------------------------------------------------
    // 13. Verify the route is gone from the list
    // ------------------------------------------------------------------
    await expect(page.getByText(TEST_DOMAIN)).not.toBeVisible({ timeout: 10000 })
  })
})
