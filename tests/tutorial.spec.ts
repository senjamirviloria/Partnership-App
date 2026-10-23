import { test, expect, type Page } from "@playwright/test";
import { encryptTerritoryPayloadForUser } from "../lib/territory-transport";

test.skip(process.env.E2E_TUTORIALS !== "true", "Enable only against the isolated onboarding preview.");
let client = 100;
const login = async (page: Page, account = "ui-other") => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${++client}` });
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(`${account}@example.test`);
  await page.locator('input[type="password"]').fill("UiCheckPassword123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(account === "ui-admin" ? "**/admin" : "**/workspace");
};
const coach = (page: Page) => page.locator(".tutorial-coach");
const next = (page: Page) => coach(page).getByRole("button", { name: "Next", exact: true });
const start = (page: Page) => page.getByRole("button", { name: "Start tutorial", exact: true }).click();

test("admin introduction supports themes, widths, handoff, replay, and focus restoration", async ({ page }) => {
  await login(page, "ui-admin");
  await expect(page.getByRole("dialog", { name: "Welcome to Partnership administration", exact: true })).toBeVisible();
  await start(page);
  await expect(coach(page)).toContainText("Your admin overview");
  for (const width of [375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(coach(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await next(page).click();
  await expect(coach(page)).toContainText("Manage the directory");
  await coach(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(coach(page)).toContainText("Your admin overview");
  for (let i = 0; i < 4; i++) await next(page).click();
  await coach(page).getByRole("button", { name: "Open workspace tutorial" }).click();
  await expect(page.getByRole("dialog", { name: "Try your first territory assignment", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await page.getByRole("link", { name: "Open admin dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay tutorial", exact: true }).click();
  await start(page);
  await page.keyboard.press("Escape");
  await expect(coach(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay tutorial", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Replay tutorial", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("dialog", { name: "Welcome to Partnership administration", exact: true })).toBeVisible();
});

test("hands-on mobile walkthrough waits for actions, pauses for dialogs, and survives a failed save", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await login(page);
  await start(page);
  await expect(next(page)).toBeDisabled();
  const territories = page.locator("#panel-territories");
  await territories.getByRole("button", { name: /DTAQ 1/ }).click();
  await territories.getByRole("checkbox").first().check();
  await next(page).click();
  await expect(page.getByRole("tab", { name: "Assignees", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(next(page)).toBeDisabled();
  const assignees = page.locator("#panel-assignees");
  for (const name of ["Tour One", "Tour Two"]) {
    await assignees.getByPlaceholder("Enter assignee name").fill(name);
    await assignees.getByRole("button", { name: "Create", exact: true }).click();
  }
  await assignees.getByRole("button", { name: "Full screen Assignees", exact: true }).click();
  await expect(coach(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(coach(page)).toContainText("Prepare two assignees");
  await next(page).click();
  await expect(next(page)).toBeDisabled();
  const pairs = page.locator("#panel-pairs");
  for (let i = 0; i < 2; i++) {
    await pairs.getByRole("button", { name: "Add Existing Assignees", exact: true }).first().click();
    await expect(coach(page)).toHaveCount(0);
    await page.getByRole("dialog").getByRole("button", { name: "Assign", exact: true }).first().click();
    await expect(coach(page)).toBeVisible();
  }
  await next(page).click();
  await expect(pairs.locator(".location-map-link").first()).toBeVisible();
  await next(page).click();
  const finish = coach(page).getByRole("button", { name: "Finish tutorial", exact: true });
  await expect(finish).toBeDisabled();
  await page.route("**/workspace", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
  const save = page.locator(".mobile-save-bar").getByRole("button", { name: "Save assignments", exact: true });
  await save.click();
  await expect(coach(page)).toContainText("The save failed");
  await expect(finish).toBeDisabled();
  await expect(pairs.locator('[draggable="true"]')).toHaveCount(2);
  await page.unroute("**/workspace");
  await save.click();
  await expect(finish).toBeEnabled();
  for (const width of [375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const guide = document.querySelector(".tutorial-coach")!.getBoundingClientRect();
      const saveBar = document.querySelector(".mobile-save-bar")!;
      const limit = saveBar.getClientRects().length ? saveBar.getBoundingClientRect().top : innerHeight;
      return guide.bottom <= limit && guide.top >= 0;
    })).toBe(true);
  }
  await finish.click();
  await page.reload();
  await expect(page.getByText("All changes saved", { exact: true }).first()).toBeVisible();
  await expect(coach(page)).toHaveCount(0);
  await expect(pairs.locator('[draggable="true"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Replay tutorial", exact: true }).click();
  await start(page);
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await expect(next(page)).toBeEnabled();
  await coach(page).getByRole("button", { name: "Skip tutorial", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await pairs.getByRole("button", { name: "Reset", exact: true }).click();
  await pairs.getByRole("button", { name: "Save assignments", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true }).first()).toBeVisible();
});

test("unfinished progress resumes; skip preserves edits and remains separate for each account", async ({ page }) => {
  await login(page, "ui-user");
  await start(page);
  await page.locator("#panel-territories").getByRole("button", { name: /DTAQ 1/ }).click();
  await page.locator('#panel-territories input[type="checkbox"]').first().check();
  await next(page).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(coach(page)).toContainText("Prepare two assignees");
  await page.locator("#panel-assignees").getByPlaceholder("Enter assignee name").fill("Kept after skip");
  await page.locator("#panel-assignees").getByRole("button", { name: "Create", exact: true }).click();
  await coach(page).getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await expect(page.getByText("Kept after skip", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await login(page, "ui-other");
  await expect(page.getByRole("dialog", { name: "Try your first territory assignment", exact: true })).toBeVisible();
});

test("unavailable storage falls back to memory across workspace navigation", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get: () => { throw new Error("Storage disabled"); } }));
  await login(page, "ui-admin");
  await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await page.getByRole("link", { name: "Open user workspace", exact: true }).click();
  await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await page.getByRole("link", { name: "Open admin dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay tutorial", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Welcome to Partnership administration", exact: true })).toBeVisible();
});

test("loading and failure defer the tour; an empty directory explains how to get started", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/territories", async (route) => { await wait; await route.fulfill({ status: 500, body: "Unavailable" }); });
  await login(page);
  await expect(page.getByText("Loading territories...", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  release();
  await expect(page.getByText("Failed to load territories (500)", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.unroute("**/api/territories");
  await page.route("**/api/territories", (route) => route.fulfill({ json: {
    payload: encryptTerritoryPayloadForUser("ui-other", { areas: [] }), encryptionUserId: "ui-other",
  } }));
  await page.reload();
  await expect(page.getByText("There are no territories with pair slots yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start tutorial", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assignment board", exact: true })).toBeVisible();
});


test("first automatic launch waits until an already-open navigation drawer closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 950 });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/territories", async (route) => { await wait; await route.continue(); });
  await login(page);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeVisible();
  release();
  await expect(page.locator("#panel-territories")).not.toHaveAttribute("inert");
  await expect(page.getByRole("dialog", { name: "Try your first territory assignment", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close Navigation", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Try your first territory assignment", exact: true })).toBeVisible();
});
