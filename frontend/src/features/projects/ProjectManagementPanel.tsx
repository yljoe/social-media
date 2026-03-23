import { useMemo, useState } from "react";
import type { MutableRefObject } from "react";

import type { Project, WorkspaceProfile } from "../../shared/types/api";

type ProjectFormState = {
  name: string;
  description: string;
  workspace_profile: string;
};

type ProjectManagementPanelProps = {
  projects: Project[];
  workspaceProfiles: WorkspaceProfile[];
  workspaceProfile: string;
  selectedProjectId: string;
  projectForm: ProjectFormState;
  editingProjectId: string;
  setProjectForm: (value: ProjectFormState) => void;
  selectProject: (projectId: string) => void;
  startCreateProject: () => void;
  startEditProject: (project: Project) => void;
  createProject: () => void;
  updateProject: () => void;
  deleteProject: (projectId: string) => void;
  deleteSelectedProjects: (projectIds: string[]) => Promise<void>;
  openContentGeneration: () => void;
  formatDate: (value?: string) => string;
  projectEditorRef: MutableRefObject<HTMLElement | null>;
  projectNotice: string;
};

function decodeEscapedUnicode(value?: string | null) {
  if (!value) return "";
  if (!/\\[uU][0-9a-fA-F]{4}/.test(value)) return value;
  try {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return JSON.parse(`"${escaped}"`) as string;
  } catch {
    return value;
  }
}

function displayText(value: string | null | undefined, fallback: string) {
  const decoded = decodeEscapedUnicode(value);
  const cleaned = decoded.replace(/[\uFFFD]/g, "").trim();
  if (!cleaned || /^[?\s]+$/.test(cleaned)) return fallback;
  return cleaned;
}

function projectStatusLabel(status?: string | null) {
  const value = displayText(status, "狀態未知");
  if (value === "draft") return "草稿";
  if (value === "text_ready") return "內容已生成";
  if (value === "video_generated") return "影片已生成";
  if (value === "merged") return "已合併";
  return value;
}

export function ProjectManagementPanel({
  projects,
  workspaceProfiles,
  workspaceProfile,
  selectedProjectId,
  projectForm,
  editingProjectId,
  setProjectForm,
  selectProject,
  startCreateProject,
  startEditProject,
  createProject,
  updateProject,
  deleteProject,
  deleteSelectedProjects,
  openContentGeneration,
  formatDate,
  projectEditorRef,
  projectNotice,
}: ProjectManagementPanelProps) {
  const [projectQuery, setProjectQuery] = useState("");
  const [checkedProjectIds, setCheckedProjectIds] = useState<string[]>([]);
  const [showCheckedOnly, setShowCheckedOnly] = useState(false);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const activeProfile = workspaceProfiles.find((profile) => profile.profile_key === workspaceProfile) ?? null;
  const currentWorkspaceProjects = projects.filter((project) => project.workspace_profile === workspaceProfile);

  const filteredProjects = useMemo(() => {
    const keyword = projectQuery.trim().toLowerCase();
    if (!keyword) return currentWorkspaceProjects;
    return currentWorkspaceProjects.filter((project) => {
      const name = displayText(project.name, "未命名專案");
      const description = displayText(project.description, "尚未填寫專案說明");
      const status = projectStatusLabel(project.status);
      return `${name} ${description} ${status}`.toLowerCase().includes(keyword);
    });
  }, [currentWorkspaceProjects, projectQuery]);

  const checkedProjects = filteredProjects.filter((project) => checkedProjectIds.includes(project.id));
  const visibleProjects = showCheckedOnly ? checkedProjects : filteredProjects;

  function toggleCheckedProject(projectId: string) {
    setCheckedProjectIds((current) => (current.includes(projectId) ? current.filter((item) => item !== projectId) : [...current, projectId]));
  }

  async function handleDeleteSelectedProjects() {
    await deleteSelectedProjects(checkedProjectIds);
    setCheckedProjectIds([]);
    setShowCheckedOnly(false);
  }

  return (
    <section className="panel-page panel-page-management">
      <div className="project-management-cards">
        <article
          className={editingProjectId ? "card project-management-card project-management-card-active" : "card project-management-card"}
          ref={projectEditorRef}
        >
          <div className="section-head">
            <div>
              <p>專案建立 / 編輯</p>
              <h3>{editingProjectId ? "編輯專案" : "新增專案"}</h3>
            </div>
            <div className="toolbar-actions">
              <button className="secondary-button" type="button" onClick={startCreateProject}>
                清空表單
              </button>
              <button className="primary-button" type="button" onClick={editingProjectId ? updateProject : createProject} data-testid="project-save-button">
                {editingProjectId ? "儲存專案" : "建立專案"}
              </button>
            </div>
          </div>

          {projectNotice ? <div className="alert success compact-alert">{projectNotice}</div> : null}

          <div className="project-management-form-grid">
            <label>
              <span>專案名稱</span>
              <input
                className="fixed-field"
                data-testid="project-name-input"
                type="text"
                value={projectForm.name}
                onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
                placeholder="輸入專案名稱"
              />
            </label>

            <label>
              <span>專案工作設定檔</span>
              <select
                className="project-select fixed-field"
                value={projectForm.workspace_profile}
                onChange={(event) => setProjectForm({ ...projectForm, workspace_profile: event.target.value })}
              >
                {workspaceProfiles.map((profile) => (
                  <option key={profile.id} value={profile.profile_key}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="project-management-form-span">
              <span>專案描述</span>
              <textarea
                className="field-textarea"
                data-testid="project-description-input"
                value={projectForm.description}
                onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
                placeholder="描述這個專案的用途、情境與交付目標。"
              />
            </label>
          </div>
        </article>

        <article className="card project-management-card project-management-card-selected">
          <div className="section-head">
            <div>
              <p>目前選取</p>
              <h3>選定專案資訊</h3>
            </div>
            <div className="toolbar-actions">
              <button className="secondary-button" type="button" onClick={openContentGeneration} disabled={!selectedProject} data-testid="selected-project-open-content">
                前往內容生成
              </button>
              <button className="secondary-button" type="button" onClick={() => selectedProject && startEditProject(selectedProject)} disabled={!selectedProject} data-testid="selected-project-edit">
                編輯專案
              </button>
              <button className="danger-button" type="button" onClick={() => selectedProject && deleteProject(selectedProject.id)} disabled={!selectedProject}>
                刪除專案
              </button>
            </div>
          </div>

          {selectedProject ? (
            <div className="project-management-selected-grid">
              <div className="project-management-selected-copy">
                <strong className="truncate-single">{displayText(selectedProject.name, "未命名專案")}</strong>
                <p className="truncate-double">{displayText(selectedProject.description, "尚未填寫專案說明")}</p>
              </div>
              <dl className="project-management-selected-meta">
                <div>
                  <dt>狀態</dt>
                  <dd>{projectStatusLabel(selectedProject.status)}</dd>
                </div>
                <div>
                  <dt>工作設定檔</dt>
                  <dd>{workspaceProfiles.find((profile) => profile.profile_key === selectedProject.workspace_profile)?.name ?? selectedProject.workspace_profile}</dd>
                </div>
                <div>
                  <dt>建立時間</dt>
                  <dd>{formatDate(selectedProject.created_at)}</dd>
                </div>
                <div>
                  <dt>最後更新</dt>
                  <dd>{formatDate(selectedProject.updated_at)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="empty-state-card">
              <strong>尚未選擇專案</strong>
              <span>請先建立專案，或從下方的專案清單選一筆作為目前專案。</span>
            </div>
          )}
        </article>

        <article className="card project-management-card project-management-card-inventory">
          <div className="section-head">
            <div>
              <p>專案清單</p>
              <h3>{activeProfile?.name ?? workspaceProfile} 內的專案</h3>
            </div>
            <span className="section-chip">{visibleProjects.length} 筆</span>
          </div>

          <div className="project-inventory-toolbar">
            <label className="project-inventory-search">
              <span>專案搜尋</span>
              <input
                className="fixed-field"
                type="search"
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
                placeholder="輸入名稱、描述或狀態…"
              />
            </label>

            <div className="project-inventory-selection">
              <strong className="project-inventory-selection-count">已勾選 {checkedProjectIds.length} 筆</strong>
              <div className="project-inventory-selection-summary">
                <span>{showCheckedOnly ? "目前只顯示勾選項目，可逐筆檢視後再決定後續操作。" : "可先勾選再逐筆檢視，避免大量專案直接塞滿畫面。"}</span>
              </div>
            </div>

            <div className="project-inventory-bulk-actions">
              <button className="secondary-button" type="button" onClick={() => checkedProjectIds.length > 0 && setShowCheckedOnly(true)} disabled={checkedProjectIds.length === 0}>
                確認只看勾選
              </button>
              <button className="ghost-button" type="button" onClick={() => setShowCheckedOnly(false)} disabled={!showCheckedOnly}>
                顯示全部
              </button>
              <button className="danger-button" type="button" onClick={handleDeleteSelectedProjects} disabled={checkedProjectIds.length === 0}>
                刪除勾選項目
              </button>
            </div>
          </div>

          <div className="project-inventory-scroll" role="list" aria-label="專案列表">
            {visibleProjects.length > 0 ? (
              visibleProjects.map((project) => {
                const isActive = project.id === selectedProjectId;
                const isChecked = checkedProjectIds.includes(project.id);
                return (
                  <div key={project.id} className={isActive ? "project-inventory-row active" : "project-inventory-row"} role="listitem">
                    <label className="project-inventory-checkbox">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheckedProject(project.id)}
                        aria-label={`勾選 ${displayText(project.name, "未命名專案")}`}
                      />
                    </label>

                    <button className="project-inventory-main" type="button" onClick={() => selectProject(project.id)} aria-pressed={isActive}>
                      <span className="project-inventory-title truncate-single">{displayText(project.name, "未命名專案")}</span>
                      <span className="project-inventory-description truncate-double">{displayText(project.description, "尚未填寫專案說明")}</span>
                    </button>

                    <div className="project-inventory-meta">
                      <strong>{projectStatusLabel(project.status)}</strong>
                      <small>{formatDate(project.updated_at)}</small>
                    </div>

                    <div className="project-inventory-actions">
                      <button className="table-link-button" type="button" onClick={() => startEditProject(project)}>
                        編輯
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state-card">
                <strong>目前沒有符合條件的專案</strong>
                <span>請調整搜尋條件，或先建立新的專案。</span>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
