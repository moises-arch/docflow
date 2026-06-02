import { test, expect } from "@playwright/test";

// Help Center routes are protected by auth; an unauth request should redirect
// to sign-in. We don't drive a full auth flow here — that's covered by the
// auth-aware tests below when credentials are present in the env.

test("help center redirects unauthenticated users to sign-in (en)", async ({ page }) => {
  await page.goto("/en/help");
  await expect(page).toHaveURL(/sign-in/);
});

test("help center redirects unauthenticated users to sign-in (es)", async ({ page }) => {
  await page.goto("/es/help");
  await expect(page).toHaveURL(/sign-in/);
});

test("help article slug also redirects unauthenticated", async ({ page }) => {
  await page.goto("/en/help/anthropic-key");
  await expect(page).toHaveURL(/sign-in/);
});

// When E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD are set, drive the sign-in form
// once and reuse the session across help-center pages.
const E2E_EMAIL = process.env.E2E_AUTH_EMAIL;
const E2E_PASSWORD = process.env.E2E_AUTH_PASSWORD;

test.describe("authenticated help center", () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, "E2E auth credentials not configured");

  test.beforeEach(async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.getByLabel(/email/i).fill(E2E_EMAIL!);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(en|es)\//);
  });

  test("help index renders with categories", async ({ page }) => {
    await page.goto("/en/help");
    await expect(page.getByRole("heading", { name: /help center/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/Quick start/i)).toBeVisible();
    await expect(page.getByText(/Setup/i)).toBeVisible();
  });

  test("help article 'anthropic-key' renders and has related links", async ({ page }) => {
    await page.goto("/en/help/anthropic-key");
    await expect(page.getByRole("heading", { name: /anthropic api key/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/console.anthropic.com/i)).toBeVisible();
    await expect(page.getByText(/Related articles/i)).toBeVisible();
  });

  test("unknown slug returns 404", async ({ page }) => {
    const res = await page.goto("/en/help/this-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("search filters articles by title", async ({ page }) => {
    await page.goto("/en/help");
    const searchBox = page.getByPlaceholder(/search articles/i);
    await searchBox.fill("anthropic");
    await expect(page.getByRole("heading", { name: /anthropic api key/i, level: 3 })).toBeVisible();
  });

  test("Spanish locale renders translated content", async ({ page }) => {
    await page.goto("/es/help/anthropic-key");
    await expect(page.getByRole("heading", { name: /anthropic api key/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/Obtener una API key/i)).toBeVisible();
  });
});
