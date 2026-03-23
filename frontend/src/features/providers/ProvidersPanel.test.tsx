import type { ComponentProps } from "react";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProvidersPanel } from "./ProvidersPanel";

const systemStorage = {
  id: "storage-system-1",
  provider_type: "storage" as const,
  workspace_profile: "system",
  credential_scope: "system" as const,
  name: "Supabase (Mock)",
  base_url: "",
  api_key: "",
  model: "supabase-storage",
  region: "global",
  create_job_path: "",
  get_job_path: "",
  status: "active" as const,
  is_default: 0,
  config_json: {
    root_path: "C:/mock",
    storage_mode: "supabase_mock",
  },
  updated_at: "2026-03-22T00:00:00Z",
};

const workspaceStorage = {
  id: "storage-workspace-1",
  provider_type: "storage" as const,
  workspace_profile: "shared",
  credential_scope: "workspace" as const,
  name: "Supabase Workspace",
  base_url: "",
  api_key: "",
  model: "supabase-storage",
  region: "global",
  create_job_path: "",
  get_job_path: "",
  status: "active" as const,
  is_default: 0,
  config_json: {
    project_url: "https://demo.supabase.co",
    service_role_key: "service-role",
    storage_bucket: "content-artifacts",
    metadata_table: "project_artifacts",
    storage_mode: "supabase",
  },
  updated_at: "2026-03-22T00:10:00Z",
};

const secondaryWorkspaceStorage = {
  id: "storage-workspace-2",
  provider_type: "storage" as const,
  workspace_profile: "shared",
  credential_scope: "workspace" as const,
  name: "Google Drive Workspace",
  base_url: "",
  api_key: "",
  model: "google-drive",
  region: "global",
  create_job_path: "",
  get_job_path: "",
  status: "active" as const,
  is_default: 0,
  config_json: {
    folder_id: "folder-1",
    service_account_json: "{ }",
    storage_mode: "google_drive",
  },
  updated_at: "2026-03-22T00:20:00Z",
};

const tertiaryWorkspaceStorage = {
  id: "storage-workspace-3",
  provider_type: "storage" as const,
  workspace_profile: "shared",
  credential_scope: "workspace" as const,
  name: "Archive Workspace",
  base_url: "",
  api_key: "",
  model: "local-storage-v1",
  region: "global",
  create_job_path: "",
  get_job_path: "",
  status: "active" as const,
  is_default: 0,
  config_json: {
    root_path: "C:/archive",
    storage_mode: "local",
  },
  updated_at: "2026-03-22T00:30:00Z",
};

const providerGroups = [
  { key: "text_llm", title: "文字模型供應商", items: [] },
  { key: "video_llm", title: "影片模型供應商", items: [] },
  {
    key: "storage",
    title: "儲存供應商",
    items: [systemStorage, workspaceStorage, secondaryWorkspaceStorage, tertiaryWorkspaceStorage],
  },
];

function rowFor(name: string) {
  return screen
    .getAllByRole("row")
    .find((row) => within(row).queryByText(name)) as HTMLTableRowElement;
}

function renderPanel(overrides: Partial<ComponentProps<typeof ProvidersPanel>> = {}) {
  const startEditProvider = vi.fn();
  const removeProvider = vi.fn();
  const testSavedProviderConnection = vi.fn();
  const applyStorageOption = vi.fn();
  const applyVideoVendor = vi.fn();
  const saveProvider = vi.fn();
  const testProviderDraftConnection = vi.fn();
  const resetProviderEditor = vi.fn();
  const startCreateStorageProvider = vi.fn();
  const setProviderConfigValue = vi.fn();
  const applyStoragePolicyAction = vi.fn();
  const applyStorageProvider = vi.fn();
  const cloneProviderAsEditable = vi.fn();
  const setProviderForm = vi.fn();

  render(
    <ProvidersPanel
      providers={[systemStorage, workspaceStorage, secondaryWorkspaceStorage, tertiaryWorkspaceStorage]}
      providerGroups={providerGroups}
      editingProviderId=""
      providerForm={{
        provider_type: "storage",
        name: "",
        base_url: "",
        api_key: "",
        model: "supabase-storage",
        region: "global",
        create_job_path: "",
        get_job_path: "",
        status: "active",
        is_default: false,
        config_json: {
          project_url: "",
          service_role_key: "",
          storage_bucket: "",
          metadata_table: "",
        },
      }}
      setProviderForm={setProviderForm}
      startEditProvider={startEditProvider}
      removeProvider={removeProvider}
      testSavedProviderConnection={testSavedProviderConnection}
      applyStorageOption={applyStorageOption}
      applyVideoVendor={applyVideoVendor}
      saveProvider={saveProvider}
      testProviderDraftConnection={testProviderDraftConnection}
      resetProviderEditor={resetProviderEditor}
      startCreateStorageProvider={startCreateStorageProvider}
      getProviderConfigValue={(key) => {
        const values: Record<string, string> = {
          project_url: "",
          service_role_key: "",
          storage_bucket: "",
          metadata_table: "",
          folder_id: "",
          service_account_json: "",
        };
        return values[key] ?? "";
      }}
      setProviderConfigValue={setProviderConfigValue}
      applyStoragePolicyAction={applyStoragePolicyAction}
      applyStorageProvider={applyStorageProvider}
      providerEditorRef={{ current: null }}
      workspaceProfile="shared"
      storagePolicy={{
        policy: {
          id: "policy-1",
          workspace_profile: "shared",
          policy_scope: "workspace",
          data_provider_id: workspaceStorage.id,
          asset_provider_id: secondaryWorkspaceStorage.id,
          video_provider_id: secondaryWorkspaceStorage.id,
          fallback_provider_id: systemStorage.id,
          policy_json: {
            resolved: {
              data_provider_model: workspaceStorage.model,
              document_provider_model: workspaceStorage.model,
              asset_provider_model: secondaryWorkspaceStorage.model,
              video_provider_model: secondaryWorkspaceStorage.model,
              fallback_provider_model: systemStorage.model,
            },
          },
          created_at: "2026-03-22T00:00:00Z",
          updated_at: "2026-03-22T00:00:00Z",
        },
        data_provider: workspaceStorage,
        asset_provider: secondaryWorkspaceStorage,
        video_provider: secondaryWorkspaceStorage,
        fallback_provider: systemStorage,
      }}
      storagePolicyResolved={{
        data_provider_model: workspaceStorage.model,
        document_provider_model: workspaceStorage.model,
        asset_provider_model: secondaryWorkspaceStorage.model,
        video_provider_model: secondaryWorkspaceStorage.model,
        fallback_provider_model: systemStorage.model,
      }}
      storageProviderOptions={[
        { model: "google-drive", name: "Google Drive", note: "note" },
        { model: "supabase-storage", name: "Supabase Storage", note: "note" },
      ]}
      videoVendors={[]}
      formatDate={() => "2026/03/22"}
      isProviderReadOnly={(provider) => provider.credential_scope === "system"}
      editingProviderReadOnly={false}
      cloneProviderAsEditable={cloneProviderAsEditable}
      providerTestResult={null}
      providerTestTargetId=""
      testingProviderId=""
      testingProviderDraft={false}
      providerNotice=""
      {...overrides}
    />,
  );

  return {
    startEditProvider,
    removeProvider,
    testSavedProviderConnection,
    saveProvider,
    testProviderDraftConnection,
    resetProviderEditor,
    startCreateStorageProvider,
    applyStoragePolicyAction,
    applyStorageProvider,
    cloneProviderAsEditable,
  };
}

describe("ProvidersPanel storage actions", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows storage summary, create button, workspace actions, and collapsed fallback section", () => {
    const actions = renderPanel();

    expect(screen.getByRole("heading", { name: "目前使用中的 Storage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增自建 Storage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢復平台預設策略" })).toBeInTheDocument();
    expect(screen.getAllByText("Supabase Workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Google Drive Workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Archive Workspace").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "展開平台保底設定" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "複製為可編輯版本" })).not.toBeInTheDocument();
    expect(
      within(rowFor("Supabase Workspace")).getByRole("button", { name: "已套用" }),
    ).toBeDisabled();
    expect(
      within(rowFor("Google Drive Workspace")).getByRole("button", { name: "已套用" }),
    ).toBeDisabled();
    expect(within(rowFor("Supabase Workspace")).getByText("目前負責文件紀錄")).toBeInTheDocument();
    expect(within(rowFor("Google Drive Workspace")).getByText("目前負責素材、影片輸出")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增自建 Storage" }));
    fireEvent.click(screen.getByRole("button", { name: "恢復平台預設策略" }));
    fireEvent.click(within(rowFor("Supabase Workspace")).getByRole("button", { name: "測試" }));
    fireEvent.click(within(rowFor("Supabase Workspace")).getByRole("button", { name: "編輯" }));
    fireEvent.click(within(rowFor("Archive Workspace")).getByRole("button", { name: "套用" }));
    fireEvent.click(within(rowFor("Archive Workspace")).getByRole("button", { name: "刪除" }));

    expect(actions.startCreateStorageProvider).toHaveBeenCalledTimes(1);
    expect(actions.applyStoragePolicyAction).toHaveBeenCalledTimes(1);
    expect(actions.testSavedProviderConnection).toHaveBeenCalledWith(workspaceStorage);
    expect(actions.startEditProvider).toHaveBeenCalledWith(workspaceStorage);
    expect(actions.applyStorageProvider).toHaveBeenCalledWith(tertiaryWorkspaceStorage.id);
    expect(actions.removeProvider).toHaveBeenCalledWith(tertiaryWorkspaceStorage.id);
  });

  it("expands fallback section and routes system buttons correctly", () => {
    const actions = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "展開平台保底設定" }));

    expect(screen.getByRole("button", { name: "收合平台保底設定" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "查看" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "複製為可編輯版本" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "查看" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "複製為可編輯版本" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "收合平台保底設定" }));

    expect(screen.getByRole("button", { name: "展開平台保底設定" })).toBeInTheDocument();

    expect(actions.startEditProvider).toHaveBeenCalledWith(systemStorage);
    expect(actions.cloneProviderAsEditable).toHaveBeenCalledWith(systemStorage);
  });

  it("routes editor buttons through the shared editor actions", () => {
    const actions = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "測試目前設定" }));
    fireEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    fireEvent.click(screen.getByRole("button", { name: "清空表單" }));

    expect(actions.testProviderDraftConnection).toHaveBeenCalledTimes(1);
    expect(actions.saveProvider).toHaveBeenCalledTimes(1);
    expect(actions.resetProviderEditor).toHaveBeenCalledTimes(1);
  });

  it("shows saved-provider test result inline near the tested row", () => {
    renderPanel({
      providerTestTargetId: workspaceStorage.id,
      providerTestResult: {
        ok: true,
        provider_type: "storage",
        provider_name: workspaceStorage.name,
        mode: "saved_provider",
        detail: "已確認 Supabase Storage bucket 可存取。",
        status_code: 200,
        latency_ms: 998,
      },
    });

    const row = rowFor("Supabase Workspace");
    expect(within(row).getByText("測試成功")).toBeInTheDocument();
    expect(within(row).getByText("已確認 Supabase Storage bucket 可存取。")).toBeInTheDocument();
    expect(within(row).getByText("HTTP 200 / 998 ms")).toBeInTheDocument();
  });
});
