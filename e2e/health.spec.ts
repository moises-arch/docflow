import { test, expect } from "@playwright/test";

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
});

test("root redirects to locale sign-in", async ({ page }) => {
  await page.goto("/");
  // Should end up on /en/sign-in or /es/sign-in
  await expect(page).toHaveURL(/\/(en|es)\//);
});
