import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VideoCompositionPayload } from "../../shared/types/api";
import { VideoGenerationPanel } from "./VideoGenerationPanel";

const baseComposition: VideoCompositionPayload = {
  project_id: "project-1",
  workspace_profile: "shared",
  composition_version: "v2",
  global_settings: {
    duration_seconds: 24,
    scene_duration_seconds: 8,
    resolution: "1280x720",
    aspect_ratio: "16:9",
    subtitle_enabled: true,
    subtitle_language: "繁體中文",
    font_family: "Noto Sans TC",
    preferred_video_provider_id: "",
    preferred_video_model: "",
    custom_fields: {},
  },
  cast_library: [],
  scene_asset_pool: [],
  scenes: [
    {
      scene_id: "scene_001",
      sequence: 1,
      title: "第一幕",
      goal: "介紹情境",
      duration_seconds: 8,
      narration: "旁白內容",
      subtitle: "字幕內容",
      visual_prompt: "畫面提示",
      cast_refs: [],
      asset_refs: [],
      custom_fields: {},
      render_state: "draft",
      repair_state: {
        revision: 0,
        last_repair_reason: "",
        last_repair_at: null,
      },
    },
  ],
  custom_fields: {},
  composition_patch_requests: [],
};

const baseProps = {
  videoForm: {
    storyboard_text: '{"scenes":[]}',
    avatar_asset_id: "",
    voice_asset_id: "",
    style_asset_id: "",
    duration: 8,
    resolution: "1280x720",
    aspect_ratio: "16:9",
    subtitle_enabled: true,
    subtitle_language: "繁體中文",
    subtitle_font_family: "Noto Sans TC",
    subtitle_position: "bottom",
    subtitle_color: "#FFFFFF",
    subtitle_size: 28,
    speed: 1,
    execute_all: true,
    selected_scene_ids: [],
    apply_scene1_to_all: false,
  },
  setVideoForm: vi.fn(),
  videoComposition: baseComposition,
  updateVideoComposition: vi.fn(),
  videoCompositionText: JSON.stringify(baseComposition, null, 2),
  setVideoCompositionText: vi.fn(),
  activeSceneId: "scene_001",
  setActiveSceneId: vi.fn(),
  sceneRepairReason: "",
  setSceneRepairReason: vi.fn(),
  defaultVideoProvider: {
    id: "provider-video-1",
    provider_type: "video_llm" as const,
    workspace_profile: "shared",
    credential_scope: "workspace" as const,
    name: "Video Provider",
    base_url: "",
    api_key: "",
    model: "veo-3.1-generate-preview",
    region: "global",
    create_job_path: "",
    get_job_path: "",
    status: "active" as const,
    is_default: 1,
    config_json: {},
  },
  videoProviders: [],
  renderOutputs: [],
  assets: [],
  avatars: [],
  voices: [],
  toggleSceneSelection: vi.fn(),
  prepareVideo: vi.fn(),
  renderVideo: vi.fn(),
  repairVideoScene: vi.fn(),
  canRender: false,
  preparedSceneKeys: [],
  videoNotice: "",
  platformDefaultLabel: "平台預設",
};

describe("VideoGenerationPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("disables render until prepare is complete", () => {
    render(<VideoGenerationPanel {...baseProps} canRender={false} />);
    const renderButton = screen.getByTestId("video-render-submit");
    expect(renderButton).toBeDisabled();
    expect(screen.getByText("請先產生渲染請求，再送出影片渲染。")).toBeInTheDocument();
  });

  it("allows render after prepare", () => {
    const renderVideo = vi.fn();
    render(<VideoGenerationPanel {...baseProps} renderVideo={renderVideo} canRender preparedSceneKeys={["scene_001"]} />);
    fireEvent.click(screen.getByTestId("video-render-submit"));
    expect(renderVideo).toHaveBeenCalledTimes(1);
  });

  it("can trigger single-scene repair", () => {
    const repairVideoScene = vi.fn();
    render(<VideoGenerationPanel {...baseProps} repairVideoScene={repairVideoScene} />);
    fireEvent.click(screen.getByTestId("video-repair-submit"));
    expect(repairVideoScene).toHaveBeenCalledTimes(1);
  });
});
