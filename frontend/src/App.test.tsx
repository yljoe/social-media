import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

function ok<T>(data: T) {
  return Promise.resolve({
    ok: true,
    json: async () => ({ success: true, message: "ok", data }),
  });
}

const storageProvider = {
  id: "provider-storage-1",
  provider_type: "storage" as const,
  workspace_profile: "system",
  credential_scope: "system" as const,
  name: "Local Storage",
  base_url: "",
  api_key: "",
  model: "local-storage-v1",
  region: "local",
  create_job_path: "",
  get_job_path: "",
  status: "active" as const,
  is_default: 1,
  config_json: {},
};

const textProvider = {
  id: "provider-text-1",
  provider_type: "text_llm" as const,
  workspace_profile: "shared",
  credential_scope: "workspace" as const,
  name: "Text Provider",
  base_url: "https://example.com/text",
  api_key: "token",
  model: "gpt-4.1-mini",
  region: "global",
  create_job_path: "",
  get_job_path: "",
  status: "active" as const,
  is_default: 1,
  config_json: {},
};

const videoProvider = {
  id: "provider-video-1",
  provider_type: "video_llm" as const,
  workspace_profile: "shared",
  credential_scope: "workspace" as const,
  name: "Video Provider",
  base_url: "https://example.com/video",
  api_key: "token",
  model: "mock-video-v1",
  region: "global",
  create_job_path: "/jobs",
  get_job_path: "/jobs/{id}",
  status: "active" as const,
  is_default: 1,
  config_json: {},
};

const project = {
  id: "project-1",
  name: "Alpha Project",
  description: "Project description",
  workspace_profile: "shared",
  status: "draft",
  created_at: "2026-03-19T00:00:00Z",
  updated_at: "2026-03-19T00:00:00Z",
};

const workspaceProfiles = [
  {
    id: "profile-shared",
    profile_key: "shared",
    name: "shared",
    description: "平台預設工作設定檔",
    source_profile_key: null,
    status: "active" as const,
    is_system: 1,
    project_count: 1,
    provider_count: 2,
    settings_json: {
      default_language: "zh-TW" as const,
      default_target_audience: "企業內部同仁",
      default_text_provider_id: "",
      default_video_provider_id: "",
      default_total_duration_seconds: 24,
      default_scene_duration_seconds: 8,
      default_resolution: "1280x720",
      default_aspect_ratio: "16:9",
      default_subtitle_enabled: true,
      default_subtitle_language: "繁體中文",
      default_font_family: "Noto Sans TC",
      default_render_style_asset_id: "",
      default_asset_provider_role: "google-drive",
      default_document_provider_role: "supabase-storage",
    },
    created_at: "2026-03-19T00:00:00Z",
    updated_at: "2026-03-19T00:00:00Z",
  },
];

const createdProjectName = "新建專案";
const costOverview = [
  {
    project_id: "project-1",
    project_name: "Alpha Project",
    subtotal: 0,
    items: [],
  },
];

const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";

  if (url.endsWith("/api/projects") && method === "GET") return ok([project]);
  if (url.endsWith("/api/workspace-profiles") && method === "GET") return ok(workspaceProfiles);

  if (url.endsWith("/api/projects") && method === "POST") {
    const payload = JSON.parse(String(init?.body ?? "{}"));
    return ok({
      ...project,
      id: "project-created-1",
      name: payload.name,
      description: payload.description,
      workspace_profile: payload.workspace_profile ?? "shared",
    });
  }

  if (url.endsWith("/api/workspace-profiles") && method === "POST") {
    const payload = JSON.parse(String(init?.body ?? "{}"));
    return ok({
      ...workspaceProfiles[0],
      id: "profile-new",
      profile_key: "shared-copy",
      name: payload.name,
      description: payload.description,
      source_profile_key: payload.source_profile_key ?? "shared",
      is_system: 0,
      project_count: 0,
      provider_count: 2,
    });
  }

  if (url.endsWith("/api/providers") && method === "GET") return ok([storageProvider, textProvider, videoProvider]);

  if (url.endsWith("/api/providers/video-vendors") && method === "GET") {
    return ok([
      {
        vendor: "generic_rest",
        label: "Generic REST Video",
        auth_mode: "bearer",
        default_model: "generic-video-v1",
        default_base_url: "",
        default_create_job_path: "",
        default_get_job_path: "/jobs/{job_id}",
        notes: "提供 create / poll 的通用 REST 影片供應商。",
      },
      {
        vendor: "google_veo",
        label: "Google Veo",
        auth_mode: "api_key_query",
        default_model: "veo-3.1-generate-preview",
        default_base_url: "https://generativelanguage.googleapis.com/v1beta",
        default_create_job_path: "/models/veo-3.1-generate-preview:predictLongRunning",
        default_get_job_path: "/{job_id}",
        notes: "使用 Gemini API / Veo 的影片供應商。",
      },
    ]);
  }

  if (url.endsWith("/api/assets") && method === "GET") return ok([]);
  if (url.endsWith("/api/costs") && method === "GET") return ok(costOverview);

  if (url.endsWith("/api/storage-policy") && method === "GET") {
    return ok({
      policy: {
        id: "policy-1",
        workspace_profile: "shared",
        policy_scope: "system" as const,
        data_provider_id: storageProvider.id,
        asset_provider_id: storageProvider.id,
        video_provider_id: storageProvider.id,
        fallback_provider_id: storageProvider.id,
        policy_json: { resolved: {} },
        created_at: "2026-03-19T00:00:00Z",
        updated_at: "2026-03-19T00:00:00Z",
      },
      data_provider: storageProvider,
      asset_provider: storageProvider,
      video_provider: storageProvider,
      fallback_provider: storageProvider,
    });
  }

  if (url.endsWith("/api/projects/project-1") && method === "GET") {
    return ok({
      project,
      scenes: [],
      latest_text_job: null,
      latest_merge: null,
      latest_final_video: null,
      latest_video_composition: null,
      storage_binding: { provider_id: storageProvider.id },
      storage_provider: storageProvider,
      storage_policy: { id: "policy-1" },
    });
  }

  if (url.endsWith("/api/projects/project-created-1") && method === "GET") {
    return ok({
      project: {
        ...project,
        id: "project-created-1",
        name: createdProjectName,
        description: "Project description",
        workspace_profile: "shared",
      },
      scenes: [],
      latest_text_job: null,
      latest_merge: null,
      latest_final_video: null,
      latest_video_composition: null,
      storage_binding: { provider_id: storageProvider.id },
      storage_provider: storageProvider,
      storage_policy: { id: "policy-1" },
    });
  }

  if (url.endsWith("/api/projects/project-1/files") && method === "GET") return ok([]);
  if (url.endsWith("/api/projects/project-created-1/files") && method === "GET") return ok([]);

  if (url.endsWith("/api/costs/project-1") && method === "GET") {
    return ok({
      project_id: "project-1",
      subtotal: 0,
      bom: {},
      items: [],
      filters: { date_from: null, date_to: null },
    });
  }

  if (url.endsWith("/api/costs/project-created-1") && method === "GET") {
    return ok({
      project_id: "project-created-1",
      subtotal: 0,
      bom: {
        text_generation: 0,
        scene_generation: 0,
        scene_rerun: 0,
        merge: 0,
      },
      items: [],
      filters: { date_from: null, date_to: null },
    });
  }

  if (url.endsWith("/api/projects/project-1/text-generate") && method === "POST") {
    return ok({
      project_id: "project-1",
      job_id: "text-job-1",
      task_input: {
        task_id: "project-1",
        topic: "員工資安意識提升與帳號保護",
        scenario: "Scenario",
        target_audience: "企業內部教育訓練",
        language: "zh-TW",
        video_style: "comic",
        avatar_id: "avatar-default",
        voice_id: "voice-default",
        run_mode: "full",
        scene_id: null,
        budget_limit: { currency: "USD", max_total_cost: 10 },
      },
      storyboard: {
        video_id: "video-project-1",
        task_id: "project-1",
        title: "員工資安意識提升與帳號保護",
        total_duration: 30,
        style: "comic",
        avatar_id: "avatar-default",
        voice_id: "voice-default",
        language: "zh-TW",
        video_profile: {
          preferred_vendor: "auto",
          preferred_model: "",
          duration_seconds: 30,
          aspect_ratio: "16:9",
          resolution: "1280x720",
          frame_rate: 24,
          audio_enabled: true,
          subtitle_enabled: true,
          allowed_vendors: ["openai_sora", "google_veo", "seedance", "runway"],
        },
        vendor_targets: {},
        scenes: [
          {
            scene_id: "scene_001",
            sequence: 1,
            duration_seconds: 6,
            goal: "開場說明",
            visual_prompt: "prompt 1",
            onscreen_text: ["開場說明"],
            narration: "narration 1",
            subtitle: "subtitle 1",
            camera: "medium-shot",
            transition: "cut",
            asset_refs: [],
            safety_notes: [],
            vendor_overrides: {},
            llm_usage: {},
          },
        ],
      },
      email_payload: {
        email_id: "email-project-1",
        task_id: "project-1",
        subject: "資安提醒通知",
        preview_text: "請完成本週訓練",
        body_text: "這是一封測試郵件內容",
        cta_text: "開始測驗",
        html_body: "<p>這是一封測試郵件內容</p>",
        link_placeholder: "{{TRAINING_LINK}}",
        language: "zh-TW",
        llm_usage: {},
      },
      quiz: {
        quiz_id: "quiz-project-1",
        task_id: "project-1",
        language: "zh-TW",
        items: [
          {
            question_id: "q1",
            question: "問題 1",
            options: ["A", "B", "C", "D"],
            answer: "B",
            explanation: "這是說明",
          },
        ],
      },
      metadata: {
        task_id: "project-1",
        project_id: "project-1",
        workspace_profile: "shared",
        generation_status: "draft_ready",
        validated_at: "2026-03-19T00:00:00Z",
        validator_version: "schema-v1",
      },
      cost_summary: {
        task_id: "project-1",
        currency: "USD",
        text_generation_cost: 0.0001,
        scene_generation_cost: 0,
        tts_cost: 0,
        subtitle_cost: 0,
        merge_cost: 0,
        grand_total: 0.0001,
        budget_limit: 10,
        within_budget: true,
      },
      cost: { estimated_cost: 0.0001 },
    });
  }

  throw new Error(`Unhandled fetch URL: ${method} ${url}`);
});

function getFetchCall(method: string, path: string) {
  return fetchMock.mock.calls.find(([input, init]) => String(input).endsWith(path) && (init?.method ?? "GET") === method);
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    fetchMock.mockClear();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("renders the shell with project management as the default page", async () => {
    render(<App />);

    expect((await screen.findAllByText("Alpha Project")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "專案管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前往內容生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編輯專案" })).toBeInTheDocument();
    expect(screen.getByLabelText("工作設定檔")).toBeInTheDocument();
  });

  it("creates a project from the project management page", async () => {
    render(<App />);

    await screen.findAllByText("Alpha Project");
    fireEvent.click(screen.getByRole("button", { name: "清空表單" }));
    fireEvent.change(screen.getByLabelText("專案名稱"), { target: { value: createdProjectName } });
    fireEvent.click(screen.getByRole("button", { name: "建立專案" }));

    await waitFor(() => {
      const call = getFetchCall("POST", "/api/projects");
      expect(call).toBeTruthy();
      expect(String(call?.[1]?.body)).toContain(createdProjectName);
      expect(String(call?.[1]?.body)).toContain("\"workspace_profile\":\"shared\"");
    });
  });

  it("creates a workspace profile from the workspace profile panel", async () => {
    render(<App />);

    await screen.findAllByText("Alpha Project");
    fireEvent.click(screen.getByTestId("sidebar-manage-workspace-profiles"));
    fireEvent.change(screen.getByTestId("workspace-profile-name-input"), { target: { value: "測試設定檔" } });
    fireEvent.click(screen.getByTestId("workspace-profile-save-button"));

    await waitFor(() => {
      const call = getFetchCall("POST", "/api/workspace-profiles");
      expect(call).toBeTruthy();
      expect(String(call?.[1]?.body)).toContain("測試設定檔");
    });
  });

  it("submits task input and keeps storyboard payload editable for video generation", async () => {
    render(<App />);

    await screen.findAllByText("Alpha Project");
    fireEvent.click(screen.getByRole("button", { name: "前往內容生成" }));

    fireEvent.change(screen.getByLabelText(/影片總時長/), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText(/每段秒數/), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByLabelText(/分鏡段數/), {
      target: { value: "5" },
    });

    fireEvent.click(screen.getByRole("button", { name: "產生草稿" }));

    await waitFor(() => {
      const call = getFetchCall("POST", "/api/projects/project-1/text-generate");
      expect(call).toBeTruthy();
      expect(String(call?.[1]?.body)).toContain("\"total_duration_seconds\":30");
      expect(String(call?.[1]?.body)).toContain("\"scene_duration_seconds\":6");
      expect(String(call?.[1]?.body)).toContain("\"scene_count\":5");
      expect(String(call?.[1]?.body)).toContain("\"language\":\"zh-TW\"");
    });

    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByDisplayValue(/scene_001/)).toBeInTheDocument();
  });

  it("switches to provider management without breaking the shell", async () => {
    render(<App />);

    await screen.findAllByText("Alpha Project");
    fireEvent.click(screen.getByTestId("tab-providers"));
    expect(screen.getAllByRole("heading", { name: "供應商管理" }).length).toBeGreaterThan(0);
  });
});
