import type {
  StoryboardPayload,
  StoryboardScene,
  VideoCompositionAssetBinding,
  VideoCompositionCast,
  VideoCompositionPayload,
  VideoCompositionScene,
  WorkspaceProfileSettings,
} from "../../shared/types/api";

export function defaultWorkspaceVideoSettings(): WorkspaceProfileSettings {
  return {
    default_language: "zh-TW",
    default_target_audience: "企業內部受訓同仁",
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
  };
}

export function normalizeWorkspaceVideoSettings(settings?: Partial<WorkspaceProfileSettings> | null): WorkspaceProfileSettings {
  const defaults = defaultWorkspaceVideoSettings();
  return {
    default_language: "zh-TW",
    default_target_audience: String(settings?.default_target_audience ?? defaults.default_target_audience).trim() || defaults.default_target_audience,
    default_text_provider_id: String(settings?.default_text_provider_id ?? defaults.default_text_provider_id).trim(),
    default_video_provider_id: String(settings?.default_video_provider_id ?? defaults.default_video_provider_id).trim(),
    default_total_duration_seconds: Math.max(1, Number(settings?.default_total_duration_seconds ?? defaults.default_total_duration_seconds) || defaults.default_total_duration_seconds),
    default_scene_duration_seconds: Math.max(1, Number(settings?.default_scene_duration_seconds ?? defaults.default_scene_duration_seconds) || defaults.default_scene_duration_seconds),
    default_resolution: String(settings?.default_resolution ?? defaults.default_resolution).trim() || defaults.default_resolution,
    default_aspect_ratio: String(settings?.default_aspect_ratio ?? defaults.default_aspect_ratio).trim() || defaults.default_aspect_ratio,
    default_subtitle_enabled: Boolean(settings?.default_subtitle_enabled ?? defaults.default_subtitle_enabled),
    default_subtitle_language: String(settings?.default_subtitle_language ?? defaults.default_subtitle_language).trim() || defaults.default_subtitle_language,
    default_font_family: String(settings?.default_font_family ?? defaults.default_font_family).trim() || defaults.default_font_family,
    default_render_style_asset_id: String(settings?.default_render_style_asset_id ?? defaults.default_render_style_asset_id).trim(),
    default_asset_provider_role: String(settings?.default_asset_provider_role ?? defaults.default_asset_provider_role).trim() || defaults.default_asset_provider_role,
    default_document_provider_role: String(settings?.default_document_provider_role ?? defaults.default_document_provider_role).trim() || defaults.default_document_provider_role,
  };
}

function normalizeStoryboardPayload(value: string): StoryboardPayload | null {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return {
        video_id: "",
        task_id: "",
        title: "Storyboard",
        total_duration: parsed.length * 8,
        style: "comic",
        avatar_id: "",
        voice_id: "",
        language: "zh-TW",
        video_profile: {
          preferred_vendor: "auto",
          preferred_model: "",
          duration_seconds: parsed.length * 8,
          aspect_ratio: "16:9",
          resolution: "1280x720",
          frame_rate: 24,
          audio_enabled: true,
          subtitle_enabled: true,
          allowed_vendors: ["openai_sora", "google_veo", "seedance", "runway"],
        },
        vendor_targets: {},
        scenes: parsed as StoryboardScene[],
      };
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.scenes)) {
      return parsed as StoryboardPayload;
    }
  } catch {
    return null;
  }
  return null;
}

export function createEmptyComposition(projectId: string, workspaceProfile: string, settings?: Partial<WorkspaceProfileSettings> | null): VideoCompositionPayload {
  const resolved = normalizeWorkspaceVideoSettings(settings);
  return {
    project_id: projectId,
    workspace_profile: workspaceProfile,
    composition_version: "v2",
    global_settings: {
      duration_seconds: resolved.default_total_duration_seconds,
      scene_duration_seconds: resolved.default_scene_duration_seconds,
      resolution: resolved.default_resolution,
      aspect_ratio: resolved.default_aspect_ratio,
      subtitle_enabled: resolved.default_subtitle_enabled,
      subtitle_language: resolved.default_subtitle_language,
      font_family: resolved.default_font_family,
      preferred_video_provider_id: resolved.default_video_provider_id,
      preferred_video_model: "",
      custom_fields: {},
    },
    cast_library: [],
    scene_asset_pool: [],
    scenes: [],
    custom_fields: {},
    composition_patch_requests: [],
  };
}

export function buildCompositionFromStoryboard(
  storyboardText: string,
  projectId: string,
  workspaceProfile: string,
  settings?: Partial<WorkspaceProfileSettings> | null,
): VideoCompositionPayload {
  const payload = normalizeStoryboardPayload(storyboardText);
  const composition = createEmptyComposition(projectId, workspaceProfile, settings);
  if (!payload) return composition;

  composition.global_settings.duration_seconds = payload.total_duration || composition.global_settings.duration_seconds;
  composition.global_settings.scene_duration_seconds = payload.video_profile?.duration_seconds
    ? Math.max(1, Math.round(payload.video_profile.duration_seconds / Math.max(1, payload.scenes.length)))
    : composition.global_settings.scene_duration_seconds;
  composition.global_settings.resolution = payload.video_profile?.resolution || composition.global_settings.resolution;
  composition.global_settings.aspect_ratio = payload.video_profile?.aspect_ratio || composition.global_settings.aspect_ratio;
  composition.global_settings.subtitle_enabled = payload.video_profile?.subtitle_enabled ?? composition.global_settings.subtitle_enabled;
  composition.global_settings.preferred_video_model = payload.video_profile?.preferred_model || "";

  composition.scenes = payload.scenes.map((scene, index): VideoCompositionScene => ({
    scene_id: scene.scene_id || `scene_${String(index + 1).padStart(3, "0")}`,
    sequence: scene.sequence || index + 1,
    title: scene.goal || scene.scene_id || `場景 ${index + 1}`,
    goal: scene.goal || scene.scene_id || `場景 ${index + 1}`,
    duration_seconds: scene.duration_seconds || composition.global_settings.scene_duration_seconds,
    narration: scene.narration || "",
    subtitle: scene.subtitle || scene.narration || "",
    visual_prompt: scene.visual_prompt || "",
    cast_refs: [],
    asset_refs: scene.asset_refs || [],
    custom_fields: {},
    render_state: "draft",
    repair_state: {
      revision: 0,
      last_repair_reason: "",
      last_repair_at: null,
    },
  }));

  return composition;
}

export function parseCompositionText(
  text: string,
  fallbackStoryboardText: string,
  projectId: string,
  workspaceProfile: string,
  settings?: Partial<WorkspaceProfileSettings> | null,
): VideoCompositionPayload {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as VideoCompositionPayload).scenes)) {
      const base = createEmptyComposition(projectId, workspaceProfile, settings);
      return {
        ...base,
        ...(parsed as VideoCompositionPayload),
        global_settings: {
          ...base.global_settings,
          ...((parsed as VideoCompositionPayload).global_settings ?? {}),
          custom_fields: ((parsed as VideoCompositionPayload).global_settings?.custom_fields ?? {}) as Record<string, unknown>,
        },
        cast_library: Array.isArray((parsed as VideoCompositionPayload).cast_library) ? (parsed as VideoCompositionPayload).cast_library : [],
        scene_asset_pool: Array.isArray((parsed as VideoCompositionPayload).scene_asset_pool) ? (parsed as VideoCompositionPayload).scene_asset_pool : [],
        scenes: Array.isArray((parsed as VideoCompositionPayload).scenes) ? (parsed as VideoCompositionPayload).scenes : [],
        custom_fields: ((parsed as VideoCompositionPayload).custom_fields ?? {}) as Record<string, unknown>,
        composition_patch_requests: Array.isArray((parsed as VideoCompositionPayload).composition_patch_requests)
          ? (parsed as VideoCompositionPayload).composition_patch_requests
          : [],
      };
    }
  } catch {
    return buildCompositionFromStoryboard(fallbackStoryboardText, projectId, workspaceProfile, settings);
  }
  return buildCompositionFromStoryboard(fallbackStoryboardText, projectId, workspaceProfile, settings);
}

export function prettyComposition(composition: VideoCompositionPayload) {
  return JSON.stringify(composition, null, 2);
}

export function addCastMember(castLibrary: VideoCompositionCast[]): VideoCompositionCast[] {
  const nextIndex = castLibrary.length + 1;
  return [
    ...castLibrary,
    {
      cast_id: `cast-${nextIndex}`,
      name: `角色 ${nextIndex}`,
      avatar_asset_id: "",
      voice_asset_id: "",
      role: "main",
      notes: "",
      custom_fields: {},
    },
  ];
}

export function addSceneAssetBinding(bindings: VideoCompositionAssetBinding[]): VideoCompositionAssetBinding[] {
  const nextIndex = bindings.length + 1;
  return [
    ...bindings,
    {
      asset_binding_id: `binding-${nextIndex}`,
      asset_id: "",
      label: `素材 ${nextIndex}`,
      asset_type: "reference_image",
      placement_hint: "inline",
      notes: "",
      source: "",
      custom_fields: {},
    },
  ];
}

export function setSceneRepairQueued(composition: VideoCompositionPayload, sceneId: string, reason: string): VideoCompositionPayload {
  return {
    ...composition,
    scenes: composition.scenes.map((scene) =>
      scene.scene_id === sceneId
        ? {
            ...scene,
            render_state: "queued" as const,
            repair_state: {
              revision: (scene.repair_state?.revision ?? 0) + 1,
              last_repair_reason: reason,
              last_repair_at: new Date().toISOString(),
            },
          }
        : scene,
    ),
  };
}
