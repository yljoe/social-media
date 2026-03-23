import type { MutableRefObject } from "react";

import type { Provider, WorkspaceProfile, WorkspaceProfileSettings } from "../../shared/types/api";

type WorkspaceProfileFormState = {
  name: string;
  description: string;
  source_profile_key: string;
  settings_json: WorkspaceProfileSettings;
};

type WorkspaceProfilePanelProps = {
  providers: Provider[];
  workspaceProfiles: WorkspaceProfile[];
  workspaceProfile: string;
  workspaceProfileForm: WorkspaceProfileFormState;
  editingWorkspaceProfileId: string;
  setWorkspaceProfileForm: (value: WorkspaceProfileFormState) => void;
  selectWorkspaceProfile: (profileKey: string) => void;
  startCreateWorkspaceProfile: (sourceProfileKey?: string) => void;
  startEditWorkspaceProfile: (profile: WorkspaceProfile) => void;
  saveWorkspaceProfile: () => void;
  deleteWorkspaceProfile: (profileId: string) => void;
  formatDate: (value?: string) => string;
  workspaceProfileEditorRef: MutableRefObject<HTMLElement | null>;
  workspaceProfileNotice: string;
};

function normalizeSettings(settings?: Partial<WorkspaceProfileSettings> | null): WorkspaceProfileSettings {
  return {
    default_language: "zh-TW",
    default_target_audience: String(settings?.default_target_audience ?? "企業內部同仁").trim() || "企業內部同仁",
    default_text_provider_id: String(settings?.default_text_provider_id ?? "").trim(),
    default_video_provider_id: String(settings?.default_video_provider_id ?? "").trim(),
    default_total_duration_seconds: Math.max(1, Number(settings?.default_total_duration_seconds ?? 24) || 24),
    default_scene_duration_seconds: Math.max(1, Number(settings?.default_scene_duration_seconds ?? 8) || 8),
    default_resolution: String(settings?.default_resolution ?? "1280x720").trim() || "1280x720",
    default_aspect_ratio: String(settings?.default_aspect_ratio ?? "16:9").trim() || "16:9",
    default_subtitle_enabled: Boolean(settings?.default_subtitle_enabled ?? true),
    default_subtitle_language: String(settings?.default_subtitle_language ?? "繁體中文").trim() || "繁體中文",
    default_font_family: String(settings?.default_font_family ?? "Noto Sans TC").trim() || "Noto Sans TC",
    default_render_style_asset_id: String(settings?.default_render_style_asset_id ?? "").trim(),
    default_asset_provider_role: String(settings?.default_asset_provider_role ?? "google-drive").trim() || "google-drive",
    default_document_provider_role: String(settings?.default_document_provider_role ?? "supabase-storage").trim() || "supabase-storage",
  };
}

function resolveProviderName(providers: Provider[], providerId: string, fallback: string) {
  if (!providerId) return fallback;
  return providers.find((provider) => provider.id === providerId)?.name ?? fallback;
}

function buildSettingsSummary(settings: WorkspaceProfileSettings | undefined, providers: Provider[]) {
  const resolved = normalizeSettings(settings);
  const textLabel = resolveProviderName(providers, resolved.default_text_provider_id, "未指定文字供應商");
  const videoLabel = resolveProviderName(providers, resolved.default_video_provider_id, "未指定影片供應商");
  return [
    `文字：${textLabel}`,
    `影片：${videoLabel}`,
    `規格：${resolved.default_resolution} / ${resolved.default_aspect_ratio}`,
    `節奏：${resolved.default_total_duration_seconds} 秒 / 每幕 ${resolved.default_scene_duration_seconds} 秒`,
    `字幕：${resolved.default_subtitle_enabled ? resolved.default_subtitle_language : "關閉"} / 字型 ${resolved.default_font_family}`,
  ];
}

function updateSettings<K extends keyof WorkspaceProfileSettings>(
  form: WorkspaceProfileFormState,
  setForm: (value: WorkspaceProfileFormState) => void,
  key: K,
  value: WorkspaceProfileSettings[K],
) {
  setForm({
    ...form,
    settings_json: {
      ...form.settings_json,
      [key]: value,
    },
  });
}

export function WorkspaceProfilePanel({
  providers,
  workspaceProfiles,
  workspaceProfile,
  workspaceProfileForm,
  editingWorkspaceProfileId,
  setWorkspaceProfileForm,
  selectWorkspaceProfile,
  startCreateWorkspaceProfile,
  startEditWorkspaceProfile,
  saveWorkspaceProfile,
  deleteWorkspaceProfile,
  formatDate,
  workspaceProfileEditorRef,
  workspaceProfileNotice,
}: WorkspaceProfilePanelProps) {
  const editingProfile = workspaceProfiles.find((profile) => profile.id === editingWorkspaceProfileId) ?? null;
  const providerScope = editingProfile?.profile_key ?? workspaceProfileForm.source_profile_key ?? workspaceProfile;
  const availableTextProviders = providers.filter((provider) => provider.provider_type === "text_llm" && provider.workspace_profile === providerScope);
  const availableVideoProviders = providers.filter((provider) => provider.provider_type === "video_llm" && provider.workspace_profile === providerScope);

  return (
    <section className="panel-page panel-page-management">
      <div className="project-management-cards">
        <article
          className={editingWorkspaceProfileId ? "card project-management-card project-management-card-active" : "card project-management-card"}
          ref={workspaceProfileEditorRef}
        >
          <div className="section-head">
            <div>
              <p>設定檔管理</p>
              <h3>工作設定檔</h3>
            </div>
            <div className="toolbar-actions">
              <button className="secondary-button" type="button" onClick={() => startCreateWorkspaceProfile(workspaceProfile)}>
                新增設定檔
              </button>
              <button className="primary-button" type="button" onClick={saveWorkspaceProfile} data-testid="workspace-profile-save-button">
                {editingWorkspaceProfileId ? "儲存設定檔" : "建立設定檔"}
              </button>
            </div>
          </div>

          {workspaceProfileNotice ? <div className="alert success compact-alert">{workspaceProfileNotice}</div> : null}

          <div className="project-management-form-grid">
            <label>
              <span>設定檔名稱</span>
              <input
                className="fixed-field"
                data-testid="workspace-profile-name-input"
                type="text"
                value={workspaceProfileForm.name}
                onChange={(event) => setWorkspaceProfileForm({ ...workspaceProfileForm, name: event.target.value })}
                placeholder="例如：Veo 測試設定檔"
              />
            </label>

            <label>
              <span>複製來源</span>
              <select
                className="project-select fixed-field"
                value={workspaceProfileForm.source_profile_key}
                onChange={(event) => setWorkspaceProfileForm({ ...workspaceProfileForm, source_profile_key: event.target.value })}
                disabled={Boolean(editingWorkspaceProfileId)}
              >
                {workspaceProfiles.map((profile) => (
                  <option key={profile.id} value={profile.profile_key}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="project-management-form-span">
              <span>設定檔說明</span>
              <textarea
                className="field-textarea"
                data-testid="workspace-profile-description-input"
                value={workspaceProfileForm.description}
                onChange={(event) => setWorkspaceProfileForm({ ...workspaceProfileForm, description: event.target.value })}
                placeholder="描述這組設定檔的用途、適用專案與操作策略。"
              />
            </label>
          </div>

          <div className="profile-settings-card">
            <div className="section-head section-head-compact">
              <div>
                <p>設定組合</p>
                <h4>這份工作設定檔會真的影響專案預設值</h4>
              </div>
            </div>

            <div className="profile-settings-grid">
              <label>
                <span>預設文字供應商</span>
                <select
                  className="project-select fixed-field"
                  value={workspaceProfileForm.settings_json.default_text_provider_id}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_text_provider_id", event.target.value)}
                >
                  <option value="">使用平台預設</option>
                  {availableTextProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>預設影片供應商</span>
                <select
                  className="project-select fixed-field"
                  value={workspaceProfileForm.settings_json.default_video_provider_id}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_video_provider_id", event.target.value)}
                >
                  <option value="">使用平台預設</option>
                  {availableVideoProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>預設語言</span>
                <select
                  className="project-select fixed-field"
                  value={workspaceProfileForm.settings_json.default_language}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_language", event.target.value as WorkspaceProfileSettings["default_language"])}
                >
                  <option value="zh-TW">繁體中文</option>
                </select>
              </label>

              <label>
                <span>預設受眾</span>
                <input
                  className="fixed-field"
                  type="text"
                  value={workspaceProfileForm.settings_json.default_target_audience}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_target_audience", event.target.value)}
                  placeholder="例如：企業內部同仁"
                />
              </label>

              <label>
                <span>影片總秒數</span>
                <input
                  className="fixed-field"
                  type="number"
                  min={1}
                  value={workspaceProfileForm.settings_json.default_total_duration_seconds}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_total_duration_seconds", Number(event.target.value) || 1)}
                />
              </label>

              <label>
                <span>每幕秒數</span>
                <input
                  className="fixed-field"
                  type="number"
                  min={1}
                  value={workspaceProfileForm.settings_json.default_scene_duration_seconds}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_scene_duration_seconds", Number(event.target.value) || 1)}
                />
              </label>

              <label>
                <span>預設解析度</span>
                <input
                  className="fixed-field"
                  type="text"
                  value={workspaceProfileForm.settings_json.default_resolution}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_resolution", event.target.value)}
                  placeholder="例如：1280x720"
                />
              </label>

              <label>
                <span>預設長寬比</span>
                <input
                  className="fixed-field"
                  type="text"
                  value={workspaceProfileForm.settings_json.default_aspect_ratio}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_aspect_ratio", event.target.value)}
                  placeholder="例如：16:9"
                />
              </label>

              <label>
                <span>字幕語言</span>
                <input
                  className="fixed-field"
                  type="text"
                  value={workspaceProfileForm.settings_json.default_subtitle_language}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_subtitle_language", event.target.value)}
                  placeholder="例如：繁體中文"
                />
              </label>

              <label>
                <span>預設字型</span>
                <input
                  className="fixed-field"
                  type="text"
                  value={workspaceProfileForm.settings_json.default_font_family}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_font_family", event.target.value)}
                  placeholder="例如：Noto Sans TC"
                />
              </label>

              <label>
                <span>預設風格素材 ID</span>
                <input
                  className="fixed-field"
                  type="text"
                  value={workspaceProfileForm.settings_json.default_render_style_asset_id}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_render_style_asset_id", event.target.value)}
                  placeholder="可留空，之後由素材管理補上。"
                />
              </label>

              <label>
                <span>素材儲存角色</span>
                <select
                  className="project-select fixed-field"
                  value={workspaceProfileForm.settings_json.default_asset_provider_role}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_asset_provider_role", event.target.value)}
                >
                  <option value="google-drive">Google Drive</option>
                  <option value="supabase-storage">Supabase Storage</option>
                  <option value="local-storage-v1">Local Storage</option>
                </select>
              </label>

              <label>
                <span>文件儲存角色</span>
                <select
                  className="project-select fixed-field"
                  value={workspaceProfileForm.settings_json.default_document_provider_role}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_document_provider_role", event.target.value)}
                >
                  <option value="supabase-storage">Supabase Storage</option>
                  <option value="google-drive">Google Drive</option>
                  <option value="local-storage-v1">Local Storage</option>
                </select>
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={workspaceProfileForm.settings_json.default_subtitle_enabled}
                  onChange={(event) => updateSettings(workspaceProfileForm, setWorkspaceProfileForm, "default_subtitle_enabled", event.target.checked)}
                />
                <span>預設開啟字幕</span>
              </label>
            </div>
          </div>
        </article>

        <article className="card project-management-card">
          <div className="section-head">
            <div>
              <p>設定檔清單</p>
              <h3>目前可用的工作設定檔</h3>
            </div>
            <span className="section-chip">{workspaceProfiles.length} 筆</span>
          </div>

          <div className="profile-inventory-grid" role="list" aria-label="工作設定檔列表">
            {workspaceProfiles.map((profile) => {
              const isCurrent = profile.profile_key === workspaceProfile;
              const isSystem = profile.is_system === 1;
              const settingsSummary = buildSettingsSummary(profile.settings_json, providers);
              return (
                <div key={profile.id} className={isCurrent ? "profile-inventory-row active" : "profile-inventory-row"} role="listitem">
                  <div className="profile-inventory-main">
                    <strong className="truncate-single">{profile.name}</strong>
                    <span className="truncate-double">{profile.description || "尚未填寫設定檔說明"}</span>
                    <div className="profile-settings-summary">
                      {settingsSummary.map((item) => (
                        <span key={item} className="truncate-single">
                          {item}
                        </span>
                      ))}
                    </div>
                    <small className="truncate-single">Key：{profile.profile_key} | 專案 {profile.project_count} 筆 | 供應商 {profile.provider_count} 筆</small>
                  </div>

                  <div className="profile-inventory-meta">
                    <strong>{isSystem ? "平台預設" : isCurrent ? "目前使用" : "自建設定"}</strong>
                    <small>{formatDate(profile.updated_at)}</small>
                  </div>

                  <div className="project-inventory-actions">
                    <button className="table-link-button" type="button" onClick={() => selectWorkspaceProfile(profile.profile_key)} disabled={isCurrent}>
                      {isCurrent ? "使用中" : "切換"}
                    </button>
                    <button
                      className="table-link-button"
                      type="button"
                      onClick={() => (isSystem ? startCreateWorkspaceProfile(profile.profile_key) : startEditWorkspaceProfile(profile))}
                    >
                      {isSystem ? "複製" : "編輯"}
                    </button>
                    {!isSystem ? (
                      <button className="table-link-button danger" type="button" onClick={() => deleteWorkspaceProfile(profile.id)}>
                        刪除
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
