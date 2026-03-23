from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class ApiResponse(BaseModel):
    success: bool = True
    message: str = "ok"
    data: Any | None = None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    workspace_profile: str = "shared"


class ProjectUpdate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    workspace_profile: str = "shared"


class WorkspaceProfileSettings(BaseModel):
    default_language: Literal["zh-TW"] = "zh-TW"
    default_target_audience: str = "企業內部同仁"
    default_text_provider_id: str = ""
    default_video_provider_id: str = ""
    default_total_duration_seconds: int = 24
    default_scene_duration_seconds: int = 8
    default_resolution: str = "1280x720"
    default_aspect_ratio: str = "16:9"
    default_subtitle_enabled: bool = True
    default_subtitle_language: str = "繁體中文"
    default_font_family: str = "Noto Sans TC"
    default_render_style_asset_id: str = ""
    default_asset_provider_role: str = "google-drive"
    default_document_provider_role: str = "supabase-storage"


class WorkspaceProfileCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    source_profile_key: str = "shared"
    settings_json: WorkspaceProfileSettings = Field(default_factory=WorkspaceProfileSettings)


class WorkspaceProfileUpdate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    settings_json: WorkspaceProfileSettings = Field(default_factory=WorkspaceProfileSettings)


class BudgetLimit(BaseModel):
    currency: str = "USD"
    max_total_cost: float = 10.0


class VideoGenerationProfile(BaseModel):
    preferred_vendor: str = "auto"
    preferred_model: str = ""
    duration_seconds: int = 24
    aspect_ratio: str = "16:9"
    resolution: str = "1280x720"
    frame_rate: int = 24
    audio_enabled: bool = True
    subtitle_enabled: bool = True
    allowed_vendors: list[str] = Field(default_factory=lambda: ["openai_sora", "google_veo", "seedance", "runway"])


class TaskInput(BaseModel):
    task_id: str
    topic: str
    scenario: str = ""
    target_audience: str = "企業內部同仁"
    language: Literal["zh-TW"] = "zh-TW"
    video_style: Literal["comic"] = "comic"
    avatar_id: str = "platform-default-avatar"
    voice_id: str = "platform-default-voice"
    run_mode: Literal["full", "single_scene"] = "full"
    scene_id: str | None = None
    budget_limit: BudgetLimit = Field(default_factory=BudgetLimit)

    @model_validator(mode="after")
    def validate_scene_mode(self) -> "TaskInput":
        if self.run_mode == "single_scene" and not self.scene_id:
            raise ValueError("single_scene 模式必須提供 scene_id")
        return self


class TextGenerate(BaseModel):
    input_mode: Literal["topic", "article"] = "topic"
    topic: str = ""
    raw_text: str = ""
    scenario: str = ""
    target_audience: str = "企業內部同仁"
    language: Literal["zh-TW"] = "zh-TW"
    video_style: Literal["comic"] = "comic"
    avatar_id: str = "platform-default-avatar"
    voice_id: str = "platform-default-voice"
    run_mode: Literal["full", "single_scene"] = "full"
    scene_id: str | None = None
    budget_limit: BudgetLimit = Field(default_factory=BudgetLimit)
    total_duration_seconds: int = 24
    scene_duration_seconds: int = 8
    scene_count: int = 0
    text_provider_id: str | None = None
    text_model: str | None = None
    mail_template_id: str | None = None
    storyboard_template_id: str | None = None
    generate_storyboard: bool = True
    generate_mail: bool = True
    generate_quiz: bool = True

    @model_validator(mode="after")
    def validate_scene_mode(self) -> "TextGenerate":
        if self.run_mode == "single_scene" and not self.scene_id:
            raise ValueError("single_scene 模式必須提供 scene_id")
        return self


class StoryboardScenePayload(BaseModel):
    scene_id: str
    sequence: int
    duration_seconds: int
    goal: str
    visual_prompt: str
    onscreen_text: list[str] = Field(default_factory=list)
    narration: str
    subtitle: str
    camera: str = "medium-shot"
    transition: str = "cut"
    asset_refs: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    vendor_overrides: dict[str, Any] = Field(default_factory=dict)
    llm_usage: dict[str, Any] = Field(default_factory=dict)


class StoryboardPayload(BaseModel):
    video_id: str
    task_id: str
    title: str
    total_duration: int
    style: Literal["comic"] = "comic"
    avatar_id: str
    voice_id: str
    language: Literal["zh-TW"] = "zh-TW"
    video_profile: VideoGenerationProfile = Field(default_factory=VideoGenerationProfile)
    vendor_targets: dict[str, dict[str, Any]] = Field(default_factory=dict)
    scenes: list[StoryboardScenePayload] = Field(default_factory=list)


class EmailPayload(BaseModel):
    email_id: str
    task_id: str
    subject: str
    preview_text: str
    body_text: str
    cta_text: str
    html_body: str
    link_placeholder: str = "{{TRAINING_LINK}}"
    language: Literal["zh-TW"] = "zh-TW"
    llm_usage: dict[str, Any] = Field(default_factory=dict)


class QuizItem(BaseModel):
    question_id: str
    question: str
    options: list[str] = Field(default_factory=list)
    answer: str
    explanation: str


class QuizPayload(BaseModel):
    quiz_id: str
    task_id: str
    language: Literal["zh-TW"] = "zh-TW"
    items: list[QuizItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_count(self) -> "QuizPayload":
        if len(self.items) != 10:
            raise ValueError("Quiz 題數必須為 10 題")
        return self


class MetadataPayload(BaseModel):
    task_id: str
    project_id: str
    workspace_profile: str
    generation_status: str
    validated_at: str
    validator_version: str = "schema-v1"


class CostSummaryPayload(BaseModel):
    task_id: str
    currency: str = "USD"
    text_generation_cost: float = 0.0
    scene_generation_cost: float = 0.0
    tts_cost: float = 0.0
    subtitle_cost: float = 0.0
    merge_cost: float = 0.0
    grand_total: float = 0.0
    budget_limit: float = 0.0
    within_budget: bool = True

    @model_validator(mode="after")
    def validate_non_negative(self) -> "CostSummaryPayload":
        costs = [
            self.text_generation_cost,
            self.scene_generation_cost,
            self.tts_cost,
            self.subtitle_cost,
            self.merge_cost,
            self.grand_total,
            self.budget_limit,
        ]
        if any(value < 0 for value in costs):
            raise ValueError("成本欄位不得為負數")
        return self


class VideoPrepare(BaseModel):
    storyboard_text: str
    composition_json_text: str = ""
    avatar_asset_id: str | None = None
    voice_asset_id: str | None = None
    style_asset_id: str | None = None
    duration: int = 8
    resolution: str = "1280x720"
    aspect_ratio: str = "16:9"
    subtitle_enabled: bool = True
    subtitle_language: str = "繁體中文"
    subtitle_font_family: str = "Noto Sans TC"
    subtitle_position: str = "bottom"
    subtitle_color: str = "#FFFFFF"
    subtitle_size: int = 28
    speed: float = 1.0
    execute_all: bool = True
    selected_scene_ids: list[str] = Field(default_factory=list)
    apply_scene1_to_all: bool = False


class VideoCompositionGlobalSettings(BaseModel):
    duration_seconds: int = 24
    scene_duration_seconds: int = 8
    resolution: str = "1280x720"
    aspect_ratio: str = "16:9"
    subtitle_enabled: bool = True
    subtitle_language: str = "繁體中文"
    font_family: str = "Noto Sans TC"
    preferred_video_provider_id: str = ""
    preferred_video_model: str = ""
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class VideoCompositionCast(BaseModel):
    cast_id: str
    name: str
    avatar_asset_id: str = ""
    voice_asset_id: str = ""
    role: str = "main"
    notes: str = ""
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class VideoCompositionAssetBinding(BaseModel):
    asset_binding_id: str
    asset_id: str = ""
    label: str
    asset_type: str = "reference_image"
    placement_hint: str = "inline"
    notes: str = ""
    source: str = ""
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class VideoCompositionRepairState(BaseModel):
    revision: int = 0
    last_repair_reason: str = ""
    last_repair_at: str | None = None


class VideoCompositionScene(BaseModel):
    scene_id: str
    sequence: int
    title: str
    goal: str
    duration_seconds: int = 8
    narration: str = ""
    subtitle: str = ""
    visual_prompt: str = ""
    cast_refs: list[str] = Field(default_factory=list)
    asset_refs: list[str] = Field(default_factory=list)
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    render_state: Literal["draft", "ready", "queued", "rendering", "done", "failed"] = "draft"
    repair_state: VideoCompositionRepairState = Field(default_factory=VideoCompositionRepairState)


class VideoCompositionPatchRequest(BaseModel):
    patch_id: str
    scene_id: str
    mode: Literal["single_scene_repair"] = "single_scene_repair"
    reason: str = ""
    fields_changed: list[str] = Field(default_factory=list)
    status: Literal["queued", "completed", "failed"] = "queued"
    created_at: str


class VideoCompositionPayload(BaseModel):
    project_id: str = ""
    workspace_profile: str = "shared"
    composition_version: str = "v2"
    global_settings: VideoCompositionGlobalSettings = Field(default_factory=VideoCompositionGlobalSettings)
    cast_library: list[VideoCompositionCast] = Field(default_factory=list)
    scene_asset_pool: list[VideoCompositionAssetBinding] = Field(default_factory=list)
    scenes: list[VideoCompositionScene] = Field(default_factory=list)
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    composition_patch_requests: list[VideoCompositionPatchRequest] = Field(default_factory=list)


class VideoRender(BaseModel):
    provider_id: str | None = None
    render_request: dict[str, Any]


class VideoSceneRepair(BaseModel):
    provider_id: str | None = None
    composition_json_text: str
    scene_id: str
    reason: str = ""


class MergePayload(BaseModel):
    scene_ids: list[str] = Field(default_factory=list)


class SceneBatchRerunPayload(BaseModel):
    scene_ids: list[str] = Field(default_factory=list)


class StorageRebindPayload(BaseModel):
    provider_id: str
    move_existing_files: bool = True


class StoragePolicySelectPayload(BaseModel):
    provider_id: str


class FilePathPayload(BaseModel):
    relative_path: str = Field(min_length=1)


class FileRenamePayload(BaseModel):
    relative_path: str = Field(min_length=1)
    new_relative_path: str = Field(min_length=1)


class FileUpdatePayload(BaseModel):
    relative_path: str = Field(min_length=1)
    content: str = ""


class ProviderPayload(BaseModel):
    provider_type: Literal["text_llm", "video_llm", "storage"]
    name: str
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    region: str = "global"
    create_job_path: str = ""
    get_job_path: str = ""
    status: Literal["active", "inactive"] = "active"
    is_default: bool = False
    config_json: dict[str, Any] = Field(default_factory=dict)


class AssetPayload(BaseModel):
    asset_type: Literal["mail_template", "storyboard_template", "avatar", "reference_image", "voice", "style_preset"]
    name: str
    content: str = ""
    file_path: str = ""
    status: Literal["active", "inactive"] = "active"
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class AssetImportUrlPayload(BaseModel):
    asset_type: Literal["mail_template", "storyboard_template", "avatar", "reference_image", "voice", "style_preset"]
    source_url: str = Field(min_length=1)
    name: str = ""
    status: Literal["active", "inactive"] = "active"
    metadata_json: dict[str, Any] = Field(default_factory=dict)
