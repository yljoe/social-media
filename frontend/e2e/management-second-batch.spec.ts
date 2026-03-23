import { expect, test } from "@playwright/test";

function selectedProjectName(page: import("@playwright/test").Page) {
  return page.locator(".project-management-selected-copy strong").first();
}

async function createProject(page: import("@playwright/test").Page, name: string, description: string) {
  await page.getByTestId("project-name-input").fill(name);
  await page.getByTestId("project-description-input").fill(description);
  await page.getByTestId("project-save-button").click();
  await expect(selectedProjectName(page)).toContainText(name);
}

test.describe("第二批管理流程 E2E", () => {
  test("供應商管理可新增、編輯、刪除自建 Supabase Storage", async ({ page }) => {
    const providerName = "E2E Supabase Storage";
    const updatedProviderName = "E2E Supabase Storage Updated";

    await page.goto("/");
    await page.getByTestId("tab-providers").click();

    await page.getByTestId("storage-create-button").click();
    await page.getByTestId("provider-form-storage-model").selectOption("supabase-storage");
    await page.getByTestId("provider-form-name").fill(providerName);
    await page.getByTestId("provider-form-supabase-project-url").fill("https://e2e-provider.supabase.co");
    await page.getByTestId("provider-form-supabase-service-role-key").fill("e2e-service-role-key");
    await page.getByTestId("provider-form-supabase-storage-bucket").fill("content-artifacts");
    await page.getByTestId("provider-form-supabase-metadata-table").fill("project_artifacts");
    await page.getByTestId("provider-form-save").click();

    const providerRow = page.locator(".data-table tbody tr").filter({ hasText: providerName }).first();
    await expect(providerRow).toBeVisible();

    await page.getByTestId("storage-fallback-toggle").click();
    await expect(page.locator("[data-testid^='system-storage-row-']")).toHaveCount(3);

    await providerRow.locator("button").nth(1).click();
    await page.getByTestId("provider-form-name").fill(updatedProviderName);
    await page.getByTestId("provider-form-save").click();

    const updatedRow = page.locator(".data-table tbody tr").filter({ hasText: updatedProviderName }).first();
    await expect(updatedRow).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await updatedRow.locator("button").last().click();
    await expect(page.locator(".data-table tbody tr").filter({ hasText: updatedProviderName })).toHaveCount(0);
  });

  test("素材管理可新增、搜尋、編輯、刪除素材", async ({ page }) => {
    const assetName = "E2E Mail Template";
    const updatedAssetName = "E2E Mail Template Updated";

    await page.goto("/");
    await page.getByTestId("tab-assets").click();

    await page.getByTestId("asset-form-type").selectOption("mail_template");
    await page.getByTestId("asset-form-name").fill(assetName);
    await page.getByTestId("asset-form-content").fill("這是一份 E2E 測試素材內容。");
    await page.getByTestId("asset-form-file-path").fill("templates/e2e-mail-template.md");
    await page.getByTestId("asset-form-save").click();

    const assetRow = page.locator(".asset-row-card").filter({ hasText: assetName }).first();
    await expect(assetRow).toBeVisible();

    await page.getByTestId("asset-search-input").fill(assetName);
    await expect(assetRow).toBeVisible();

    await assetRow.locator("button[data-testid^='asset-edit-']").click();
    await page.getByTestId("asset-form-name").fill(updatedAssetName);
    await page.getByTestId("asset-form-save").click();

    const updatedAssetRow = page.locator(".asset-row-card").filter({ hasText: updatedAssetName }).first();
    await expect(updatedAssetRow).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await updatedAssetRow.locator("button[data-testid^='asset-delete-']").click();
    await expect(page.locator(".asset-row-card").filter({ hasText: updatedAssetName })).toHaveCount(0);
  });

  test("費用與紀錄可切換最近專案、搜尋與 JSON 檢視模式", async ({ page }) => {
    const projectName = "E2E Cost Project";
    const projectDescription = "第二批 E2E 成本流程測試";

    await page.goto("/");
    await createProject(page, projectName, projectDescription);

    await page.getByTestId("selected-project-open-content").click();
    await page.getByTestId("text-generate-submit").click();
    await expect(page.locator(".alert.success")).toBeVisible();

    await page.getByTestId("tab-costs").click();
    await page.getByTestId("cost-project-search").fill(projectName);
    await page.getByTestId("cost-project-select").selectOption({ label: projectName });

    const ledger = page.getByTestId("cost-ledger-json");

    await page.getByTestId("cost-ledger-overview").click();
    await expect(ledger).toContainText("project_id");

    await page.getByTestId("cost-ledger-project").click();
    await expect(ledger).toContainText("bom");
    await expect(page.locator(".cost-project-chip").filter({ hasText: projectName }).first()).toBeVisible();
  });
});
