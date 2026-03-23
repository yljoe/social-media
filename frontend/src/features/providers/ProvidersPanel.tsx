import { useState } from "react";
import type { RefObject } from "react";

import type {
  Provider,
  ProviderConnectionTestResult,
  StoragePolicyResponse,
  VideoVendorDefinition,
} from "../../shared/types/api";

type ProviderFormState = {
  provider_type: "text_llm" | "video_llm" | "storage";
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  region: string;
  create_job_path: string;
  get_job_path: string;
  status: "active" | "inactive";
  is_default: boolean;
  config_json: Record<string, unknown>;
};

type ProviderGroup = {
  key: string;
  title: string;
  items: Provider[];
};

type StorageOption = {
  model: string;
  name: string;
  note: string;
};

type ProvidersPanelProps = {
  providers: Provider[];
  providerGroups: ProviderGroup[];
  editingProviderId: string;
  providerForm: ProviderFormState;
  setProviderForm: (value: ProviderFormState) => void;
  startEditProvider: (provider: Provider) => void;
  removeProvider: (providerId: string) => void;
  testSavedProviderConnection: (provider: Provider) => void;
  applyStorageOption: (model: string) => void;
  applyVideoVendor: (vendor: string) => void;
  saveProvider: () => void;
  testProviderDraftConnection: () => void;
  resetProviderEditor: () => void;
  startCreateStorageProvider: () => void;
  getProviderConfigValue: (key: string) => string;
  setProviderConfigValue: (key: string, value: string) => void;
  applyStoragePolicyAction: () => void;
  applyStorageProvider: (providerId: string) => void;
  providerEditorRef: RefObject<HTMLElement | null>;
  workspaceProfile: string;
  storagePolicy: StoragePolicyResponse | null;
  storagePolicyResolved?: Record<string, string>;
  storageProviderOptions: readonly StorageOption[];
  videoVendors: VideoVendorDefinition[];
  formatDate: (value?: string) => string;
  isProviderReadOnly: (provider: Provider) => boolean;
  editingProviderReadOnly: boolean;
  cloneProviderAsEditable: (provider: Provider) => void;
  providerTestResult: ProviderConnectionTestResult | null;
  providerTestTargetId: string;
  testingProviderId: string;
  testingProviderDraft: boolean;
  providerNotice: string;
};

function providerTypeLabel(value: Provider["provider_type"] | ProviderFormState["provider_type"]) {
  if (value === "text_llm") return "文字模型";
  if (value === "video_llm") return "影片模型";
  return "儲存服務";
}

function statusLabel(value: Provider["status"] | ProviderFormState["status"]) {
  return value === "active" ? "啟用" : "停用";
}

function scopeLabel(value: Provider["credential_scope"]) {
  return value === "system" ? "系統層級" : "工作設定檔";
}

function displaySystemStorageName(provider: Provider) {
  if (provider.model === "supabase-storage") return "Supabase System";
  if (provider.model === "google-drive") return "Google Drive System";
  if (provider.model === "local-storage-v1") return "Local Storage System";
  return provider.name.replace(/\s*\(Mock\)\s*/gi, " ").trim().replace(/\s{2,}/g, " ");
}

function providerDisplayName(provider: Provider) {
  if (provider.provider_type === "storage" && provider.credential_scope === "system") {
    return displaySystemStorageName(provider);
  }
  return provider.name;
}

function resolvedStorageLabel(provider: Provider | null | undefined, resolvedModel?: string) {
  if (!provider) return "尚未設定";
  const name = providerDisplayName(provider);
  return resolvedModel ? `${name}` : name;
}

function supportedStorageRoles(provider: Provider) {
  if (provider.model === "google-drive") return ["asset", "video"] as const;
  if (provider.model === "supabase-storage") return ["document"] as const;
  if (provider.model === "local-storage-v1") return ["document", "asset", "video"] as const;
  return ["document"] as const;
}

function summarizeStorageUsage(isDocumentApplied: boolean, isAssetApplied: boolean, isVideoApplied: boolean) {
  const appliedLabels = [
    isDocumentApplied ? "文件紀錄" : "",
    isAssetApplied ? "素材" : "",
    isVideoApplied ? "影片輸出" : "",
  ].filter(Boolean);
  if (appliedLabels.length > 0) {
    return {
      summary: `已套用：${appliedLabels.join(" / ")}`,
      detail: `目前負責${appliedLabels.join("、")}`,
    };
  }
  return {
    summary: "",
    detail: "可測試、可編輯、可套用",
  };
}

function providerTestMeta(result: ProviderConnectionTestResult) {
  return [
    result.status_code ? `HTTP ${result.status_code}` : "",
    typeof result.latency_ms === "number" ? `${result.latency_ms} ms` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

export function ProvidersPanel({
  providers,
  providerGroups,
  editingProviderId,
  providerForm,
  setProviderForm,
  startEditProvider,
  removeProvider,
  testSavedProviderConnection,
  applyStorageOption,
  applyVideoVendor,
  saveProvider,
  testProviderDraftConnection,
  resetProviderEditor,
  startCreateStorageProvider,
  getProviderConfigValue,
  setProviderConfigValue,
  applyStoragePolicyAction,
  applyStorageProvider,
  providerEditorRef,
  workspaceProfile,
  storagePolicy,
  storagePolicyResolved,
  storageProviderOptions,
  videoVendors,
  formatDate,
  isProviderReadOnly,
  editingProviderReadOnly,
  cloneProviderAsEditable,
  providerTestResult,
  providerTestTargetId,
  testingProviderId,
  testingProviderDraft,
  providerNotice,
}: ProvidersPanelProps) {
  const [systemStorageExpanded, setSystemStorageExpanded] = useState(false);
  const selectedVideoVendor = videoVendors.find(
    (item) => item.vendor === String(providerForm.config_json.video_vendor || "generic_rest"),
  );
  const editorDisabled = editingProviderReadOnly;
  const nonStorageGroups = providerGroups.filter((group) => group.key !== "storage");
  const systemStorageProviders = providers.filter(
    (provider) => provider.provider_type === "storage" && provider.credential_scope === "system",
  );
  const workspaceStorageProviders = providers.filter(
    (provider) => provider.provider_type === "storage" && provider.credential_scope !== "system",
  );
  const currentDocumentProviderId = storagePolicy?.policy?.data_provider_id ?? "";
  const currentAssetProviderId = storagePolicy?.policy?.asset_provider_id ?? "";
  const currentVideoProviderId = storagePolicy?.policy?.video_provider_id ?? "";
  const currentDocumentStorageProvider = storagePolicy?.data_provider ?? null;
  const currentAssetStorageProvider = storagePolicy?.asset_provider ?? null;
  const currentVideoStorageProvider = storagePolicy?.video_provider ?? null;
  const fallbackStorageProvider = storagePolicy?.fallback_provider ?? null;
  const editorTestResult = providerTestTargetId ? null : providerTestResult;

  return (
    <section className="panel-page panel-page-management">
      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>Provider Console</p>
            <h3>文字與影片供應商</h3>
          </div>
          <span className="section-chip">{nonStorageGroups.reduce((sum, group) => sum + group.items.length, 0)} 筆設定</span>
        </div>

        <div className="hint-banner">
          <strong>供應商分區</strong>
          <span>文字模型與影片模型集中在這裡管理；儲存服務已拆到下方兩張獨立卡片，避免混在一起誤操作。</span>
        </div>

        <div className="management-group-stack">
          {nonStorageGroups.map((group) => (
            <section key={group.key} className="management-group">
              <div className="management-group-head">
                <strong>{group.title}</strong>
                <span>{group.items.length} 筆</span>
              </div>
              <div className="table-panel">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>名稱</th>
                      <th>模型 / 廠商</th>
                      <th>狀態</th>
                      <th>範圍</th>
                      <th>最後更新</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.length > 0 ? (
                      group.items.map((provider) => (
                        <tr key={provider.id} data-testid={`provider-row-${provider.id}`}>
                          <td>
                            <div className="table-primary-cell">
                              <strong>{providerDisplayName(provider)}</strong>
                              <span>{providerTypeLabel(provider.provider_type)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="table-primary-cell">
                              <strong>{provider.model || "-"}</strong>
                              <span>{String(provider.config_json?.video_vendor || "-")}</span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={
                                provider.status === "active"
                                  ? "status-badge status-badge-active"
                                  : "status-badge status-badge-muted"
                              }
                            >
                              {provider.is_default === 1
                                ? `${statusLabel(provider.status)} / 預設`
                                : statusLabel(provider.status)}
                            </span>
                          </td>
                          <td>
                            <div className="table-primary-cell">
                              <strong>{provider.workspace_profile}</strong>
                              <span>{scopeLabel(provider.credential_scope)}</span>
                            </div>
                          </td>
                          <td>{formatDate(provider.updated_at)}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => testSavedProviderConnection(provider)}
                                disabled={testingProviderId === provider.id}
                                data-testid={`provider-test-${provider.id}`}
                              >
                                {testingProviderId === provider.id ? "測試中" : "測試"}
                              </button>
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => startEditProvider(provider)}
                                data-testid={`provider-edit-${provider.id}`}
                              >
                                {isProviderReadOnly(provider) ? "查看" : "編輯"}
                              </button>
                              {!isProviderReadOnly(provider) ? (
                                <button
                                  className="ghost-button ghost-danger"
                                  type="button"
                                  onClick={() => removeProvider(provider.id)}
                                  data-testid={`provider-delete-${provider.id}`}
                                >
                                  刪除
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">目前沒有這個類型的供應商。</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </article>

      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>Storage Overview</p>
            <h3>目前使用中的 Storage</h3>
          </div>
          <span className="section-chip">{workspaceStorageProviders.length} 筆自建設定</span>
        </div>

        <div className="provider-policy-panel">
          <div className="policy-grid">
            <div className="policy-card">
              <span>文件紀錄 Storage</span>
              <strong>{resolvedStorageLabel(currentDocumentStorageProvider, storagePolicyResolved?.document_provider_model || storagePolicyResolved?.data_provider_model)}</strong>
              <p>{storagePolicyResolved?.document_provider_model || storagePolicyResolved?.data_provider_model || currentDocumentStorageProvider?.model || "尚未設定"}</p>
            </div>
            <div className="policy-card">
              <span>素材 Storage</span>
              <strong>{resolvedStorageLabel(currentAssetStorageProvider, storagePolicyResolved?.asset_provider_model)}</strong>
              <p>{storagePolicyResolved?.asset_provider_model || currentAssetStorageProvider?.model || "尚未設定"}</p>
            </div>
            <div className="policy-card">
              <span>影片輸出 Storage</span>
              <strong>{resolvedStorageLabel(currentVideoStorageProvider, storagePolicyResolved?.video_provider_model)}</strong>
              <p>{storagePolicyResolved?.video_provider_model || currentVideoStorageProvider?.model || "尚未設定"}</p>
            </div>
            <div className="policy-card">
              <span>工作設定檔</span>
              <strong>{workspaceProfile}</strong>
              <p>{storagePolicy?.policy?.workspace_profile || workspaceProfile}</p>
            </div>
            <div className="policy-card">
              <span>保底 Storage</span>
              <strong>{resolvedStorageLabel(fallbackStorageProvider, storagePolicyResolved?.fallback_provider_model)}</strong>
              <p>{storagePolicyResolved?.fallback_provider_model || fallbackStorageProvider?.model || "-"}</p>
            </div>
          </div>
          <div className="toolbar-actions">
            <button className="primary-button" type="button" onClick={startCreateStorageProvider} data-testid="storage-create-button">
              新增自建 Storage
            </button>
            <button className="secondary-button" type="button" onClick={applyStoragePolicyAction}>
              恢復平台預設策略
            </button>
          </div>
        </div>

        <div className="hint-banner">
          <strong>自建供應商</strong>
          <span>這一區只放你新建的 storage。儲存後可先測試，再按「套用」把它接到它支援的用途上，例如 Supabase 接文件紀錄，Google Drive 接素材與影片輸出。</span>
        </div>

        <div className="table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>名稱</th>
                <th>模型</th>
                <th>狀態</th>
                <th>範圍</th>
                <th>最後更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {workspaceStorageProviders.length > 0 ? (
                workspaceStorageProviders.map((provider) => {
                  const isDocumentApplied = provider.id === currentDocumentProviderId;
                  const isAssetApplied = provider.id === currentAssetProviderId;
                  const isVideoApplied = provider.id === currentVideoProviderId;
                  const usage = summarizeStorageUsage(isDocumentApplied, isAssetApplied, isVideoApplied);
                  const roles = supportedStorageRoles(provider);
                  const hasAllSupportedRoles = roles.every((role) => {
                    if (role === "document") return isDocumentApplied;
                    if (role === "asset") return isAssetApplied;
                    return isVideoApplied;
                  });
                  const inlineTestResult =
                    providerTestResult && providerTestTargetId === provider.id ? providerTestResult : null;
                  const inlineTestMeta = inlineTestResult ? providerTestMeta(inlineTestResult) : "";
                  return (
                    <tr key={provider.id} data-testid={`storage-provider-row-${provider.id}`}>
                      <td>
                        <div className="table-primary-cell">
                          <strong>{providerDisplayName(provider)}</strong>
                          <span>{usage.detail}</span>
                        </div>
                      </td>
                      <td>{provider.model}</td>
                      <td>
                        <span
                          className={
                            hasAllSupportedRoles
                              ? "status-badge status-badge-active"
                              : provider.status === "active"
                                ? "status-badge status-badge-active"
                                : "status-badge status-badge-muted"
                          }
                        >
                          {usage.summary || statusLabel(provider.status)}
                        </span>
                      </td>
                      <td>{provider.workspace_profile}</td>
                      <td>{formatDate(provider.updated_at)}</td>
                      <td>
                        <div className="table-actions provider-action-stack">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => testSavedProviderConnection(provider)}
                            disabled={testingProviderId === provider.id}
                            data-testid={`storage-provider-test-${provider.id}`}
                          >
                            {testingProviderId === provider.id ? "測試中" : "測試"}
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => startEditProvider(provider)}
                            data-testid={`storage-provider-edit-${provider.id}`}
                          >
                            編輯
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => applyStorageProvider(provider.id)}
                            disabled={hasAllSupportedRoles}
                            data-testid={`storage-provider-apply-${provider.id}`}
                          >
                            {hasAllSupportedRoles ? "已套用" : "套用"}
                          </button>
                          <button
                            className="ghost-button ghost-danger"
                            type="button"
                            onClick={() => removeProvider(provider.id)}
                            data-testid={`storage-provider-delete-${provider.id}`}
                          >
                            刪除
                          </button>
                        </div>
                        {inlineTestResult ? (
                          <div
                            className={
                              inlineTestResult.ok
                                ? "inline-provider-test-result inline-provider-test-result-success"
                                : "inline-provider-test-result inline-provider-test-result-error"
                            }
                            data-testid={`storage-provider-test-result-${provider.id}`}
                          >
                            <strong>{inlineTestResult.ok ? "測試成功" : "測試失敗"}</strong>
                            <span>{inlineTestResult.detail}</span>
                            {inlineTestMeta ? <span>{inlineTestMeta}</span> : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">目前還沒有自建 storage。你可以先從上方 system 版本複製，再存成可編輯版本。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card management-card" ref={providerEditorRef}>
        <div className="section-head">
          <div>
            <p>Provider Editor</p>
            <h3>{editingProviderId ? "編輯供應商" : "新增供應商"}</h3>
          </div>
          <span className="section-chip">{providerTypeLabel(providerForm.provider_type)}</span>
        </div>

        <div className="hint-banner">
          <strong>目前設定檔</strong>
          <span>
            目前正在編輯 <code>{workspaceProfile}</code> 設定檔下的供應商。
            {editingProviderReadOnly
              ? " 這筆是 system 層級，只能查看，不能直接修改。若要調整，請先複製為可編輯版本。"
              : " 你可以在這裡新增或更新 workspace 供應商。"}
          </span>
        </div>

        {providerNotice ? <div className="alert success compact-alert">{providerNotice}</div> : null}

        <div className="form-grid">
          <div className="inline-grid two">
            <label>
              供應商類型
              <select
                className="fixed-field"
                value={providerForm.provider_type}
                disabled={editorDisabled}
                data-testid="provider-form-type"
                onChange={(event) => {
                  const nextType = event.target.value as ProviderFormState["provider_type"];
                  if (nextType === "storage") {
                    applyStorageOption(providerForm.model === "supabase-storage" ? "supabase-storage" : "google-drive");
                    return;
                  }
                  if (nextType === "video_llm") {
                    applyVideoVendor(String(providerForm.config_json.video_vendor || "generic_rest"));
                    return;
                  }
                  setProviderForm({
                    ...providerForm,
                    provider_type: nextType,
                    model: nextType === "text_llm" ? "gpt-4.1-mini" : providerForm.model,
                  });
                }}
              >
                <option value="text_llm">文字模型</option>
                <option value="video_llm">影片模型</option>
                <option value="storage">儲存服務</option>
              </select>
            </label>
            <label>
              狀態
              <select
                className="fixed-field"
                value={providerForm.status}
                disabled={editorDisabled}
                data-testid="provider-form-status"
                onChange={(event) =>
                  setProviderForm({ ...providerForm, status: event.target.value as ProviderFormState["status"] })
                }
              >
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </label>
          </div>

          <label>
            名稱
            <input
              className="fixed-field"
              value={providerForm.name}
              disabled={editorDisabled}
              data-testid="provider-form-name"
              onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })}
            />
          </label>

          {providerForm.provider_type === "storage" ? (
            <>
              <label>
                儲存類型
                <select
                  className="fixed-field"
                  value={providerForm.model}
                  disabled={editorDisabled}
                  data-testid="provider-form-storage-model"
                  onChange={(event) => applyStorageOption(event.target.value)}
                >
                  {storageProviderOptions.map((option) => (
                    <option key={option.model} value={option.model}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="hint-banner">
                <strong>儲存說明</strong>
                <span>
                  {storageProviderOptions.find((option) => option.model === providerForm.model)?.note ||
                    "請選擇一種儲存服務，作為工作設定檔的輸出位置。"}
                </span>
              </div>

              {providerForm.model === "google-drive" ? (
                <>
                  <label>
                    Google Drive 資料夾 ID
                    <input
                      className="fixed-field"
                      value={getProviderConfigValue("folder_id")}
                      disabled={editorDisabled}
                      onChange={(event) => setProviderConfigValue("folder_id", event.target.value)}
                    />
                  </label>
                  <label>
                    服務帳戶 JSON
                    <textarea
                      className="config-textarea"
                      value={getProviderConfigValue("service_account_json")}
                      disabled={editorDisabled}
                      onChange={(event) => setProviderConfigValue("service_account_json", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {providerForm.model === "supabase-storage" ? (
                <>
                  <label>
                    Supabase Project URL
                    <input
                      className="fixed-field"
                      value={getProviderConfigValue("project_url")}
                      disabled={editorDisabled}
                      data-testid="provider-form-supabase-project-url"
                      onChange={(event) => setProviderConfigValue("project_url", event.target.value)}
                      placeholder="https://xxxx.supabase.co"
                    />
                  </label>
                  <label>
                    Supabase Service Role Key
                    <textarea
                      className="config-textarea"
                      value={getProviderConfigValue("service_role_key")}
                      disabled={editorDisabled}
                      data-testid="provider-form-supabase-service-role-key"
                      onChange={(event) => setProviderConfigValue("service_role_key", event.target.value)}
                    />
                  </label>
                  <div className="inline-grid two">
                    <label>
                      Storage Bucket
                      <input
                        className="fixed-field"
                        value={getProviderConfigValue("storage_bucket")}
                        disabled={editorDisabled}
                        data-testid="provider-form-supabase-storage-bucket"
                        onChange={(event) => setProviderConfigValue("storage_bucket", event.target.value)}
                      />
                    </label>
                    <label>
                      Metadata Table
                      <input
                        className="fixed-field"
                        value={getProviderConfigValue("metadata_table")}
                        disabled={editorDisabled}
                        data-testid="provider-form-supabase-metadata-table"
                        onChange={(event) => setProviderConfigValue("metadata_table", event.target.value)}
                      />
                    </label>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <label>
                模型
                <input
                  className="fixed-field"
                  value={providerForm.model}
                  disabled={editorDisabled}
                  data-testid="provider-form-model"
                  onChange={(event) => setProviderForm({ ...providerForm, model: event.target.value })}
                />
              </label>
              <label>
                基礎網址
                <input
                  className="fixed-field"
                  value={providerForm.base_url}
                  disabled={editorDisabled}
                  onChange={(event) => setProviderForm({ ...providerForm, base_url: event.target.value })}
                />
              </label>
              <label>
                API 金鑰 / Token
                <input
                  className="fixed-field"
                  value={providerForm.api_key}
                  disabled={editorDisabled}
                  onChange={(event) => setProviderForm({ ...providerForm, api_key: event.target.value })}
                />
              </label>
            </>
          )}

          {providerForm.provider_type === "video_llm" ? (
            <>
              <label>
                影片供應商
                <select
                  className="fixed-field"
                  value={String(providerForm.config_json.video_vendor || "generic_rest")}
                  disabled={editorDisabled}
                  onChange={(event) => applyVideoVendor(event.target.value)}
                >
                  {videoVendors.map((vendor) => (
                    <option key={vendor.vendor} value={vendor.vendor}>
                      {vendor.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="hint-banner">
                <strong>供應商說明</strong>
                <span>{selectedVideoVendor?.notes || "請依供應商類型補齊模型、網址與任務路徑。"}</span>
              </div>
              <div className="inline-grid three">
                <label>
                  區域
                  <input
                    className="fixed-field"
                    value={providerForm.region}
                    disabled={editorDisabled}
                    onChange={(event) => setProviderForm({ ...providerForm, region: event.target.value })}
                  />
                </label>
                <label>
                  建立任務路徑
                  <input
                    className="fixed-field"
                    value={providerForm.create_job_path}
                    disabled={editorDisabled}
                    onChange={(event) => setProviderForm({ ...providerForm, create_job_path: event.target.value })}
                  />
                </label>
                <label>
                  查詢任務路徑
                  <input
                    className="fixed-field"
                    value={providerForm.get_job_path}
                    disabled={editorDisabled}
                    onChange={(event) => setProviderForm({ ...providerForm, get_job_path: event.target.value })}
                  />
                </label>
              </div>
            </>
          ) : null}

          {providerForm.provider_type !== "storage" ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={providerForm.is_default}
                disabled={editorDisabled}
                onChange={(event) => setProviderForm({ ...providerForm, is_default: event.target.checked })}
              />
              <span>設為這個類型的預設供應商</span>
            </label>
          ) : null}
        </div>

        <div className="management-toolbar">
          <div className="toolbar-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={testProviderDraftConnection}
              disabled={testingProviderDraft}
              data-testid="provider-form-test"
            >
              {testingProviderDraft ? "測試中" : "測試目前設定"}
            </button>
            <button className="primary-button" type="button" onClick={saveProvider} disabled={editorDisabled} data-testid="provider-form-save">
              {editingProviderReadOnly ? "system 僅供查看" : editingProviderId ? "儲存變更" : "新增供應商"}
            </button>
            <button className="ghost-button" type="button" onClick={resetProviderEditor} data-testid="provider-form-reset">
              清空表單
            </button>
          </div>
        </div>

        {editorTestResult ? (
          <div className={editorTestResult.ok ? "alert success provider-test-result" : "alert error provider-test-result"}>
            <strong>{editorTestResult.provider_name}</strong>
            <span>{editorTestResult.detail}</span>
            {editorTestResult.endpoint ? <code>{editorTestResult.endpoint}</code> : null}
          </div>
        ) : null}
      </article>

      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>Platform Fallback</p>
            <h3>平台保底儲存</h3>
          </div>
          <span className="section-chip">{systemStorageProviders.length} 筆基座</span>
        </div>

        <div className="hint-banner">
          <strong>只在 fallback 時接手</strong>
          <span>這一區是平台保底機制。平常不需操作，只有當自建 storage 無法使用時，系統才會退回這些基座。設定會回寫到 SQLite，最終保底會落到 Local Storage。</span>
        </div>

        <div className="provider-fallback-summary">
          <div className="table-primary-cell">
            <strong>目前保底路徑</strong>
            <span>{resolvedStorageLabel(fallbackStorageProvider, storagePolicyResolved?.fallback_provider_model)}</span>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => setSystemStorageExpanded((current) => !current)}
            data-testid="storage-fallback-toggle"
          >
            {systemStorageExpanded ? "收合平台保底設定" : "展開平台保底設定"}
          </button>
        </div>

        {systemStorageExpanded ? (
          <div className="table-panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>模型</th>
                  <th>範圍</th>
                  <th>最後更新</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {systemStorageProviders.length > 0 ? (
                  systemStorageProviders.map((provider) => (
                    <tr key={provider.id} data-testid={`system-storage-row-${provider.id}`}>
                      <td>
                        <div className="table-primary-cell">
                          <strong>{displaySystemStorageName(provider)}</strong>
                          <span>系統層級，進入 SQLite / Local Storage 保底流程</span>
                        </div>
                      </td>
                      <td>{provider.model}</td>
                      <td>{scopeLabel(provider.credential_scope)}</td>
                      <td>{formatDate(provider.updated_at)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => startEditProvider(provider)}
                            data-testid={`system-storage-view-${provider.id}`}
                          >
                            查看
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => cloneProviderAsEditable(provider)}
                            data-testid={`system-storage-clone-${provider.id}`}
                          >
                            複製為可編輯版本
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">目前沒有 system storage。</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>
    </section>
  );
}
