export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  workspace_profile: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceProfile = {
  id: string;
  profile_key: string;
  name: string;
  description: string;
  source_profile_key: string | null;
  settings_json: WorkspaceProfileSettings;
  status: "active" | "archived";
  is_system: number;
  project_count: number;
  provider_count: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceProfileSettings = {
  default_language: "zh-TW";
  default_target_audience: string;
  default_text_provider_id: string;
  default_video_provider_id: string;
  default_total_duration_seconds: number;
  default_scene_duration_seconds: number;
  default_resolution: string;
  default_aspect_ratio: string;
  default_subtitle_enabled: boolean;
  default_subtitle_language: string;
  default_font_family: string;
  default_render_style_asset_id: string;
  default_asset_provider_role: string;
  default_document_provider_role: string;
};

export type BudgetLimit = {
  currency: string;
  max_total_cost: number;
};

export type VideoGenerationProfile = {
  preferred_vendor: string;
  preferred_model: string;
  duration_seconds: number;
  aspect_ratio: string;
  resolution: string;
  frame_rate: number;
  audio_enabled: boolean;
  subtitle_enabled: boolean;
  allowed_vendors: string[];
};

export type TaskInput = {
  task_id: string;
  topic: string;
  scenario: string;
  target_audience: string;
  language: "zh-TW";
  video_style: "comic";
  avatar_id: string;
  voice_id: string;
  run_mode: "full" | "single_scene";
  scene_id: string | null;
  budget_limit: BudgetLimit;
};

export type StoryboardScene = {
  scene_id: string;
  sequence: number;
  duration_seconds: number;
  goal: string;
  visual_prompt: string;
  onscreen_text: string[];
  narration: string;
  subtitle: string;
  camera: string;
  transition: string;
  asset_refs: string[];
  safety_notes: string[];
  vendor_overrides: Record<string, unknown>;
  llm_usage: Record<string, unknown>;
};

export type StoryboardPayload = {
  video_id: string;
  task_id: string;
  title: string;
  total_duration: number;
  style: "comic";
  avatar_id: string;
  voice_id: string;
  language: "zh-TW";
  video_profile: VideoGenerationProfile;
  vendor_targets: Record<string, Record<string, unknown>>;
  scenes: StoryboardScene[];
};

export type VideoCompositionGlobalSettings = {
  duration_seconds: number;
  scene_duration_seconds: number;
  resolution: string;
  aspect_ratio: string;
  subtitle_enabled: boolean;
  subtitle_language: string;
  font_family: string;
  preferred_video_provider_id: string;
  preferred_video_model: string;
  custom_fields: Record<string, unknown>;
};

export type VideoCompositionCast = {
  cast_id: string;
  name: string;
  avatar_asset_id: string;
  voice_asset_id: string;
  role: string;
  notes: string;
  custom_fields: Record<string, unknown>;
};

export type VideoCompositionAssetBinding = {
  asset_binding_id: string;
  asset_id: string;
  label: string;
  asset_type: string;
  placement_hint: string;
  notes: string;
  source: string;
  custom_fields: Record<string, unknown>;
};

export type VideoCompositionRepairState = {
  revision: number;
  last_repair_reason: string;
  last_repair_at: string | null;
};

export type VideoCompositionScene = {
  scene_id: string;
  sequence: number;
  title: string;
  goal: string;
  duration_seconds: number;
  narration: string;
  subtitle: string;
  visual_prompt: string;
  cast_refs: string[];
  asset_refs: string[];
  custom_fields: Record<string, unknown>;
  render_state: "draft" | "ready" | "queued" | "rendering" | "done" | "failed";
  repair_state: VideoCompositionRepairState;
};

export type VideoCompositionPatchRequest = {
  patch_id: string;
  scene_id: string;
  mode: "single_scene_repair";
  reason: string;
  fields_changed: string[];
  status: "queued" | "completed" | "failed";
  created_at: string;
};

export type VideoCompositionPayload = {
  project_id: string;
  workspace_profile: string;
  composition_version: string;
  global_settings: VideoCompositionGlobalSettings;
  cast_library: VideoCompositionCast[];
  scene_asset_pool: VideoCompositionAssetBinding[];
  scenes: VideoCompositionScene[];
  custom_fields: Record<string, unknown>;
  composition_patch_requests: VideoCompositionPatchRequest[];
};

export type VideoVendorDefinition = {
  vendor: string;
  label: string;
  auth_mode: string;
  default_model: string;
  default_base_url: string;
  default_create_job_path: string;
  default_get_job_path: string;
  notes: string;
};

export type EmailPayload = {
  email_id: string;
  task_id: string;
  subject: string;
  preview_text: string;
  body_text: string;
  cta_text: string;
  html_body: string;
  link_placeholder: string;
  language: "zh-TW";
  llm_usage: Record<string, unknown>;
};

export type QuizItem = {
  question_id: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

export type QuizPayload = {
  quiz_id: string;
  task_id: string;
  language: "zh-TW";
  items: QuizItem[];
};

export type MetadataPayload = {
  task_id: string;
  project_id: string;
  workspace_profile: string;
  generation_status: string;
  validated_at: string;
  validator_version: string;
};

export type CostSummaryPayload = {
  task_id: string;
  currency: string;
  text_generation_cost: number;
  scene_generation_cost: number;
  tts_cost: number;
  subtitle_cost: number;
  merge_cost: number;
  grand_total: number;
  budget_limit: number;
  within_budget: boolean;
};

export type CostLedgerItem = {
  id: string;
  project_id: string;
  category: string;
  item_ref_id: string;
  amount: number;
  detail_json: Record<string, unknown>;
  created_at: string;
};

export type CostProjectOverview = {
  project_id: string;
  project_name: string;
  subtotal: number;
  items: CostLedgerItem[];
};

export type CostDetail = {
  project_id: string;
  subtotal: number;
  bom: {
    text_generation: number;
    scene_generation: number;
    scene_rerun: number;
    merge: number;
  };
  items: CostLedgerItem[];
  filters: {
    date_from: string | null;
    date_to: string | null;
  };
};

export type Provider = {
  id: string;
  provider_type: "text_llm" | "video_llm" | "storage";
  workspace_profile: string;
  credential_scope: "system" | "workspace";
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  region: string;
  create_job_path: string;
  get_job_path: string;
  status: "active" | "inactive";
  is_default: number;
  config_json: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ProviderConnectionTestResult = {
  ok: boolean;
  provider_type: "text_llm" | "video_llm" | "storage";
  provider_name: string;
  mode: string;
  detail: string;
  endpoint?: string;
  status_code?: number | null;
  latency_ms?: number | null;
};

export type StoragePolicy = {
  id: string;
  workspace_profile: string;
  policy_scope: "system" | "workspace";
  data_provider_id: string;
  asset_provider_id: string;
  video_provider_id: string;
  fallback_provider_id: string;
  policy_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type StoragePolicyResponse = {
  policy: StoragePolicy;
  data_provider: Provider;
  asset_provider: Provider;
  video_provider: Provider;
  fallback_provider: Provider;
};

export type Asset = {
  id: string;
  asset_type: "mail_template" | "storyboard_template" | "avatar" | "reference_image" | "voice" | "style_preset";
  name: string;
  content: string;
  file_path: string;
  status: "active" | "inactive";
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FileItem = {
  relative_path: string;
  size: number;
  modified_at?: number;
};

export type ProjectFileContent = {
  relative_path: string;
  size: number;
  modified_at?: number;
  mime_type: string;
  is_text: boolean;
  content: string | null;
};
