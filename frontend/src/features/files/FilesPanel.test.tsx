import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilesPanel } from "./FilesPanel";

const fileItem = {
  relative_path: "text/storyboard.json",
  size: 512,
  modified_at: 1711000000,
};

const sceneItem = {
  id: "scene-1",
  scene_key: "scene_001",
  scene_title: "開場提醒",
};

function renderPanel() {
  const rerunScene = vi.fn();
  const mergeProject = vi.fn();
  const openProjectFile = vi.fn();
  const downloadProjectFile = vi.fn();
  const renameProjectFile = vi.fn();
  const deleteProjectFile = vi.fn();
  const saveProjectFileContent = vi.fn();
  const setFileInspector = vi.fn();

  render(
    <FilesPanel
      projectName="Test 1"
      projectScenes={[sceneItem]}
      files={[fileItem]}
      storageGroups={[{ key: "text", label: "文本與腳本", items: [fileItem] }]}
      rerunScene={rerunScene}
      mergeProject={mergeProject}
      bytes={(size) => `${size} B`}
      formatDate={() => "2026/03/22"}
      openProjectFile={openProjectFile}
      downloadProjectFile={downloadProjectFile}
      renameProjectFile={renameProjectFile}
      deleteProjectFile={deleteProjectFile}
      fileInspector={{
        relativePath: fileItem.relative_path,
        mimeType: "application/json",
        isText: true,
        content: '{"ok": true}',
        mode: "view",
        renameValue: fileItem.relative_path,
      }}
      setFileInspector={setFileInspector}
      saveProjectFileContent={saveProjectFileContent}
      fileOperationTarget=""
      fileOperationResult={null}
    />,
  );

  return {
    rerunScene,
    mergeProject,
    openProjectFile,
    downloadProjectFile,
    renameProjectFile,
    deleteProjectFile,
    saveProjectFileContent,
    setFileInspector,
  };
}

describe("FilesPanel actions", () => {
  afterEach(() => {
    cleanup();
  });

  it("routes scene and file row buttons to handlers", () => {
    const actions = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "重做此幕" }));
    fireEvent.click(screen.getAllByRole("button", { name: "檢視" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "編輯" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "下載" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.click(screen.getAllByRole("button", { name: "刪除" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "合併專案" }));

    expect(actions.rerunScene).toHaveBeenCalledWith("scene_001");
    expect(actions.openProjectFile).toHaveBeenNthCalledWith(1, "text/storyboard.json", "view");
    expect(actions.openProjectFile).toHaveBeenNthCalledWith(2, "text/storyboard.json", "edit");
    expect(actions.downloadProjectFile).toHaveBeenCalledWith("text/storyboard.json");
    expect(actions.renameProjectFile).toHaveBeenCalledWith("text/storyboard.json");
    expect(actions.deleteProjectFile).toHaveBeenCalledWith("text/storyboard.json");
    expect(actions.mergeProject).toHaveBeenCalledTimes(1);
  });

  it("supports inspector actions for text files", () => {
    const actions = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "切換為編輯" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存名稱" }));
    fireEvent.click(screen.getByRole("button", { name: "下載到本機" }));
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));

    expect(actions.setFileInspector).toHaveBeenCalled();
    expect(actions.renameProjectFile).toHaveBeenCalledWith("text/storyboard.json", "text/storyboard.json");
    expect(actions.downloadProjectFile).toHaveBeenCalledWith("text/storyboard.json");
    expect(actions.setFileInspector).toHaveBeenCalledWith(null);
  });
});
