import { test, expect, type Page } from "@playwright/test";

const password = "UiCheckPassword123!";
let loginClient = 0;
const login = async (page: Page, account = "ui-admin") => {
  // Separate simulated clients so production auth rate limits stay enabled.
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${++loginClient}` });
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(`${account}@example.test`);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(account === "ui-admin" ? "**/admin" : "**/workspace");
};
const openTab = async (page: Page, name: string) => {
  await page.getByRole("tab", { name, exact: true }).click();
};

test("role-based entry and direct admin route protection", async ({ page }) => {
  await login(page, "ui-user");
  for (const url of [
    "/admin",
    "/admin/users",
    "/admin/areas",
    "/admin/territories",
  ]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(
      page.getByRole("heading", { name: "Assignment board", exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("link", { name: "Open admin dashboard" }),
  ).toHaveCount(0);
});

test("responsive panels retain selections across tabs and resizing", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Open user workspace" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }).first(),
  ).toBeVisible();
  const territories = page.locator("#panel-territories");
  await territories.getByRole("button", { name: /DTAQ 1/ }).click();
  const first = territories.locator('input[type="checkbox"]').first();
  await first.check();
  for (const width of [375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    if (width < 768) {
      for (const [name, id] of [
        ["Assignees", "assignees"],
        ["Partner Pairs", "pairs"],
        ["Territories", "territories"],
      ]) {
        await openTab(page, name);
        await expect(page.locator(`#panel-${id}`)).toBeVisible();
        await expect(page.locator(".responsive-panel:visible")).toHaveCount(1);
      }
    } else {
      await expect(page.locator(".responsive-panel:visible")).toHaveCount(3);
    }
    await expect(first).toBeChecked();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.getByRole("tab", { name: "Territories", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Assignees", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#panel-assignees")).toBeVisible();
});

test("System appearance responds automatically; explicit overrides persist", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  const theme = page.getByRole("combobox", { name: "Appearance" });
  await expect(theme).toHaveValue("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await theme.selectOption("light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.reload();
  await expect(theme).toHaveValue("light");
  await theme.selectOption("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await theme.selectOption("system");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("appearance still works when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new Error("Storage disabled");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .getByRole("combobox", { name: "Appearance" })
    .selectOption("light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("admin user search, create, edit, password change, safeguards and delete", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add user" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("UI Created User");
  await dialog.getByLabel("Username", { exact: true }).fill("ui-created");
  await dialog
    .getByLabel("Email", { exact: true })
    .fill("ui-created@example.test");
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search users" }).fill("ui-created");
  await page.getByRole("button", { name: "Edit UI Created User" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("UI Edited User");
  await dialog
    .getByLabel("New password (optional)")
    .fill("UiChangedPassword123!");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit UI Edited User" }),
  ).toBeVisible();
  const other = await page.context().browser()!.newContext();
  await other.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.1" });
  const otherPage = await other.newPage();
  await otherPage.goto(`${new URL(page.url()).origin}/login`);
  await otherPage
    .locator('input[type="email"]')
    .fill("ui-created@example.test");
  await otherPage
    .locator('input[type="password"]')
    .fill("UiChangedPassword123!");
  await otherPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(otherPage).toHaveURL(/\/workspace$/);
  await other.close();
  await page.getByRole("button", { name: "Edit UI Edited User" }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "Delete user", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("No matching records. Try a different filter."),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search users" }).fill("ui-admin");
  await page
    .getByRole("button", { name: "Edit UI Admin", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete user", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption("user");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "At least one super admin must remain.",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("area and territory forms preserve fields and refresh directories", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/areas?new=1");
  await page.getByLabel("Area name", { exact: true }).fill("UI Check Area");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Created by isolated browser test");
  await page.getByRole("button", { name: "Create area", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "UI Check Area", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/territories?new=1");
  await page
    .getByRole("combobox", { name: "Area", exact: true })
    .selectOption({ label: "UI Check Area" });
  await page.getByLabel("Name", { exact: true }).fill("UI Check Territory");
  await page.getByLabel("Number of pairs").fill("2");
  await page.getByLabel("Car required", { exact: true }).check();
  await page.getByLabel("Locations").fill("Test station; Test location");
  await page
    .getByRole("button", { name: "Create territory", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search territories" })
    .fill("UI Check Territory");
  await page
    .getByRole("button", { name: "Edit UI Check Area UI Check Territory" })
    .click();
  await expect(page.getByLabel("Locations")).toHaveValue(
    "Test station; Test location",
  );
  await expect(page.getByLabel("Car required", { exact: true })).toBeChecked();
  await page.getByLabel("Number of pairs").fill("0");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "UI Check Territory" })
      .getByRole("cell", { name: "0", exact: true }),
  ).toBeVisible();
});

test("mobile assignment, bulk automation, saves, failures, and account isolation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await login(page, "ui-user");
  await expect(
    page.getByText("All changes saved", { exact: true }).last(),
  ).toBeVisible();
  const territories = page.locator("#panel-territories");
  await territories.getByRole("button", { name: /DTAQ 1/ }).click();
  await territories.locator('input[type="checkbox"]').first().check();
  await openTab(page, "Assignees");
  const assignees = page.locator("#panel-assignees");
  for (const name of ["First Person", "Second Person", "Third Person"]) {
    await assignees.getByPlaceholder("Enter assignee name").fill(name);
    await assignees
      .getByRole("button", { name: "Create", exact: true })
      .click();
  }
  await assignees
    .getByRole("button", { name: "Assign Automatically", exact: true })
    .click();
  await openTab(page, "Partner Pairs");
  const pairs = page.locator("#panel-pairs");
  await expect(pairs.locator('[draggable="true"]')).toHaveCount(2);
  await pairs
    .getByRole("button", { name: "Add Existing Assignees" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Assign", exact: true })
    .first()
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    pairs.getByText(/Warning: this slot has 3 assignees/),
  ).toBeVisible();
  await page
    .locator(".mobile-save-bar")
    .getByRole("button", { name: "Save assignments" })
    .click();
  await expect(page.locator(".mobile-save-bar")).toContainText(
    "All changes saved",
  );
  await page.reload();
  await expect(page.locator(".mobile-save-bar")).toContainText(
    "All changes saved",
  );
  await openTab(page, "Partner Pairs");
  await expect(pairs.locator('[draggable="true"]')).toHaveCount(3);
  await openTab(page, "Assignees");
  await assignees
    .getByPlaceholder("Enter assignee name")
    .fill("Retained After Failure");
  await assignees.getByRole("button", { name: "Create", exact: true }).click();
  await page.route("**/workspace", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page
    .locator(".mobile-save-bar")
    .getByRole("button", { name: "Save assignments" })
    .click();
  await expect(page.locator(".mobile-save-bar")).toContainText("Save failed");
  await expect(
    assignees.getByText("Retained After Failure", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/workspace");
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  const other = await page
    .context()
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin });
  const otherPage = await other.newPage();
  await login(otherPage, "ui-other");
  await expect(
    otherPage.getByText("All changes saved", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    otherPage.locator('#panel-territories input[type="checkbox"]:checked'),
  ).toHaveCount(0);
  await expect(otherPage.locator("#panel-assignees")).not.toContainText(
    "First Person",
  );
  await other.close();
});

test("manual editing, bulk assignment, dragging, clipboard, fullscreen, and reset", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, "ui-other");
  await expect(
    page.getByText("All changes saved", { exact: true }).first(),
  ).toBeVisible();
  const territories = page.locator("#panel-territories");
  const assignees = page.locator("#panel-assignees");
  const pairs = page.locator("#panel-pairs");
  await territories
    .getByRole("button", { name: "Show all", exact: true })
    .click();
  await expect(
    territories.getByRole("button", { name: /DTAQ 2/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await territories
    .getByRole("button", { name: "Hide all", exact: true })
    .click();
  await territories.getByRole("button", { name: /DTAQ 1/ }).click();
  const choices = territories.locator('input[type="checkbox"]');
  await choices.nth(0).check();
  await choices.nth(1).check();
  for (const name of ["Manual One", "Manual Two", "Drag Person"]) {
    await assignees.getByPlaceholder("Enter assignee name").fill(name);
    await assignees
      .getByRole("button", { name: "Create", exact: true })
      .click();
  }
  await assignees.getByText("Manual One", { exact: true }).click();
  await assignees.getByRole("button", { name: "Edit", exact: true }).click();
  await assignees.locator('input[value="Manual One"]').fill("Manual Edited");
  await assignees.getByRole("button", { name: "Save", exact: true }).click();
  await assignees
    .getByRole("button", { name: "Set Manual Edited to female" })
    .click();
  await expect(
    assignees.getByRole("button", { name: "Set Manual Edited to male" }),
  ).toBeVisible();
  await assignees
    .getByRole("checkbox", {
      name: "Select Manual Edited for multiple assignment",
    })
    .check();
  await assignees
    .getByRole("checkbox", {
      name: "Select Manual Two for multiple assignment",
    })
    .check();
  await assignees
    .getByRole("button", { name: "Assign Multiple", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Assign", exact: true })
    .first()
    .click();
  await expect(pairs.locator('[draggable="true"]')).toHaveCount(2);
  const dragSource = assignees
    .locator('[draggable="true"]')
    .filter({ hasText: "Drag Person" });
  const dropZone = pairs.locator('[style="border-style: dashed;"]').nth(1);
  await dragSource.dragTo(dropZone);
  await expect(pairs.locator('[draggable="true"]')).toHaveCount(3);
  await pairs.getByPlaceholder("Add new assignee").nth(1).fill("Inline Person");
  await pairs
    .locator(".slot-create-form")
    .nth(1)
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await expect(pairs.getByText("Inline Person", { exact: true })).toBeVisible();
  await pairs.getByRole("button", { name: "Show all locations" }).click();
  await expect(
    pairs.getByText("Stadium Metro Station", { exact: true }),
  ).toBeVisible();
  await pairs.getByRole("button", { name: "Hide all locations" }).click();
  await expect(
    pairs.getByText("Stadium Metro Station", { exact: true }),
  ).not.toBeVisible();
  await pairs
    .getByRole("button", { name: "Copy assignments", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Manual Edited",
  );
  await assignees
    .getByRole("button", { name: "Full screen Assignees", exact: true })
    .click();
  await expect(assignees).toHaveAttribute("role", "dialog");
  await page.keyboard.press("Escape");
  await expect(assignees).toHaveAttribute("role", "tabpanel");
  await assignees
    .getByRole("button", { name: "Save assignees", exact: true })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }).first(),
  ).toBeVisible();
  await assignees.getByPlaceholder("Enter assignee name").fill("Clear Me");
  await assignees.getByRole("button", { name: "Create", exact: true }).click();
  await assignees
    .getByRole("button", { name: "Clear assignees", exact: true })
    .click();
  await expect(assignees.getByText("Clear Me", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await pairs.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    pairs.getByText(
      "Choose territories in the Territories panel to assign partners.",
    ),
  ).toBeVisible();
  await expect(assignees.getByText("0 people · 0 available")).toBeVisible();
  await assignees
    .getByRole("button", { name: "Save assignees", exact: true })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }).first(),
  ).toBeVisible();
});

test("anonymous pages require login and user directory pagination respects filters", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/workspace",
    "/admin",
    "/admin/users",
    "/admin/areas",
    "/admin/territories",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  await login(page);
  await page.goto("/admin/users");
  await expect(page.getByRole("row")).toHaveCount(11);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Filter by role" })
    .selectOption("super_admin");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Filter by role" })
    .selectOption("all");
  await page
    .getByRole("textbox", { name: "Search users" })
    .fill("ui-list-12@example.test");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(
    page.getByText("Directory User 12", { exact: true }),
  ).toBeVisible();
});

test("mobile navigation restores focus and unsaved links and history can be cancelled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await login(page);
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await menu.click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole("link", { name: "Open user workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator(".mobile-save-bar")).toContainText(
    "All changes saved",
  );
  await openTab(page, "Assignees");
  await page
    .getByPlaceholder("Enter assignee name")
    .fill("Unsaved guard check");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await menu.click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Open admin dashboard" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.keyboard.press("Escape");
  const confirmation = page.waitForEvent("dialog");
  await page.evaluate(() => history.back());
  await (await confirmation).dismiss();
  await expect(page).toHaveURL(/\/workspace$/);
});
