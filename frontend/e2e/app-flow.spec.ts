import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

function successAlert(page: Page) {
  return page.locator(".alert.success");
}

function selectedProjectName(page: Page) {
  return page.locator(".project-management-selected-copy strong").first();
}

function selectedProjectDescription(page: Page) {
  return page.locator(".project-management-selected-copy p").first();
}

function fileActionButtons(page: Page): Locator {
  return page.locator(".storage-group .file-action-row").first().locator("button");
}

async function createProject(page: Page, name: string, description: string) {
  await page.getByTestId("project-name-input").fill(name);
  await page.getByTestId("project-description-input").fill(description);
  await page.getByTestId("project-save-button").click();
  await expect(successAlert(page)).toContainText("專案已建立");
  await expect(selectedProjectName(page)).toContainText(name);
  await expect(selectedProjectDescription(page)).toContainText(description);
}

test.describe("核心流程 E2E", () => {
  test("通知中心、工作設定檔與專案管理可正常切換", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("topbar-notifications-toggle").click();
    await expect(page.locator(".notification-panel")).toBeVisible();

    await page.getByTestId("sidebar-manage-workspace-profiles").click();
    await expect(page.getByTestId("workspace-profile-name-input")).toBeVisible();

    await page.getByTestId("workspace-profile-name-input").fill("Veo 測試設定檔");
    await page.getByTestId("workspace-profile-description-input").fill("E2E 建立的設定檔");
    await page.getByTestId("workspace-profile-save-button").click();
    await expect(successAlert(page)).toContainText("工作設定檔已建立");

    await page.locator("#workspace-profile").selectOption({ label: "shared" });
    await page.getByTestId("tab-projects").click();
    await createProject(page, "E2E Project A", "這是一筆用來驗證專案 CRUD 的 E2E 測試資料。");

    await page.getByTestId("selected-project-edit").click();
    await expect(page.getByTestId("project-name-input")).toHaveValue("E2E Project A");
    await page.getByTestId("project-description-input").fill("更新後的專案描述，用來確認編輯流程可正常運作。");
    await page.getByTestId("project-save-button").click();
    await expect(successAlert(page)).toContainText("專案已更新");
    await expect(selectedProjectDescription(page)).toContainText("更新後的專案描述");
  });

  test("內容生成、影片生成、檔案管理流程可正常運作", async ({ page }) => {
    await page.goto("/");

    await createProject(page, "E2E Flow Project", "內容生成、影片生成與檔案管理的整體流程測試。");

    await page.getByTestId("selected-project-open-content").click();
    await expect(page.getByTestId("text-generate-submit")).toBeVisible();
    await page.getByTestId("text-generate-submit").click();
    await expect(successAlert(page)).toContainText("內容草稿已生成");

    await page.locator(".text-card-preview .preview-tab").filter({ hasText: "JSON" }).click();
    await expect(page.getByTestId("open-video-generation")).toBeVisible();
    await page.getByTestId("open-video-generation").click();
    const renderButton = page.getByTestId("video-render-submit");
    await expect(renderButton).toBeDisabled();

    await page.getByTestId("video-prepare-submit").click();
    await expect(successAlert(page)).toContainText("render_request.json");
    await expect(renderButton).toBeEnabled();

    await page.getByTestId("video-render-submit").click();
    await expect(successAlert(page)).toContainText("影片任務已送出");

    await page.getByTestId("tab-files").click();
    await expect(page.getByRole("heading", { name: "檔案管理", exact: true })).toBeVisible();

    await page.locator(".management-toolbar .primary-button").click();
    await expect(successAlert(page)).toContainText("專案已完成合併");

    const actionButtons = fileActionButtons(page);
    await actionButtons.nth(0).click();
    await expect(page.locator(".file-inspector-card h3")).toContainText(".json");

    const downloadPromise = page.waitForEvent("download");
    await actionButtons.nth(2).click();
    await downloadPromise;

    const firstInspectorTitle = page.locator(".file-inspector-card h3");
    page.once("dialog", (dialog) => dialog.accept("text/storyboard-e2e.json"));
    await actionButtons.nth(3).click();
    await expect(firstInspectorTitle).toContainText("storyboard-e2e.json");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".file-inspector-card .danger-button").click();
    await expect(page.locator(".file-inspector-card")).toHaveCount(0);
  });
});
