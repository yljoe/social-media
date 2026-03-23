import type { Dispatch, SetStateAction } from "react";

import type { FileItem } from "../../shared/types/api";

type StorageGroup = {
  key: string;
  label: string;
  items: FileItem[];
};

type SceneItem = {
  id: string;
  scene_key: string;
  scene_title: string;
};

type FileInspectorState = {
  relativePath: string;
  mimeType: string;
  isText: boolean;
  content: string;
  mode: "view" | "edit";
  renameValue: string;
} | null;

type FilesPanelProps = {
  projectName: string;
  projectScenes: SceneItem[];
  files: FileItem[];
  storageGroups: StorageGroup[];
  rerunScene: (sceneKey: string) => void;
  mergeProject: () => void;
  bytes: (size: number) => string;
  formatDate: (value?: string) => string;
  openProjectFile: (relativePath: string, mode?: "view" | "edit") => void;
  downloadProjectFile: (relativePath: string) => void;
  renameProjectFile: (relativePath: string, nextRelativePath?: string) => void;
  deleteProjectFile: (relativePath: string) => void;
  fileInspector: FileInspectorState;
  setFileInspector: Dispatch<SetStateAction<FileInspectorState>>;
  saveProjectFileContent: () => void;
  fileOperationTarget: string;
  fileOperationResult: {
    relativePath: string;
    tone: "success" | "error";
    message: string;
  } | null;
};

function formatFileDate(modifiedAt: number | undefined, formatDate: (value?: string) => string) {
  if (!modifiedAt) return "未更新";
  return formatDate(new Date(modifiedAt * 1000).toISOString());
}

export function FilesPanel({
  projectName,
  projectScenes,
  files,
  storageGroups,
  rerunScene,
  mergeProject,
  bytes,
  formatDate,
  openProjectFile,
  downloadProjectFile,
  renameProjectFile,
  deleteProjectFile,
  fileInspector,
  setFileInspector,
  saveProjectFileContent,
  fileOperationTarget,
  fileOperationResult,
}: FilesPanelProps) {
  return (
    <section className="panel-page panel-page-management">
      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>Scene 輸出管理</p>
            <h3>分鏡與合併流程</h3>
          </div>
          <span className="section-chip">{projectScenes.length} 幕</span>
        </div>
        <div className="management-toolbar">
          <div className="management-toolbar-copy">
            <strong>集中檢查每一幕的執行情況，必要時可逐幕重做，再進行專案合併。</strong>
            <span>目前專案：{projectName}。若影片渲染內容需要局部修正，先在這裡重做場景，再重新合併最終輸出。</span>
          </div>
          <button className="primary-button" onClick={mergeProject} type="button">
            合併專案
          </button>
        </div>
        <div className="table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>場景</th>
                <th>標題</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {projectScenes.map((scene) => (
                <tr key={scene.id}>
                  <td>
                    <div className="table-primary-cell">
                      <strong>{scene.scene_key}</strong>
                      <span>Scene Key</span>
                    </div>
                  </td>
                  <td>{scene.scene_title}</td>
                  <td>
                    <span className="status-badge status-badge-active">可重做</span>
                  </td>
                  <td>
                    <button className="ghost-button" onClick={() => rerunScene(scene.scene_key)} type="button">
                      重做此幕
                    </button>
                  </td>
                </tr>
              ))}
              {projectScenes.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">目前還沒有可管理的分鏡輸出。請先完成內容生成與影片準備。</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card management-card">
        <div className="section-head">
          <div>
            <p>Storage Tree</p>
            <h3>專案檔案管理</h3>
          </div>
          <span className="section-chip">{files.length} 筆檔案</span>
        </div>

        <div className="storage-group-list">
          {storageGroups.map((group) => (
            <section key={group.key} className="storage-group">
              <div className="storage-group-head">
                <strong>{group.label}</strong>
                <span>{group.items.length} 筆</span>
              </div>
              <div className="table-panel">
                <table className="data-table data-table-compact">
                  <thead>
                    <tr>
                      <th>檔案路徑</th>
                      <th>最後更新</th>
                      <th>大小</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((file) => {
                      const isBusy = fileOperationTarget === file.relative_path;
                      const inlineResult =
                        fileOperationResult?.relativePath === file.relative_path ? fileOperationResult : null;
                      return (
                        <tr key={file.relative_path}>
                          <td>
                            <div className="table-primary-cell">
                              <strong className="table-file-path">{file.relative_path}</strong>
                              {inlineResult ? (
                                <span
                                  className={
                                    inlineResult.tone === "success"
                                      ? "table-status-inline table-status-inline-success"
                                      : "table-status-inline table-status-inline-error"
                                  }
                                >
                                  {inlineResult.message}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>{formatFileDate(file.modified_at, formatDate)}</td>
                          <td>{bytes(file.size)}</td>
                          <td>
                            <div className="file-action-row">
                              <button className="table-link-button" type="button" disabled={isBusy} onClick={() => openProjectFile(file.relative_path, "view")}>
                                檢視
                              </button>
                              <button className="table-link-button" type="button" disabled={isBusy} onClick={() => openProjectFile(file.relative_path, "edit")}>
                                編輯
                              </button>
                              <button className="table-link-button" type="button" disabled={isBusy} onClick={() => downloadProjectFile(file.relative_path)}>
                                下載
                              </button>
                              <button className="table-link-button" type="button" disabled={isBusy} onClick={() => renameProjectFile(file.relative_path)}>
                                重新命名
                              </button>
                              <button className="table-link-button danger" type="button" disabled={isBusy} onClick={() => deleteProjectFile(file.relative_path)}>
                                刪除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {storageGroups.length === 0 ? <div className="empty-state">目前沒有可管理的專案檔案。</div> : null}
        </div>
      </article>

      {fileInspector ? (
        <article className="card management-card management-card-wide file-inspector-card">
          <div className="section-head">
            <div>
              <p>檔案檢視器</p>
              <h3>{fileInspector.relativePath}</h3>
            </div>
            <div className="toolbar-actions">
              {fileInspector.isText ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setFileInspector((current) =>
                      current
                        ? {
                            ...current,
                            mode: current.mode === "view" ? "edit" : "view",
                          }
                        : current,
                    )
                  }
                >
                  {fileInspector.mode === "view" ? "切換為編輯" : "回到預覽"}
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={() => downloadProjectFile(fileInspector.relativePath)}>
                下載到本機
              </button>
              <button className="ghost-button" type="button" onClick={() => renameProjectFile(fileInspector.relativePath, fileInspector.renameValue)}>
                儲存名稱
              </button>
              {fileInspector.mode === "edit" && fileInspector.isText ? (
                <button className="primary-button" type="button" onClick={saveProjectFileContent} disabled={fileOperationTarget === fileInspector.relativePath}>
                  儲存內容
                </button>
              ) : null}
              <button className="danger-button" type="button" onClick={() => deleteProjectFile(fileInspector.relativePath)}>
                刪除檔案
              </button>
              <button className="ghost-button" type="button" onClick={() => setFileInspector(null)}>
                關閉
              </button>
            </div>
          </div>

          <div className="file-inspector-meta">
            <label>
              <span>檔案路徑</span>
              <input
                className="fixed-field"
                value={fileInspector.renameValue}
                onChange={(event) =>
                  setFileInspector((current) => (current ? { ...current, renameValue: event.target.value } : current))
                }
              />
            </label>
            <div className="file-inspector-summary">
              <strong>{fileInspector.mimeType}</strong>
              <span>{fileInspector.isText ? "可預覽 / 可編輯文字檔" : "二進位檔案，僅提供下載與重新命名"}</span>
            </div>
          </div>

          {fileInspector.isText ? (
            fileInspector.mode === "edit" ? (
              <textarea
                className="json-panel file-editor"
                value={fileInspector.content}
                onChange={(event) =>
                  setFileInspector((current) => (current ? { ...current, content: event.target.value } : current))
                }
              />
            ) : (
              <pre className="json-panel">{fileInspector.content}</pre>
            )
          ) : (
            <div className="empty-state">
              這個檔案不是純文字格式。你可以下載到本機檢查，或重新命名、刪除此檔案。
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
