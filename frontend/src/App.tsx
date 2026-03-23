import { useEffect, useRef, useState } from "react";
import "./App.css";
import { AssetsPanel } from "./features/assets/AssetsPanel";
import { CostsPanel } from "./features/costs/CostsPanel";
import { FilesPanel } from "./features/files/FilesPanel";
import { AccessGuidePanel } from "./features/guide/AccessGuidePanel";
import { GuidePanel } from "./features/guide/GuidePanel";
import { ProjectManagementPanel } from "./features/projects/ProjectManagementPanel";
import { ProjectTextPanel } from "./features/projects/ProjectTextPanel";
import { WorkspaceProfilePanel } from "./features/projects/WorkspaceProfilePanel";
import { ProvidersPanel } from "./features/providers/ProvidersPanel";
import { VideoGenerationPanel } from "./features/video-generation/VideoGenerationPanel";
import {
  buildCompositionFromStoryboard,
  createEmptyComposition,
  normalizeWorkspaceVideoSettings,
  parseCompositionText,
  prettyComposition,
  setSceneRepairQueued,
} from "./features/video-generation/videoComposition";
import { API_BASE_URL, api } from "./shared/api/client";
import type {
  Asset,
  CostDetail,
  CostProjectOverview,
  CostSummaryPayload,
  EmailPayload,
  FileItem,
  ProjectFileContent,
  Project,
  Provider,
  ProviderConnectionTestResult,
  QuizPayload,
  StoragePolicyResponse,
  StoryboardPayload,
  StoryboardScene,
  TaskInput,
  VideoCompositionPayload,
  VideoVendorDefinition,
  WorkspaceProfile,
  WorkspaceProfileSettings,
} from "./shared/types/api";

type Tab = "profiles" | "projects" | "file" | "video" | "files" | "providers" | "assets" | "costs" | "access" | "guide";

const WORKSPACE_PROFILE_STORAGE_KEY = "social-engineering-platform.workspace-profile";
const ACTIVE_TAB_STORAGE_KEY = "social-engineering-platform.active-tab";

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

type AssetFormState = {
  asset_type: "mail_template" | "storyboard_template" | "avatar" | "reference_image" | "voice" | "style_preset";
  name: string;
  content: string;
  file_path: string;
  status: "active" | "inactive";
  metadata_json: Record<string, unknown>;
};

type TabDefinition = {
  key: Tab;
  label: string;
  shortLabel: string;
  badge: string;
  type: "generation" | "management" | "logs" | "guide";
  description: string;
  icon: string;
};

type FileInspectorState = {
  relativePath: string;
  mimeType: string;
  isText: boolean;
  content: string;
  mode: "view" | "edit";
  renameValue: string;
};

type FileOperationResult = {
  relativePath: string;
  tone: "success" | "error";
  message: string;
};

const copy = {
  title: "社交工程內容生成平台",
  compactTitle: "社工平台",
  subtitle: "企業情報控制台",
  currentProject: "目前專案",
  chooseProject: "請選擇專案",
  defaultTextProvider: "使用預設供應商",
  defaultMailTemplate: "使用預設模板",
  platformDefault: "使用平台預設",
  noProject: "尚未選擇專案",
  createProjectDone: "專案已建立。",
  textDone: "內容草稿已生成。",
  prepareDone: "已產生 render_request.json。",
  renderDone: "影片任務已送出。",
  mergeDone: "專案已完成合併。",
  selectProjectFirst: "請先建立或選擇專案。",
  selectProject: "請先選擇專案。",
  prepareFirst: "請先完成影片準備。",
  confirmDeleteProvider: "確定要刪除這個供應商嗎？",
  confirmDeleteAsset: "確定要刪除這個素材嗎？",
  providerCreated: "供應商已新增。",
  providerUpdated: "供應商已更新。",
  providerDeleted: "供應商已刪除。",
  assetCreated: "素材已新增。",
  assetUpdated: "素材已更新。",
  assetDeleted: "素材已刪除。",
  apiFailed: "API 請求失敗",
};

const tabs: TabDefinition[] = [
  {
    key: "profiles",
    label: "工作設定檔",
    shortLabel: "設定檔",
    badge: "管理",
    type: "management",
    description: "集中維護工作設定檔，定義文字與影片供應商、字幕、字型、解析度與儲存角色等預設值。",
    icon: "◫",
  },
  {
    key: "projects",
    label: "專案管理",
    shortLabel: "專案",
    badge: "管理",
    type: "management",
    description: "集中管理專案建立、編輯、刪除、選取與綁定設定檔，讓專案操作保持單一職責。",
    icon: "▦",
  },
  {
    key: "file",
    label: "內容生成",
    shortLabel: "生成",
    badge: "生成",
    type: "generation",
    description: "輸入任務條件、生成並確認分鏡腳本、郵件與測驗，完成內容定稿後再送往影片生成。",
    icon: "✶",
  },
  {
    key: "video",
    label: "影片生成",
    shortLabel: "影片",
    badge: "生成",
    type: "generation",
    description: "管理分鏡、角色、聲音與字幕，準備並送出影片渲染。",
    icon: "▶",
  },
  {
    key: "files",
    label: "檔案管理",
    shortLabel: "檔案",
    badge: "管理",
    type: "management",
    description: "查看分鏡產物、專案檔案樹與最終影片合併狀態。",
    icon: "▣",
  },
  {
    key: "providers",
    label: "供應商管理",
    shortLabel: "供應商",
    badge: "管理",
    type: "management",
    description: "集中管理文字、影片與儲存供應商，套用資料寫入策略。",
    icon: "◎",
  },
  {
    key: "assets",
    label: "素材管理",
    shortLabel: "素材",
    badge: "管理",
    type: "management",
    description: "維護模板、頭像、聲音與風格資產，保持內容生成一致性。",
    icon: "◇",
  },
  {
    key: "costs",
    label: "費用與紀錄",
    shortLabel: "費用",
    badge: "紀錄",
    type: "logs",
    description: "查看專案成本、成本明細與執行結果資料。",
    icon: "¥",
  },
  {
    key: "access",
    label: "API 接入說明",
    shortLabel: "接入",
    badge: "說明",
    type: "guide",
    description: "整理文字模型、影片供應商與 Google Workspace 的憑證取得方式與欄位填寫規則。",
    icon: "⇄",
  },
  {
    key: "guide",
    label: "操作指南",
    shortLabel: "指南",
    badge: "指南",
    type: "guide",
    description: "整理平台工作流程、模組用途、限制與交付前注意事項。",
    icon: "？",
  },
];

const guideSteps = [
  {
    title: "先維護工作設定檔",
    detail: "先到「工作設定檔」建立或調整策略模板。設定檔現在會保存文字供應商、影片供應商、解析度、長寬比、字幕、字型與儲存角色等預設值。",
  },
  {
    title: "再到專案管理綁定設定檔",
    detail: "到「專案管理」建立或編輯專案，指定這個專案要使用哪一個工作設定檔。工作設定檔是模板，專案是實際內容容器，兩者已拆成不同面板。",
  },
  {
    title: "到內容生成確認草稿",
    detail: "在「內容生成」設定任務條件、影片總時長、每段秒數與輸出範圍，產生分鏡腳本、郵件與測驗草稿。",
  },
  {
    title: "檢查 JSON 與分鏡定稿",
    detail: "草稿生成後可直接在 JSON 區編修內容。這份分鏡 JSON 會變成影片規劃器的正式輸入，不確定的內容請在送影片生成前修完。",
  },
  {
    title: "到影片生成配置角色、素材與單幕修正",
    detail: "在「影片生成」可維護多角色、多聲音、素材引用池，並讓每幕綁自己的角色與素材。必要時可只修正一條切片，不用整支重跑。",
  },
  {
    title: "準備 render request 後再送渲染",
    detail: "影片生成頁會先準備 render request，再送整批或單幕渲染。請先確認供應商、素材與 JSON，再按送出影片渲染。",
  },
  {
    title: "回檔案管理與費用紀錄收尾",
    detail: "在「檔案管理」查看輸出檔案與重做流程，在「費用與紀錄」查看目前專案、最近 5 個專案成本與 Ledger JSON。",
  },
  {
    title: "供應商與素材分開維護",
    detail: "模型金鑰與 storage 在「供應商管理」維護；模板、頭像、參考圖片、聲音與風格在「素材管理」依分類管理，可從本機或 URL 匯入。",
  },
];

const guideCapabilities = [
  "已可用：專案 CRUD、工作設定檔 CRUD、內容生成、分鏡 JSON 編修、影片準備、檔案管理、供應商測試、素材分類管理、成本總覽",
  "影片供應商：已提供 OpenAI Sora、Google Veo、SeedDance、Runway 的 adapter 骨架與連線測試模式",
  "影片規劃器：支援多角色、多聲音、素材引用池、每幕綁定素材、單幕修正與 JSON 保留編修",
  "素材管理：可依模板、頭像、參考圖片、聲音、風格分類，並支援本機上傳與網址匯入",
  "費用與紀錄：可看目前專案成本、最近 5 個專案成本，並在總覽 JSON / 專案 JSON 間切換",
  "系統設定：SQL 仍保留在伺服器設定，不開放由 UI 直接修改",
];

const guideFaq = [
  {
    title: "右上角的操作說明做什麼？",
    detail: "會直接切到這個操作指南頁，方便同事在任何模組快速回來看流程與限制。",
  },
  {
    title: "分鏡 JSON 什麼時候要改？",
    detail: "建議在內容生成後、送影片生成前完成確認。一般同事可優先用畫面上的表單與場景編輯器，進階使用者再改 JSON。",
  },
  {
    title: "工作設定檔是做什麼的？",
    detail: "工作設定檔是一組可重複使用的執行策略。它會影響專案預設用哪個文字供應商、影片供應商、影片規格、字幕、字型與儲存角色，現在已獨立成單獨面板管理。",
  },
  {
    title: "為什麼 Google Workspace 不放在共用 .env？",
    detail: "因為多人情境下應該由每位使用者各自綁定自己的憑證，不應要求全員去改共用伺服器設定。",
  },
  {
    title: "檔案與素材有什麼差別？",
    detail: "素材是可重複被專案引用的模板或媒體；檔案管理看的則是單一專案執行後產生的輸出與工作檔。",
  },
];

const textProviderGuides = [
  {
    title: "OpenAI 文本 LLM",
    summary: "到 OpenAI Platform 建立 Secret API key，之後在供應商管理新增文字模型供應商即可。",
    fields: [
      "名稱：可填 OpenAI Production 或團隊自己的識別名稱",
      "模型：常用 gpt-4.1-mini 或 gpt-4.1",
      "基礎網址：填 https://api.openai.com/v1",
      "API 金鑰 / Token：貼上 sk- 開頭的 Secret API key",
      "建立任務路徑 / 查詢任務路徑：文字模型通常留空即可",
    ],
    docs: [
      { label: "OpenAI API Key 文件", href: "https://help.openai.com/en/articles/4936850-how-to-create-and-use-an-api-key" },
      { label: "OpenAI API 文件", href: "https://platform.openai.com/docs/api-reference/authentication" },
    ],
  },
];

const videoProviderGuides = [
  {
    provider: "Google Veo",
    auth: "認證方式：Gemini API key；先在 Google AI Studio / Gemini API paid tier 取得。",
    models: ["veo-3.1-generate-preview", "veo-3.1-fast-generate-preview"],
    fields: [
      { label: "影片供應商", value: "Google Veo" },
      { label: "基礎網址", value: "https://generativelanguage.googleapis.com/v1beta" },
      { label: "建立任務路徑", value: "/models/{model}:predictLongRunning" },
      { label: "查詢任務路徑", value: "/{job_id}" },
      { label: "區域", value: "global" },
    ],
    notes: [
      "模型名改了，建立任務路徑也要一起改成同一個模型名稱。",
      "這家是長任務 operation 模式，平台會再輪詢 job 狀態。",
    ],
    docs: [
      { label: "Google Veo 文件", href: "https://ai.google.dev/gemini-api/docs/video" },
      { label: "Gemini API Pricing", href: "https://ai.google.dev/gemini-api/docs/pricing" },
    ],
  },
  {
    provider: "OpenAI Sora",
    auth: "認證方式：Bearer API key；先在 OpenAI Platform 開通影片能力與 billing。",
    models: ["sora-2"],
    fields: [
      { label: "影片供應商", value: "OpenAI Sora" },
      { label: "基礎網址", value: "https://api.openai.com/v1" },
      { label: "建立任務路徑", value: "/videos" },
      { label: "查詢任務路徑", value: "/videos/{job_id}" },
      { label: "區域", value: "global" },
    ],
    notes: [
      "如果只換 model，不需要改基礎網址；但建立與查詢路徑仍應維持 Sora 規格。",
      "平台目前用統一 job adapter 包一層，結果會再對應到相同的 render 流程。",
    ],
    docs: [
      { label: "OpenAI Video Generation", href: "https://platform.openai.com/docs/guides/video-generation" },
      { label: "OpenAI Authentication", href: "https://platform.openai.com/docs/api-reference/authentication" },
    ],
  },
  {
    provider: "SeedDance",
    auth: "認證方式：Bearer Token；需在火山引擎 / 方舟相關控制台取得服務權限與 Token。",
    models: ["doubao-seedance-1-5-pro-251215"],
    fields: [
      { label: "影片供應商", value: "SeedDance" },
      { label: "基礎網址", value: "https://operator.las.cn-beijing.volces.com" },
      { label: "建立任務路徑", value: "/api/v1/contents/generations/tasks" },
      { label: "查詢任務路徑", value: "/api/v1/contents/generations/tasks/{job_id}" },
      { label: "區域", value: "cn-beijing" },
    ],
    notes: [
      "這家比較接近標準 create / poll 任務 API，路徑通常固定，主要變的是 model 與 Token。",
      "如果地區不同，基礎網址可能會跟著變更。",
    ],
    docs: [
      { label: "SeedDance 文件", href: "https://www.volcengine.com/docs/6492/2165104?lang=zh" },
      { label: "火山引擎開發者文件", href: "https://www.volcengine.com/docs" },
    ],
  },
  {
    provider: "Runway",
    auth: "認證方式：Bearer API key；需在 Runway API 後台建立 key，並保留版本標頭。",
    models: ["gen4_turbo"],
    fields: [
      { label: "影片供應商", value: "Runway" },
      { label: "基礎網址", value: "https://api.dev.runwayml.com/v1" },
      { label: "建立任務路徑", value: "/image_to_video" },
      { label: "查詢任務路徑", value: "/tasks/{job_id}" },
      { label: "區域", value: "global" },
    ],
    notes: [
      "Runway 還需要版本標頭；平台 adapter 會自動帶預設版本。",
      "不同 Runway 工作流可能不是同一路徑，若官方文件更新，優先以官方 API reference 為準。",
    ],
    docs: [
      { label: "Runway API 文件", href: "https://docs.dev.runwayml.com/" },
      { label: "Runway API Reference", href: "https://docs.dev.runwayml.com/api/" },
    ],
  },
];

const workspaceGuide = {
  title: "Google Workspace 通常不是單一 API key，而是 OAuth 或 service account。",
  checklist: [
    "如果要操作個人 Drive、Gmail、Calendar，多半要先在 Google Cloud 建專案、啟用 API，再建立 OAuth client。",
    "如果是公司內部自動化，常見做法是 service account，再由 Workspace 管理員設定 domain-wide delegation。",
    "只有少數公開資料情境才適合單純 API key；不要把所有 Google 需求都當成 API key。",
    "多人使用時不要共用 .env 改來改去，應該由每位使用者各自綁定自己的 Google Workspace 憑證。",
  ],
  docs: [
    { label: "建立 Google Workspace 憑證", href: "https://developers.google.com/workspace/guides/create-credentials" },
    { label: "Google Workspace 開發總覽", href: "https://developers.google.com/workspace" },
  ],
};

const defaultProviderForm = (): ProviderFormState => ({
  provider_type: "video_llm",
  name: "",
  base_url: "",
  api_key: "",
  model: "",
  region: "global",
  create_job_path: "",
  get_job_path: "",
  status: "active",
  is_default: false,
  config_json: { video_vendor: "generic_rest", auth_mode: "bearer" },
});

const storageProviderOptions = [
  { model: "google-drive", name: "Google Drive", note: "同事各自管理個人的 Google Workspace / Drive 資訊" },
  { model: "supabase-storage", name: "Supabase Storage", note: "由系統管理者提供 Project URL、service role key 與 bucket，作為團隊共用儲存。" },
] as const;

const defaultAssetForm = (): AssetFormState => ({
  asset_type: "style_preset",
  name: "",
  content: "",
  file_path: "",
  status: "active",
  metadata_json: {},
});

function parseStoryboard(value: string) {
  try {
    const parsed = JSON.parse(value);
    const scenes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    return scenes as StoryboardScene[];
  } catch {
    return [];
  }
}

function isStoryboardJsonValid(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) || Array.isArray(parsed?.scenes);
  } catch {
    return false;
  }
}

function bytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateValue?: string) {
  if (!dateValue) return "未更新";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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
  const value = displayText(status, "未選擇");
  if (value === "draft") return "草稿";
  if (value === "text_ready") return "內容已生成";
  if (value === "video_generated") return "影片已生成";
  if (value === "merged") return "已合併";
  return value;
}

function systemStorageDisplayName(provider: Provider) {
  if (provider.provider_type !== "storage" || provider.credential_scope !== "system") {
    return provider.name;
  }
  if (provider.model === "supabase-storage") return "Supabase System";
  if (provider.model === "google-drive") return "Google Drive System";
  if (provider.model === "local-storage-v1") return "Local Storage System";
  return provider.name.replace(/\s*\(Mock\)\s*/gi, " ").trim().replace(/\s{2,}/g, " ");
}

function createProviderTestErrorResult(
  providerType: ProviderConnectionTestResult["provider_type"],
  providerName: string,
  detail: string,
): ProviderConnectionTestResult {
  return {
    ok: false,
    provider_type: providerType,
    provider_name: providerName,
    mode: "inline_error",
    detail,
    status_code: null,
    latency_ms: null,
  };
}

function getTypeLabel(type: TabDefinition["type"]) {
  if (type === "generation") return "生成工作台";
  if (type === "management") return "管理控制台";
  if (type === "logs") return "紀錄與分析";
  return "操作與教學";
}

function isTab(value: string | null): value is Tab {
  return tabs.some((tab) => tab.key === value);
}

function defaultWorkspaceProfileSettings(): WorkspaceProfileSettings {
  return {
    default_language: "zh-TW",
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
  };
}

function normalizeWorkspaceProfileSettings(settings?: Partial<WorkspaceProfileSettings> | null): WorkspaceProfileSettings {
  return normalizeWorkspaceVideoSettings(settings ?? defaultWorkspaceProfileSettings());
}

function App() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "projects";
    const saved = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    return isTab(saved) ? saved : "projects";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceProfile, setWorkspaceProfile] = useState(() => {
    if (typeof window === "undefined") return "shared";
    return window.localStorage.getItem(WORKSPACE_PROFILE_STORAGE_KEY) || "shared";
  });
  const [workspaceProfiles, setWorkspaceProfiles] = useState<WorkspaceProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [videoVendors, setVideoVendors] = useState<VideoVendorDefinition[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [storagePolicy, setStoragePolicy] = useState<StoragePolicyResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectDetail, setProjectDetail] = useState<any>(null);
  const [costOverview, setCostOverview] = useState<CostProjectOverview[]>([]);
  const [costDetail, setCostDetail] = useState<CostDetail | null>(null);
  const [textResult, setTextResult] = useState<any>(null);
  const [prepareResult, setPrepareResult] = useState<any>(null);
  const [renderResult, setRenderResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [projectNotice, setProjectNotice] = useState("");
  const [workspaceProfileNotice, setWorkspaceProfileNotice] = useState("");
  const [providerNotice, setProviderNotice] = useState("");
  const [assetNotice, setAssetNotice] = useState("");
  const [contentNotice, setContentNotice] = useState("");
  const [videoNotice, setVideoNotice] = useState("");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [editingAssetId, setEditingAssetId] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [providerTestResult, setProviderTestResult] = useState<ProviderConnectionTestResult | null>(null);
  const [providerTestTargetId, setProviderTestTargetId] = useState("");
  const [testingProviderId, setTestingProviderId] = useState("");
  const [testingProviderDraft, setTestingProviderDraft] = useState(false);
  const [storyboardProjectId, setStoryboardProjectId] = useState("");
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editingWorkspaceProfileId, setEditingWorkspaceProfileId] = useState("");

  const [projectForm, setProjectForm] = useState({
    name: "員工資安演練專案",
    description: "針對企業內部教育訓練，整合文本生成、分鏡製作、影片輸出與成本追蹤。",
    workspace_profile: "shared",
  });
  const [workspaceProfileForm, setWorkspaceProfileForm] = useState({
    name: "",
    description: "",
    source_profile_key: "shared",
    settings_json: defaultWorkspaceProfileSettings(),
  });
  const [textForm, setTextForm] = useState<{
    input_mode: string;
    topic: string;
    raw_text: string;
    scenario: string;
    target_audience: string;
    language: "zh-TW";
    video_style: "comic";
    avatar_id: string;
    voice_id: string;
    run_mode: "full" | "single_scene";
    scene_id: string | null;
    budget_limit: {
      currency: string;
      max_total_cost: number;
    };
    total_duration_seconds: number;
    scene_duration_seconds: number;
    scene_count: number;
    text_provider_id: string;
    text_model: string;
    mail_template_id: string;
    storyboard_template_id: string;
    generate_storyboard: boolean;
    generate_mail: boolean;
    generate_quiz: boolean;
  }>({
    input_mode: "topic",
    topic: "員工資安意識提升與帳號保護",
    raw_text: "",
    scenario: "以企業內部帳號保護與可疑登入通知為主題，製作社交工程防護訓練。",
    target_audience: "企業內部同仁",
    language: "zh-TW" as const,
    video_style: "comic" as const,
    avatar_id: "platform-default-avatar",
    voice_id: "platform-default-voice",
    run_mode: "full" as const,
    scene_id: null as string | null,
    budget_limit: {
      currency: "USD",
      max_total_cost: 10,
    },
    total_duration_seconds: 24,
    scene_duration_seconds: 8,
    scene_count: 0,
    text_provider_id: "",
    text_model: "gpt-4.1-mini",
    mail_template_id: "",
    storyboard_template_id: "",
    generate_storyboard: true,
    generate_mail: true,
    generate_quiz: true,
  });
  const [videoForm, setVideoForm] = useState({
    storyboard_text: JSON.stringify({ scenes: [] }, null, 2),
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
    selected_scene_ids: [] as string[],
    apply_scene1_to_all: false,
  });
  const [videoCompositionText, setVideoCompositionText] = useState("{}");
  const [activeVideoSceneId, setActiveVideoSceneId] = useState("");
  const [sceneRepairReason, setSceneRepairReason] = useState("");
  const [providerForm, setProviderForm] = useState<ProviderFormState>(defaultProviderForm());
  const [assetForm, setAssetForm] = useState<AssetFormState>(defaultAssetForm());
  const [fileInspector, setFileInspector] = useState<FileInspectorState | null>(null);
  const [fileOperationTarget, setFileOperationTarget] = useState("");
  const [fileOperationResult, setFileOperationResult] = useState<FileOperationResult | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const providerEditorRef = useRef<HTMLElement | null>(null);
  const workspaceProfileEditorRef = useRef<HTMLElement | null>(null);
  const projectEditorRef = useRef<HTMLElement | null>(null);
  const lastAppliedWorkspaceProfileSignatureRef = useRef("");

  function apiWithWorkspace<T>(path: string, init?: RequestInit, fallbackMessage?: string) {
    const headers = new Headers(init?.headers);
    headers.set("X-Workspace-Profile", workspaceProfile);
    return api<T>(
      path,
      {
        ...init,
        headers,
      },
      fallbackMessage,
    );
  }

  function scrollToSection(target: { current: HTMLElement | null }) {
    window.setTimeout(() => {
      target.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function clearLocalNotices() {
    setProjectNotice("");
    setWorkspaceProfileNotice("");
    setProviderNotice("");
    setAssetNotice("");
    setContentNotice("");
    setVideoNotice("");
  }

  function clearGlobalStatus() {
    setError("");
    setMessage("");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WORKSPACE_PROFILE_STORAGE_KEY, workspaceProfile);
  }, [workspaceProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
  }, [tab]);

  useEffect(() => {
    setProviderTestResult(null);
    setProviderTestTargetId("");
  }, [providerForm, editingProviderId, workspaceProfile]);

  useEffect(() => {
    const storyboard = projectDetail?.latest_text_job?.response_json?.storyboard;
    if (!storyboard) return;
    setVideoForm((current) => {
      if (storyboardProjectId === selectedProjectId && current.storyboard_text && current.storyboard_text !== JSON.stringify({ scenes: [] }, null, 2)) return current;
      return {
        ...current,
        storyboard_text: JSON.stringify(storyboard, null, 2),
      };
    });
    setStoryboardProjectId(selectedProjectId);
  }, [selectedProjectId, projectDetail?.latest_text_job?.id, storyboardProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setVideoCompositionText("{}");
      setActiveVideoSceneId("");
      return;
    }
    const profileSettings = normalizeWorkspaceProfileSettings(activeWorkspaceProfile?.settings_json);
    const latestComposition = projectDetail?.latest_video_composition as VideoCompositionPayload | null | undefined;
    const nextComposition = latestComposition
      ? parseCompositionText(JSON.stringify(latestComposition), videoForm.storyboard_text, selectedProjectId, workspaceProfile, profileSettings)
      : buildCompositionFromStoryboard(videoForm.storyboard_text, selectedProjectId, workspaceProfile, profileSettings);
    setVideoCompositionText(prettyComposition(nextComposition));
    setActiveVideoSceneId(nextComposition.scenes[0]?.scene_id ?? "");
  }, [selectedProjectId, projectDetail?.latest_video_composition, storyboardProjectId]);

  useEffect(() => {
    Promise.all([
      api<WorkspaceProfile[]>("/workspace-profiles"),
      apiWithWorkspace<Project[]>("/projects"),
      apiWithWorkspace<Provider[]>("/providers"),
      apiWithWorkspace<VideoVendorDefinition[]>("/providers/video-vendors"),
      apiWithWorkspace<Asset[]>("/assets"),
      apiWithWorkspace<CostProjectOverview[]>("/costs"),
      apiWithWorkspace<StoragePolicyResponse>("/storage-policy"),
    ])
      .then(([profileData, projectData, providerData, videoVendorData, assetData, costOverviewData, storagePolicyData]) => {
        setWorkspaceProfiles(profileData);
        setProjects(projectData);
        setProviders(providerData);
        setVideoVendors(videoVendorData);
        setAssets(assetData);
        setCostOverview(costOverviewData);
        setStoragePolicy(storagePolicyData);
        const profileExists = profileData.some((item) => item.profile_key === workspaceProfile);
        const nextWorkspaceProfile = profileExists ? workspaceProfile : (profileData[0]?.profile_key ?? "shared");
        if (nextWorkspaceProfile !== workspaceProfile) {
          setWorkspaceProfile(nextWorkspaceProfile);
        }
        const nextProjectPool = projectData.filter((project) => project.workspace_profile === nextWorkspaceProfile);
        if (!selectedProjectId || !nextProjectPool.some((project) => project.id === selectedProjectId)) {
          setSelectedProjectId(nextProjectPool[0]?.id ?? "");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [workspaceProfile]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(null);
      setFiles([]);
      setCostDetail(null);
      setFileInspector(null);
      setFileOperationResult(null);
      return;
    }
    Promise.all([
      apiWithWorkspace<any>(`/projects/${selectedProjectId}`),
      apiWithWorkspace<FileItem[]>(`/projects/${selectedProjectId}/files`),
      apiWithWorkspace<CostDetail>(`/costs/${selectedProjectId}`),
    ]).then(([detail, projectFiles, costs]) => {
      setProjectDetail(detail);
      setFiles(projectFiles);
      setCostDetail(costs);
    }).catch(() => undefined);
  }, [selectedProjectId, workspaceProfile]);

  useEffect(() => {
    const activeProfile = workspaceProfiles.find((item) => item.profile_key === workspaceProfile);
    if (!activeProfile) return;
    const providerSignature = providers
      .filter((item) => item.provider_type === "text_llm" || item.provider_type === "video_llm")
      .map((item) => item.id)
      .sort()
      .join(",");
    const signature = `${activeProfile.profile_key}:${activeProfile.updated_at}:${providerSignature}`;
    if (lastAppliedWorkspaceProfileSignatureRef.current === signature) return;
    applyWorkspaceProfileDefaults(activeProfile.profile_key);
    lastAppliedWorkspaceProfileSignatureRef.current = signature;
  }, [workspaceProfile, workspaceProfiles, providers]);

  const textProviders = providers.filter((item) => item.provider_type === "text_llm");
  const videoProviders = providers.filter((item) => item.provider_type === "video_llm");
  const providerGroups = [
    { key: "text_llm", title: "文字模型供應商", items: providers.filter((item) => item.provider_type === "text_llm") },
    { key: "video_llm", title: "影片模型供應商", items: videoProviders },
    { key: "storage", title: "儲存供應商", items: providers.filter((item) => item.provider_type === "storage") },
  ];
  const avatars = assets.filter((item) => item.asset_type === "avatar");
  const voices = assets.filter((item) => item.asset_type === "voice");
  const activeTab = tabs.find((item) => item.key === tab) ?? tabs[0];
  const activeWorkspaceProfile = workspaceProfiles.find((item) => item.profile_key === workspaceProfile) ?? null;
  const latestTextJob = textResult ?? projectDetail?.latest_text_job?.response_json ?? null;
  const storyboardDraftValid = isStoryboardJsonValid(videoForm.storyboard_text);
  const latestStoryboard = storyboardDraftValid ? parseStoryboard(videoForm.storyboard_text) : ((latestTextJob?.storyboard as StoryboardPayload | null)?.scenes ?? []);
  const latestQuiz = (latestTextJob?.quiz as QuizPayload | null) ?? null;
  const latestMail = (latestTextJob?.email_payload as EmailPayload | null) ?? null;
  const latestTaskInput = (latestTextJob?.task_input as TaskInput | null) ?? null;
  const latestCostSummary = (latestTextJob?.cost_summary as CostSummaryPayload | null) ?? null;
  const latestCost = projectDetail?.latest_text_job?.estimated_cost ?? costDetail?.subtotal ?? 0;
  const projectScenes = projectDetail?.scenes ?? [];
  const videoComposition = selectedProjectId
    ? parseCompositionText(videoCompositionText, videoForm.storyboard_text, selectedProjectId, workspaceProfile, activeWorkspaceProfile?.settings_json)
    : createEmptyComposition("", workspaceProfile, activeWorkspaceProfile?.settings_json);
  const activeCompositionScene =
    videoComposition.scenes.find((scene) => scene.scene_id === activeVideoSceneId) ??
    videoComposition.scenes[0] ??
    null;
  const preparedSceneKeys = prepareResult?.selected_scene_ids ?? [];
  const renderOutputs = renderResult?.outputs ?? [];
  const preferredVideoProviderId = activeWorkspaceProfile?.settings_json?.default_video_provider_id ?? "";
  const defaultVideoProvider =
    providers.find((item) => item.provider_type === "video_llm" && item.id === preferredVideoProviderId) ??
    providers.find((item) => item.provider_type === "video_llm" && item.is_default === 1);
  const storagePolicyResolved = storagePolicy?.policy?.policy_json?.resolved as Record<string, string> | undefined;

  function applyWorkspaceProfileDefaults(profileKey: string) {
    const profile = workspaceProfiles.find((item) => item.profile_key === profileKey);
    if (!profile) return;
    const settings = normalizeWorkspaceProfileSettings(profile.settings_json);
    const preferredTextProvider =
      providers.find((item) => item.provider_type === "text_llm" && item.id === settings.default_text_provider_id) ??
      providers.find((item) => item.provider_type === "text_llm" && item.is_default === 1);

    setProjectForm((current) => ({
      ...current,
      workspace_profile: profileKey,
    }));
    setTextForm((current) => ({
      ...current,
      target_audience: settings.default_target_audience,
      language: settings.default_language,
      total_duration_seconds: settings.default_total_duration_seconds,
      scene_duration_seconds: settings.default_scene_duration_seconds,
      text_provider_id: preferredTextProvider?.id ?? settings.default_text_provider_id,
      text_model: preferredTextProvider?.model ?? current.text_model,
    }));
    setVideoForm((current) => ({
      ...current,
      duration: settings.default_scene_duration_seconds,
      resolution: settings.default_resolution,
      aspect_ratio: settings.default_aspect_ratio,
      subtitle_enabled: settings.default_subtitle_enabled,
      subtitle_language: settings.default_subtitle_language,
      subtitle_font_family: settings.default_font_family,
    }));
    setVideoCompositionText((currentText) => {
      const composition = parseCompositionText(currentText, videoForm.storyboard_text, selectedProjectId || "", profileKey, settings);
      composition.workspace_profile = profileKey;
      composition.global_settings = {
        ...composition.global_settings,
        duration_seconds: settings.default_total_duration_seconds,
        scene_duration_seconds: settings.default_scene_duration_seconds,
        resolution: settings.default_resolution,
        aspect_ratio: settings.default_aspect_ratio,
        subtitle_enabled: settings.default_subtitle_enabled,
        subtitle_language: settings.default_subtitle_language,
        font_family: settings.default_font_family,
        preferred_video_provider_id: settings.default_video_provider_id,
      };
      return prettyComposition(composition);
    });
  }
  const storageGroups = [
    {
      key: "text",
      label: "文本與腳本",
      items: files.filter((file) => file.relative_path.includes("text/") || file.relative_path.includes("storyboard") || file.relative_path.includes("quiz")),
    },
    {
      key: "email",
      label: "郵件與模板",
      items: files.filter((file) => file.relative_path.includes("mail") || file.relative_path.includes("email")),
    },
    {
      key: "video",
      label: "影片與場景",
      items: files.filter((file) => file.relative_path.includes("video/") || file.relative_path.includes("scenes/") || file.relative_path.endsWith(".mp4") || file.relative_path.endsWith(".mp3") || file.relative_path.endsWith(".srt")),
    },
    {
      key: "cost",
      label: "成本與紀錄",
      items: files.filter((file) => file.relative_path.includes("cost") || file.relative_path.includes("token_usage") || file.relative_path.includes("summary")),
    },
  ].filter((group) => group.items.length > 0);
  const filteredTabs = tabs.filter((item) => {
    if (!moduleSearch.trim()) return true;
    const keyword = moduleSearch.trim().toLowerCase();
    return `${item.label} ${item.description} ${item.badge}`.toLowerCase().includes(keyword);
  });
  const filteredProjects = projects.filter((project) => {
    if (!projectSearch.trim()) return true;
    const keyword = projectSearch.trim().toLowerCase();
    return `${project.name} ${project.description} ${project.status}`.toLowerCase().includes(keyword);
  });
  const filteredProjectsInWorkspace = filteredProjects.filter((project) => project.workspace_profile === workspaceProfile);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const projectsInWorkspace = projects.filter((project) => project.workspace_profile === workspaceProfile);
  const displayProjectName = displayText(projectDetail?.project?.name || selectedProject?.name, copy.noProject);
  const projectName = displayProjectName;
  const summaryStats = [
    { label: "專案數", value: String(projects.length), hint: selectedProject ? formatDate(selectedProject.updated_at) : "未選專案" },
    { label: "可用供應商", value: String(providers.filter((item) => item.status === "active").length), hint: `${providers.length} 筆設定` },
    { label: "可用素材", value: String(assets.filter((item) => item.status === "active").length), hint: `${assets.length} 筆資產` },
    { label: "專案檔案", value: String(files.length), hint: displayProjectName },
  ];
  const notificationItems = [
    {
      id: "context-project",
      tone: "info" as const,
      title: "目前專案",
      detail: selectedProject ? `${displayProjectName} · ${projectStatusLabel(selectedProject.status)}` : "尚未選擇專案",
    },
    {
      id: "context-profile",
      tone: "info" as const,
      title: "工作設定檔",
      detail: activeWorkspaceProfile?.name ?? workspaceProfile,
    },
    {
      id: "message",
      tone: message ? ("success" as const) : error ? ("error" as const) : ("info" as const),
      title: message ? "最新成功訊息" : error ? "最新錯誤訊息" : "系統提醒",
      detail: message || error || "目前沒有新的提醒。",
    },
  ];
  const isProviderReadOnly = (provider: Provider) => provider.credential_scope === "system";
  const editingProvider = providers.find((provider) => provider.id === editingProviderId) ?? null;
  const editingProviderReadOnly = editingProvider ? isProviderReadOnly(editingProvider) : false;

  function toggleSceneSelection(sceneKey: string) {
    setVideoForm((current) => {
      const exists = current.selected_scene_ids.includes(sceneKey);
      return {
        ...current,
        execute_all: false,
        selected_scene_ids: exists
          ? current.selected_scene_ids.filter((item) => item !== sceneKey)
          : [...current.selected_scene_ids, sceneKey],
      };
    });
  }

  function updateVideoComposition(nextComposition: VideoCompositionPayload) {
    setVideoCompositionText(prettyComposition(nextComposition));
    if (!activeVideoSceneId || !nextComposition.scenes.some((scene) => scene.scene_id === activeVideoSceneId)) {
      setActiveVideoSceneId(nextComposition.scenes[0]?.scene_id ?? "");
    }
  }

  async function refreshBase() {
    const [profileData, projectData, providerData, videoVendorData, assetData, costOverviewData, storagePolicyData] = await Promise.all([
      api<WorkspaceProfile[]>("/workspace-profiles"),
      apiWithWorkspace<Project[]>("/projects"),
      apiWithWorkspace<Provider[]>("/providers"),
      apiWithWorkspace<VideoVendorDefinition[]>("/providers/video-vendors"),
      apiWithWorkspace<Asset[]>("/assets"),
      apiWithWorkspace<CostProjectOverview[]>("/costs"),
      apiWithWorkspace<StoragePolicyResponse>("/storage-policy"),
    ]);
    setWorkspaceProfiles(profileData);
    setProjects(projectData);
    setProviders(providerData);
    setVideoVendors(videoVendorData);
    setAssets(assetData);
    setCostOverview(costOverviewData);
    setStoragePolicy(storagePolicyData);
  }

  async function refreshProject() {
    if (!selectedProjectId) return;
    const [detail, projectFiles, costs, overview] = await Promise.all([
      apiWithWorkspace<any>(`/projects/${selectedProjectId}`),
      apiWithWorkspace<FileItem[]>(`/projects/${selectedProjectId}/files`),
      apiWithWorkspace<CostDetail>(`/costs/${selectedProjectId}`),
      apiWithWorkspace<CostProjectOverview[]>("/costs"),
    ]);
    setProjectDetail(detail);
    setFiles(projectFiles);
    setCostDetail(costs);
    setCostOverview(overview);
  }

  function switchWorkspaceProfile(profileKey: string) {
    const nextProfile = profileKey.trim().toLowerCase() || "shared";
    setWorkspaceProfile(nextProfile);
    setProjectForm((current) => ({
      ...current,
      workspace_profile: nextProfile,
    }));
  }

  function selectProjectWithProfile(projectId: string) {
    setSelectedProjectId(projectId);
    const project = projects.find((item) => item.id === projectId);
    if (project?.workspace_profile && project.workspace_profile !== workspaceProfile) {
      setWorkspaceProfile(project.workspace_profile);
    }
  }

  function resetProviderEditor() {
    setEditingProviderId("");
    setProviderForm(defaultProviderForm());
  }

  function startCreateStorageProvider() {
    clearGlobalStatus();
    clearLocalNotices();
    setProviderNotice("已切換到新增自建 storage 表單。");
    setEditingProviderId("");
    applyStorageOption("supabase-storage");
    providerEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetAssetEditor() {
    setEditingAssetId("");
    setAssetForm(defaultAssetForm());
  }

  function startCreateProject() {
    setTab("projects");
    clearGlobalStatus();
    clearLocalNotices();
    setEditingProjectId("");
    setProjectForm({
      name: "新的社交工程演練專案",
      description: "請填入這次訓練目標、受眾與預期產出。",
      workspace_profile: workspaceProfile,
    });
    setProjectNotice("已切換到專案建立表單。");
    scrollToSection(projectEditorRef);
  }

  function startEditProject(project: Project) {
    setTab("projects");
    clearGlobalStatus();
    clearLocalNotices();
    setEditingProjectId(project.id);
    selectProjectWithProfile(project.id);
    setProjectForm({
      name: project.name,
      description: project.description,
      workspace_profile: project.workspace_profile,
    });
    setProjectNotice(`已載入「${project.name}」到編輯表單。`);
    scrollToSection(projectEditorRef);
  }

  function startCreateWorkspaceProfile(sourceProfileKey = workspaceProfile) {
    setTab("projects");
    clearGlobalStatus();
    clearLocalNotices();
    const sourceProfile = workspaceProfiles.find((item) => item.profile_key === sourceProfileKey);
    switchWorkspaceProfile(sourceProfileKey || "shared");
    setEditingWorkspaceProfileId("");
    setWorkspaceProfileForm({
      name: sourceProfile ? `${sourceProfile.name} 複本` : "新的工作設定檔",
      description: sourceProfile?.description ?? "",
      source_profile_key: sourceProfileKey || "shared",
      settings_json: normalizeWorkspaceProfileSettings(sourceProfile?.settings_json),
    });
    setWorkspaceProfileNotice("已切換到工作設定檔建立表單。");
    scrollToSection(workspaceProfileEditorRef);
  }

  function startEditWorkspaceProfile(profile: WorkspaceProfile) {
    setTab("projects");
    clearGlobalStatus();
    clearLocalNotices();
    switchWorkspaceProfile(profile.profile_key);
    setEditingWorkspaceProfileId(profile.id);
    setWorkspaceProfileForm({
      name: profile.name,
      description: profile.description,
      source_profile_key: profile.source_profile_key ?? "shared",
      settings_json: normalizeWorkspaceProfileSettings(profile.settings_json),
    });
    setWorkspaceProfileNotice(`已載入「${profile.name}」到工作設定檔表單。`);
    scrollToSection(workspaceProfileEditorRef);
  }

  async function saveWorkspaceProfile() {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const method = editingWorkspaceProfileId ? "PUT" : "POST";
      const path = editingWorkspaceProfileId ? `/workspace-profiles/${editingWorkspaceProfileId}` : "/workspace-profiles";
      const profile = await api<WorkspaceProfile>(path, {
        method,
        body: JSON.stringify(workspaceProfileForm),
      });
      await refreshBase();
      switchWorkspaceProfile(profile.profile_key);
      setEditingWorkspaceProfileId("");
      setWorkspaceProfileNotice(editingWorkspaceProfileId ? "工作設定檔已更新。" : "工作設定檔已建立。");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteWorkspaceProfile(profileId: string) {
    const profile = workspaceProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    if (!window.confirm(`確定要刪除設定檔「${profile.name}」嗎？`)) return;
    try {
      clearGlobalStatus();
      clearLocalNotices();
      await api(`/workspace-profiles/${profileId}`, { method: "DELETE" });
      await refreshBase();
      if (workspaceProfile === profile.profile_key) {
        switchWorkspaceProfile("shared");
      }
      setEditingWorkspaceProfileId("");
      setMessage("工作設定檔已刪除。");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createProject() {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const project = await apiWithWorkspace<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(projectForm),
      });
      await refreshBase();
      setEditingProjectId("");
      switchWorkspaceProfile(project.workspace_profile);
      setSelectedProjectId(project.id);
      setProjectNotice(copy.createProjectDone);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updateProject() {
    if (!editingProjectId) return;
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const project = await apiWithWorkspace<Project>(`/projects/${editingProjectId}`, {
        method: "PUT",
        body: JSON.stringify(projectForm),
      });
      await refreshBase();
      switchWorkspaceProfile(project.workspace_profile);
      setSelectedProjectId(project.id);
      setEditingProjectId("");
      setProjectNotice("專案已更新。");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteProjects(projectIds: string[]) {
    if (projectIds.length === 0) return;
    try {
      clearGlobalStatus();
      clearLocalNotices();
      for (const projectId of projectIds) {
        await apiWithWorkspace<{ id: string; name: string }>(`/projects/${projectId}`, { method: "DELETE" });
      }
      const remainingProjects = projects.filter((project) => !projectIds.includes(project.id));
      await refreshBase();
      setEditingProjectId("");
      if (projectIds.includes(selectedProjectId)) {
        setSelectedProjectId(remainingProjects[0]?.id ?? "");
      }
      setMessage(projectIds.length === 1 ? "專案已刪除。" : `已刪除 ${projectIds.length} 個專案。`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteProject(projectId: string) {
    if (!window.confirm("確定要刪除這個專案嗎？相關產物與紀錄也會一併移除。")) return;
    await deleteProjects([projectId]);
  }

  async function deleteSelectedProjects(projectIds: string[]) {
    if (projectIds.length === 0) return;
    if (!window.confirm(`確定要刪除這 ${projectIds.length} 個專案嗎？相關產物與紀錄也會一併移除。`)) return;
    await deleteProjects(projectIds);
  }

  async function runTextGenerate() {
    if (!selectedProjectId) return setError(copy.selectProjectFirst);
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const data = await apiWithWorkspace<any>(`/projects/${selectedProjectId}/text-generate`, {
        method: "POST",
        body: JSON.stringify(textForm),
      });
      setTextResult(data);
      setVideoForm((current) => ({
        ...current,
        storyboard_text: JSON.stringify(data.storyboard ?? [], null, 2),
      }));
      setStoryboardProjectId(selectedProjectId);
      await refreshProject();
      setContentNotice(copy.textDone);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function prepareVideo() {
    if (!selectedProjectId) return setError(copy.selectProject);
    if (!isStoryboardJsonValid(videoForm.storyboard_text)) return setError("分鏡 JSON 格式錯誤，請先回內容生成修正後再送出影片生成。");
    try {
      clearGlobalStatus();
      clearLocalNotices();
      setRenderResult(null);
      const data = await apiWithWorkspace<any>(`/projects/${selectedProjectId}/video-prepare`, {
        method: "POST",
        body: JSON.stringify({
          ...videoForm,
          composition_json_text: videoCompositionText,
        }),
      });
      setPrepareResult(data);
      if (data.composition) {
        updateVideoComposition(data.composition);
      }
      setVideoNotice(copy.prepareDone);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function renderVideo() {
    if (!selectedProjectId || !prepareResult) return setError(copy.prepareFirst);
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const data = await apiWithWorkspace<any>(`/projects/${selectedProjectId}/video-render`, {
        method: "POST",
        body: JSON.stringify({
          provider_id: videoComposition.global_settings.preferred_video_provider_id || defaultVideoProvider?.id || null,
          render_request: prepareResult.render_request,
        }),
      });
      setRenderResult(data);
      await refreshProject();
      setMessage(copy.renderDone);
      setTab("files");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function rerunScene(sceneKey: string) {
    if (!selectedProjectId) return;
    try {
      setError("");
      setMessage("");
      await apiWithWorkspace<any>(`/projects/${selectedProjectId}/scenes/${sceneKey}/rerun`, { method: "POST" });
      await refreshProject();
      setMessage(`${sceneKey} 已重做。`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function mergeProject() {
    if (!selectedProjectId) return;
    try {
      setError("");
      setMessage("");
      await apiWithWorkspace<any>(`/projects/${selectedProjectId}/merge`, {
        method: "POST",
        body: JSON.stringify({ scene_ids: [] }),
      });
      await refreshProject();
      setMessage(copy.mergeDone);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEditProvider(provider: Provider) {
    clearGlobalStatus();
    clearLocalNotices();
    setEditingProviderId(provider.id);
    setProviderForm({
      provider_type: provider.provider_type,
      name: systemStorageDisplayName(provider),
      base_url: provider.base_url,
      api_key: provider.api_key,
      model: provider.model,
      region: provider.region,
      create_job_path: provider.create_job_path,
      get_job_path: provider.get_job_path,
      status: provider.status,
      is_default: provider.is_default === 1,
      config_json: provider.config_json ?? {},
    });
    if (isProviderReadOnly(provider)) {
      setProviderNotice("這是系統層級供應商，目前只能在編輯器中查看設定，不能直接修改。");
    } else {
      setProviderNotice(`已載入「${provider.name}」到供應商表單。`);
    }
    providerEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cloneProviderAsEditable(provider: Provider) {
    clearGlobalStatus();
    clearLocalNotices();
    setEditingProviderId("");
    setProviderForm({
      provider_type: provider.provider_type,
      name: `${systemStorageDisplayName(provider)} - 可編輯副本`,
      base_url: provider.base_url,
      api_key: provider.api_key,
      model: provider.model,
      region: provider.region,
      create_job_path: provider.create_job_path,
      get_job_path: provider.get_job_path,
      status: provider.status,
      is_default: false,
      config_json: { ...(provider.config_json ?? {}) },
    });
    setProviderNotice("已從系統供應商建立可編輯草稿，請檢查欄位後儲存。");
    providerEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyStorageOption(model: string) {
    const option = storageProviderOptions.find((item) => item.model === model);
    if (!option) return;
    const nextConfig =
      model === "google-drive"
        ? { folder_id: "", service_account_json: "" }
        : model === "supabase-storage"
          ? { project_url: "", service_role_key: "", storage_bucket: "", metadata_table: "" }
          : { root_path: String(providerForm.config_json.root_path ?? "") };
    setProviderForm({
      ...providerForm,
      provider_type: "storage",
      model: option.model,
      name: option.name,
      base_url: "",
      api_key: "",
      region: "global",
      config_json: nextConfig,
    });
  }

  function applyVideoVendor(vendor: string) {
    const definition = videoVendors.find((item) => item.vendor === vendor);
    if (!definition) return;
    setProviderForm({
      ...providerForm,
      provider_type: "video_llm",
      model: definition.default_model || providerForm.model,
      base_url: definition.default_base_url || providerForm.base_url,
      create_job_path: definition.default_create_job_path || providerForm.create_job_path,
      get_job_path: definition.default_get_job_path || providerForm.get_job_path,
      config_json: {
        ...providerForm.config_json,
        video_vendor: definition.vendor,
        auth_mode: definition.auth_mode,
      },
    });
  }

  function getProviderConfigValue(key: string) {
    const value = providerForm.config_json[key];
    return typeof value === "string" ? value : "";
  }

  function setProviderConfigValue(key: string, value: string) {
    setProviderForm({
      ...providerForm,
      config_json: {
        ...providerForm.config_json,
        [key]: value,
      },
    });
  }

  async function saveProvider() {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const method = editingProviderId ? "PUT" : "POST";
      const path = editingProviderId ? `/providers/${editingProviderId}` : "/providers";
      await apiWithWorkspace<any>(path, { method, body: JSON.stringify(providerForm) });
      const wasEditing = Boolean(editingProviderId);
      await refreshBase();
      resetProviderEditor();
      setProviderNotice(wasEditing ? copy.providerUpdated : copy.providerCreated);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function repairVideoScene() {
    if (!selectedProjectId || !activeCompositionScene) {
      setError("請先選擇要修正的分鏡。");
      return;
    }
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const pendingComposition = setSceneRepairQueued(videoComposition, activeCompositionScene.scene_id, sceneRepairReason || "單幕修正");
      updateVideoComposition(pendingComposition);
      const data = await apiWithWorkspace<any>(`/projects/${selectedProjectId}/video-repair-scene`, {
        method: "POST",
        body: JSON.stringify({
          provider_id: videoComposition.global_settings.preferred_video_provider_id || defaultVideoProvider?.id || null,
          composition_json_text: prettyComposition(pendingComposition),
          scene_id: activeCompositionScene.scene_id,
          reason: sceneRepairReason || "單幕修正",
        }),
      });
      if (data.composition) {
        updateVideoComposition(data.composition);
      }
      setRenderResult((current: any) => ({
        ...(current ?? {}),
        outputs: [...(current?.outputs ?? []).filter((item: any) => item.scene_key !== activeCompositionScene.scene_id), ...(data.outputs ?? [])],
      }));
      setVideoNotice(`已完成「${activeCompositionScene.title}」單幕修正。`);
      await refreshProject();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function openVideoGenerationFromStoryboard() {
    if (!isStoryboardJsonValid(videoForm.storyboard_text)) {
      setError("分鏡 JSON 格式錯誤，無法套用到影片生成模組。");
      return;
    }
    clearGlobalStatus();
    clearLocalNotices();
    setContentNotice("已使用目前分鏡 JSON 作為影片生成輸入。");
    setTab("video");
  }

  function openContentGeneration() {
    if (!selectedProjectId) {
      setError("請先在專案管理頁建立或選擇專案。");
      return;
    }
    clearGlobalStatus();
    clearLocalNotices();
    setContentNotice("已切換到內容生成工作台。");
    setTab("file");
  }

  function openWorkspaceProfileManager() {
    clearGlobalStatus();
    clearLocalNotices();
    setWorkspaceProfileNotice("已定位到工作設定檔管理區。");
    setTab("profiles");
    scrollToSection(workspaceProfileEditorRef);
  }

  async function openProjectFile(relativePath: string, mode: "view" | "edit" = "view") {
    if (!selectedProjectId) {
      setError(copy.selectProject);
      return;
    }
    try {
      setError("");
      setMessage("");
      setFileOperationResult(null);
      setFileOperationTarget(relativePath);
      const file = await apiWithWorkspace<ProjectFileContent>(
        `/projects/${selectedProjectId}/files/content?relative_path=${encodeURIComponent(relativePath)}`,
        undefined,
        "讀取檔案內容失敗",
      );
      setFileInspector({
        relativePath: file.relative_path,
        mimeType: file.mime_type,
        isText: file.is_text,
        content: file.content ?? "",
        mode: file.is_text ? mode : "view",
        renameValue: file.relative_path,
      });
      setFileOperationResult({
        relativePath: file.relative_path,
        tone: "success",
        message: file.is_text ? "已載入檔案內容。" : "此檔案為二進位格式，已載入檔案資訊。",
      });
    } catch (err) {
      setFileOperationResult({
        relativePath,
        tone: "error",
        message: (err as Error).message,
      });
    } finally {
      setFileOperationTarget("");
    }
  }

  async function downloadProjectFile(relativePath: string) {
    if (!selectedProjectId) {
      setError(copy.selectProject);
      return;
    }
    try {
      setError("");
      setMessage("");
      setFileOperationResult(null);
      setFileOperationTarget(relativePath);
      const headers = new Headers();
      headers.set("X-Workspace-Profile", workspaceProfile);
      const response = await fetch(
        `${API_BASE_URL}/projects/${selectedProjectId}/files/raw?relative_path=${encodeURIComponent(relativePath)}&download=true`,
        { headers },
      );
      if (!response.ok) {
        throw new Error("下載檔案失敗");
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = relativePath.split("/").pop() || "download";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setFileOperationResult({
        relativePath,
        tone: "success",
        message: "已下載到本機。",
      });
    } catch (err) {
      setFileOperationResult({
        relativePath,
        tone: "error",
        message: (err as Error).message,
      });
    } finally {
      setFileOperationTarget("");
    }
  }

  async function renameProjectFile(currentRelativePath: string, nextRelativePath?: string) {
    if (!selectedProjectId) {
      setError(copy.selectProject);
      return;
    }
    const requestedPath = nextRelativePath?.trim() || window.prompt("新的檔案路徑", currentRelativePath)?.trim();
    if (!requestedPath || requestedPath === currentRelativePath) return;
    try {
      setError("");
      setMessage("");
      setFileOperationResult(null);
      setFileOperationTarget(currentRelativePath);
      const updated = await apiWithWorkspace<{ relative_path: string }>(
        `/projects/${selectedProjectId}/files/rename`,
        {
          method: "PUT",
          body: JSON.stringify({
            relative_path: currentRelativePath,
            new_relative_path: requestedPath,
          }),
        },
        "重新命名檔案失敗",
      );
      await refreshProject();
      setFileInspector((current) =>
        current && current.relativePath === currentRelativePath
          ? { ...current, relativePath: updated.relative_path, renameValue: updated.relative_path }
          : current,
      );
      setFileOperationResult({
        relativePath: updated.relative_path,
        tone: "success",
        message: "檔案名稱已更新。",
      });
    } catch (err) {
      setFileOperationResult({
        relativePath: currentRelativePath,
        tone: "error",
        message: (err as Error).message,
      });
    } finally {
      setFileOperationTarget("");
    }
  }

  async function deleteProjectFile(relativePath: string) {
    if (!selectedProjectId) {
      setError(copy.selectProject);
      return;
    }
    if (!window.confirm(`確定要刪除檔案「${relativePath}」嗎？`)) return;
    try {
      setError("");
      setMessage("");
      setFileOperationResult(null);
      setFileOperationTarget(relativePath);
      await apiWithWorkspace(
        `/projects/${selectedProjectId}/files`,
        {
          method: "DELETE",
          body: JSON.stringify({ relative_path: relativePath }),
        },
        "刪除檔案失敗",
      );
      await refreshProject();
      setFileInspector((current) => (current?.relativePath === relativePath ? null : current));
      setFileOperationResult({
        relativePath,
        tone: "success",
        message: "檔案已刪除。",
      });
    } catch (err) {
      setFileOperationResult({
        relativePath,
        tone: "error",
        message: (err as Error).message,
      });
    } finally {
      setFileOperationTarget("");
    }
  }

  async function saveProjectFileContent() {
    if (!selectedProjectId || !fileInspector) return;
    try {
      setError("");
      setMessage("");
      setFileOperationResult(null);
      setFileOperationTarget(fileInspector.relativePath);
      const updated = await apiWithWorkspace<ProjectFileContent>(
        `/projects/${selectedProjectId}/files/content`,
        {
          method: "PUT",
          body: JSON.stringify({
            relative_path: fileInspector.relativePath,
            content: fileInspector.content,
          }),
        },
        "儲存檔案失敗",
      );
      await refreshProject();
      setFileInspector({
        relativePath: updated.relative_path,
        mimeType: updated.mime_type,
        isText: updated.is_text,
        content: updated.content ?? "",
        mode: "view",
        renameValue: updated.relative_path,
      });
      setFileOperationResult({
        relativePath: updated.relative_path,
        tone: "success",
        message: "檔案內容已更新。",
      });
    } catch (err) {
      setFileOperationResult({
        relativePath: fileInspector.relativePath,
        tone: "error",
        message: (err as Error).message,
      });
    } finally {
      setFileOperationTarget("");
    }
  }

  async function testProviderDraftConnection() {
    try {
      setError("");
      setMessage("");
      setProviderTestResult(null);
      setProviderTestTargetId("");
      setTestingProviderDraft(true);
      const result = await apiWithWorkspace<ProviderConnectionTestResult>(
        "/providers/test",
        {
          method: "POST",
          body: JSON.stringify(providerForm),
        },
        "供應商連線測試失敗",
      );
      setProviderTestResult(result);
    } catch (err) {
      setProviderTestResult(
        createProviderTestErrorResult(
          providerForm.provider_type,
          providerForm.name || providerForm.model || "目前設定",
          (err as Error).message,
        ),
      );
    } finally {
      setTestingProviderDraft(false);
    }
  }

  async function testSavedProviderConnection(provider: Provider) {
    try {
      setError("");
      setMessage("");
      setProviderTestResult(null);
      setProviderTestTargetId(provider.id);
      setTestingProviderId(provider.id);
      const result = await apiWithWorkspace<ProviderConnectionTestResult>(
        `/providers/${provider.id}/test`,
        { method: "POST" },
        "供應商連線測試失敗",
      );
      setProviderTestResult(result);
    } catch (err) {
      setProviderTestResult(
        createProviderTestErrorResult(provider.provider_type, provider.name, (err as Error).message),
      );
    } finally {
      setTestingProviderId("");
    }
  }

  async function applyStoragePolicyAction() {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      await apiWithWorkspace<StoragePolicyResponse>("/storage-policy/apply", { method: "POST" });
      await refreshBase();
      setProviderNotice("已套用儲存策略，僅影響新資料寫入位置。");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function applyStorageProvider(providerId: string) {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      await apiWithWorkspace<StoragePolicyResponse>(
        "/storage-policy/select-provider",
        {
          method: "POST",
          body: JSON.stringify({ provider_id: providerId }),
        },
        "套用 storage 供應商失敗",
      );
      await refreshBase();
      setProviderNotice("已切換目前使用中的 storage。");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeProvider(providerId: string) {
    if (!window.confirm(copy.confirmDeleteProvider)) return;
    try {
      setError("");
      setMessage("");
      await apiWithWorkspace<any>(`/providers/${providerId}`, { method: "DELETE" });
      await refreshBase();
      if (editingProviderId === providerId) resetProviderEditor();
      setMessage(copy.providerDeleted);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEditAsset(asset: Asset) {
    clearGlobalStatus();
    clearLocalNotices();
    setEditingAssetId(asset.id);
    setAssetForm({
      asset_type: asset.asset_type,
      name: asset.name,
      content: asset.content,
      file_path: asset.file_path,
      status: asset.status,
      metadata_json: asset.metadata_json ?? {},
    });
    setAssetNotice(`已載入「${asset.name}」到素材編輯器。`);
  }

  async function uploadAssetFile(file: File, assetType: Asset["asset_type"], name: string, status: Asset["status"]) {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const formData = new FormData();
      formData.append("asset_type", assetType);
      formData.append("name", name.trim());
      formData.append("status", status);
      formData.append("metadata_json", JSON.stringify({ ...assetForm.metadata_json }));
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/assets/import/upload`, {
        method: "POST",
        body: formData,
        headers: {
          "X-Workspace-Profile": workspaceProfile,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || payload.detail || "素材上傳失敗");
      }
      await refreshBase();
      startEditAsset(payload.data as Asset);
      setAssetNotice(`已匯入素材：${(payload.data as Asset).name}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function importAssetFromUrl(sourceUrl: string, assetType: Asset["asset_type"], name: string, status: Asset["status"]) {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const asset = await apiWithWorkspace<Asset>(
        "/assets/import/url",
        {
          method: "POST",
          body: JSON.stringify({
            asset_type: assetType,
            source_url: sourceUrl,
            name: name.trim(),
            status,
            metadata_json: { ...assetForm.metadata_json },
          }),
        },
        "素材 URL 匯入失敗",
      );
      await refreshBase();
      startEditAsset(asset);
      setAssetNotice(`已從網址匯入素材：${asset.name}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveAsset() {
    try {
      clearGlobalStatus();
      clearLocalNotices();
      const method = editingAssetId ? "PUT" : "POST";
      const path = editingAssetId ? `/assets/${editingAssetId}` : "/assets";
      await apiWithWorkspace<any>(path, { method, body: JSON.stringify(assetForm) });
      const wasEditing = Boolean(editingAssetId);
      await refreshBase();
      resetAssetEditor();
      setAssetNotice(wasEditing ? copy.assetUpdated : copy.assetCreated);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeAsset(assetId: string) {
    if (!window.confirm(copy.confirmDeleteAsset)) return;
    try {
      setError("");
      setMessage("");
      await apiWithWorkspace<any>(`/assets/${assetId}`, { method: "DELETE" });
      await refreshBase();
      if (editingAssetId === assetId) resetAssetEditor();
      setMessage(copy.assetDeleted);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-header">
            <p className="sidebar-kicker">{copy.subtitle}</p>
            <h1 className="sidebar-title">{sidebarCollapsed ? copy.compactTitle : copy.title}</h1>
            {!sidebarCollapsed ? <p className="sidebar-subtitle">企業分析工作台</p> : null}
          </div>
          <button
            className="collapse-toggle"
            type="button"
            aria-label={sidebarCollapsed ? "展開側邊欄" : "收合側邊欄"}
            title={sidebarCollapsed ? "展開側邊欄" : "收合側邊欄"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? "→" : "←"}
          </button>
        </div>
        {!sidebarCollapsed ? (
          <section className="rail-section">
            <div className="rail-title">
              <span>{copy.currentProject}</span>
              <small>{projectsInWorkspace.length} 筆</small>
            </div>
            <label className="sidebar-search" htmlFor="workspace-profile">
              <span>工作設定檔</span>
              <select
                id="workspace-profile"
                className="project-select fixed-field"
                name="workspaceProfile"
                value={workspaceProfile}
                onChange={(event) => switchWorkspaceProfile(event.target.value)}
              >
                {workspaceProfiles.map((profile) => (
                  <option key={profile.id} value={profile.profile_key}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <button className="ghost-button" type="button" onClick={openWorkspaceProfileManager} data-testid="sidebar-manage-workspace-profiles">
                前往設定檔管理
              </button>
            </label>
            <label className="sidebar-search" htmlFor="project-search">
              <span>專案搜尋</span>
              <input
                id="project-search"
                className="fixed-field"
                type="search"
                name="projectSearch"
                autoComplete="off"
                placeholder="輸入專案名稱、描述或狀態…"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
              />
            </label>
            <select className="project-select fixed-field" value={selectedProjectId} onChange={(event) => selectProjectWithProfile(event.target.value)} aria-label="選擇目前專案">
              <option value="">{copy.chooseProject}</option>
              {filteredProjectsInWorkspace.map((project) => (
                <option key={project.id} value={project.id}>
                  {displayText(project.name, "未命名專案")}
                </option>
              ))}
            </select>
            <div className="project-overview-card">
              <span className="mini-label">專案狀態</span>
              <strong>{projectStatusLabel(selectedProject?.status)}</strong>
              <small>{selectedProject ? `更新於 ${formatDate(selectedProject.updated_at)}` : "建立專案後可開始生成內容"}</small>
            </div>
          </section>
        ) : null}
        <section className="rail-section">
          {!sidebarCollapsed ? (
            <label className="sidebar-search" htmlFor="module-search">
              <span>模組搜尋</span>
              <input
                id="module-search"
                className="fixed-field"
                type="search"
                name="moduleSearch"
                autoComplete="off"
                placeholder="搜尋模組…"
                value={moduleSearch}
                onChange={(event) => setModuleSearch(event.target.value)}
              />
            </label>
          ) : null}
          <nav className="tab-grid" aria-label="模組導覽">
            {(filteredTabs.length > 0 ? filteredTabs : tabs).map((item) => (
              <button
                key={item.key}
                className={item.key === tab ? "tab-chip active" : "tab-chip"}
                onClick={() => setTab(item.key)}
                type="button"
                data-testid={`tab-${item.key}`}
              >
                <span className="tab-icon" aria-hidden="true">{item.icon}</span>
                {!sidebarCollapsed ? (
                  <span className="tab-copy">
                    <strong>{item.label}</strong>
                    <small>{item.badge}</small>
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </section>
        <div className="sidebar-footer">
          <div className="sidebar-footer-card">
            <strong>{activeWorkspaceProfile?.name ?? workspaceProfile}</strong>
            <span>工作設定檔</span>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-topbar">
          <label className="topbar-search" htmlFor="workspace-search">
            <span className="visually-hidden">搜尋頁面與模組</span>
            <span className="topbar-search-icon" aria-hidden="true">⌕</span>
            <input
              id="workspace-search"
              type="search"
              name="workspaceSearch"
              autoComplete="off"
              placeholder="搜尋模組、供應商或素材…"
              value={moduleSearch}
              onChange={(event) => setModuleSearch(event.target.value)}
            />
          </label>
          <div className="topbar-actions" aria-label="全域操作">
            <button
              className={notificationsOpen ? "topbar-action-button active" : "topbar-action-button"}
              type="button"
              aria-label="通知中心"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((current) => !current)}
              data-testid="topbar-notifications-toggle"
            >
              通知中心
            </button>
            <button
              className="topbar-action-button"
              type="button"
              aria-label="操作說明"
              onClick={() => {
                setError("");
                setMessage("已切換到操作指南。");
                setTab("guide");
              }}
            >
              操作說明
            </button>
          </div>
        </header>
        {notificationsOpen ? (
          <section className="notification-panel" aria-label="通知中心內容">
            {notificationItems.map((item) => (
              <article key={item.id} className={`notification-card notification-card-${item.tone}`}>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
            <div className="notification-actions">
              <button className="ghost-button" type="button" onClick={openWorkspaceProfileManager}>
                查看工作設定檔
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  setTab("guide");
                }}
              >
                前往操作指南
              </button>
            </div>
          </section>
        ) : null}
        <header className="hero">
          <div className="hero-copy">
            <div className="hero-badge-row">
              <span className={`hero-badge hero-badge-${activeTab.type}`}>{getTypeLabel(activeTab.type)}</span>
              <span className="hero-context">目前專案：{projectName}</span>
              <span className="hero-context">設定檔：{activeWorkspaceProfile?.name ?? workspaceProfile}</span>
            </div>
            <h2>{activeTab.label}</h2>
            <p className="hero-subtitle">{activeTab.description}</p>
            <div className="hero-meta-grid">
              <div className="hero-meta-card">
                <span>目前分鏡</span>
                <strong>{latestStoryboard.length || projectScenes.length}</strong>
              </div>
              <div className="hero-meta-card">
                <span>渲染輸出</span>
                <strong>{renderOutputs.length}</strong>
              </div>
              <div className="hero-meta-card">
                <span>最新成本</span>
                <strong>${Number(latestCost).toFixed(4)}</strong>
              </div>
            </div>
          </div>
          <div className="hero-stats">
            {summaryStats.map((item) => (
              <div key={item.label} className="hero-stat-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.hint}</small>
              </div>
            ))}
          </div>
        </header>
        {error ? <div className="alert error">{error}</div> : null}
        {message ? <div className="alert success">{message}</div> : null}

        {tab === "profiles" ? (
          <WorkspaceProfilePanel
            providers={providers}
            workspaceProfiles={workspaceProfiles}
            workspaceProfile={workspaceProfile}
            workspaceProfileNotice={workspaceProfileNotice}
            workspaceProfileForm={workspaceProfileForm}
            editingWorkspaceProfileId={editingWorkspaceProfileId}
            setWorkspaceProfileForm={setWorkspaceProfileForm}
            selectWorkspaceProfile={switchWorkspaceProfile}
            startCreateWorkspaceProfile={startCreateWorkspaceProfile}
            startEditWorkspaceProfile={startEditWorkspaceProfile}
            saveWorkspaceProfile={saveWorkspaceProfile}
            deleteWorkspaceProfile={deleteWorkspaceProfile}
            formatDate={formatDate}
            workspaceProfileEditorRef={workspaceProfileEditorRef}
          />
        ) : null}

        {tab === "projects" ? (
          <ProjectManagementPanel
            projects={projects}
            workspaceProfiles={workspaceProfiles}
            workspaceProfile={workspaceProfile}
            projectNotice={projectNotice}
            selectedProjectId={selectedProjectId}
            projectForm={projectForm}
            editingProjectId={editingProjectId}
            setProjectForm={setProjectForm}
            selectProject={selectProjectWithProfile}
            startCreateProject={startCreateProject}
            startEditProject={startEditProject}
            createProject={createProject}
            updateProject={updateProject}
            deleteProject={deleteProject}
            deleteSelectedProjects={deleteSelectedProjects}
            openContentGeneration={openContentGeneration}
            formatDate={formatDate}
            projectEditorRef={projectEditorRef}
          />
        ) : null}

        {tab === "file" ? (
          <ProjectTextPanel
            projectName={projectName}
            projectStatus={selectedProject?.status || "未選擇"}
            hasProject={Boolean(selectedProjectId)}
            contentNotice={contentNotice}
            latestStoryboard={latestStoryboard}
            latestMail={latestMail}
            latestQuiz={latestQuiz}
            latestCost={Number(latestCost)}
            taskInput={latestTaskInput}
            costSummary={latestCostSummary}
            textForm={textForm}
            setTextForm={setTextForm}
            textProviders={textProviders}
            defaultTextProviderLabel={copy.defaultTextProvider}
            runTextGenerate={runTextGenerate}
            storyboardDraftText={videoForm.storyboard_text}
            setStoryboardDraftText={(value) => setVideoForm((current) => ({ ...current, storyboard_text: value }))}
            openVideoGeneration={openVideoGenerationFromStoryboard}
            storyboardDraftValid={storyboardDraftValid}
          />
        ) : null}

        {tab === "video" ? (
          <VideoGenerationPanel
            videoForm={videoForm}
            setVideoForm={setVideoForm}
            videoComposition={videoComposition}
            updateVideoComposition={updateVideoComposition}
            videoCompositionText={videoCompositionText}
            setVideoCompositionText={setVideoCompositionText}
            activeSceneId={activeVideoSceneId}
            setActiveSceneId={setActiveVideoSceneId}
            sceneRepairReason={sceneRepairReason}
            setSceneRepairReason={setSceneRepairReason}
            defaultVideoProvider={defaultVideoProvider}
            videoProviders={videoProviders}
            renderOutputs={renderOutputs}
            assets={assets}
            avatars={avatars}
            voices={voices}
            videoNotice={videoNotice}
            platformDefaultLabel={copy.platformDefault}
            toggleSceneSelection={toggleSceneSelection}
            prepareVideo={prepareVideo}
            renderVideo={renderVideo}
            repairVideoScene={repairVideoScene}
            canRender={Boolean(selectedProjectId && prepareResult?.render_request && preparedSceneKeys.length > 0)}
            preparedSceneKeys={preparedSceneKeys}
          />
        ) : null}

        {tab === "files" ? (
          <FilesPanel
            projectName={projectName}
            projectScenes={projectScenes}
            files={files}
            storageGroups={storageGroups}
            rerunScene={rerunScene}
            mergeProject={mergeProject}
            bytes={bytes}
            formatDate={formatDate}
            openProjectFile={openProjectFile}
            downloadProjectFile={downloadProjectFile}
            renameProjectFile={renameProjectFile}
            deleteProjectFile={deleteProjectFile}
            fileInspector={fileInspector}
            setFileInspector={setFileInspector}
            saveProjectFileContent={saveProjectFileContent}
            fileOperationTarget={fileOperationTarget}
            fileOperationResult={fileOperationResult}
          />
        ) : null}

        {tab === "providers" ? (
          <ProvidersPanel
            providers={providers}
            providerGroups={providerGroups}
            providerNotice={providerNotice}
            editingProviderId={editingProviderId}
            providerForm={providerForm}
            setProviderForm={setProviderForm}
            startEditProvider={startEditProvider}
            removeProvider={removeProvider}
            testSavedProviderConnection={testSavedProviderConnection}
            applyStorageOption={applyStorageOption}
            applyVideoVendor={applyVideoVendor}
            saveProvider={saveProvider}
            testProviderDraftConnection={testProviderDraftConnection}
            resetProviderEditor={resetProviderEditor}
            startCreateStorageProvider={startCreateStorageProvider}
            getProviderConfigValue={getProviderConfigValue}
            setProviderConfigValue={setProviderConfigValue}
            applyStoragePolicyAction={applyStoragePolicyAction}
            applyStorageProvider={applyStorageProvider}
            providerEditorRef={providerEditorRef}
            workspaceProfile={workspaceProfile}
            storagePolicy={storagePolicy}
            storagePolicyResolved={storagePolicyResolved}
            storageProviderOptions={storageProviderOptions}
            videoVendors={videoVendors}
            formatDate={formatDate}
            isProviderReadOnly={isProviderReadOnly}
            editingProviderReadOnly={editingProviderReadOnly}
            cloneProviderAsEditable={cloneProviderAsEditable}
            providerTestResult={providerTestResult}
            providerTestTargetId={providerTestTargetId}
            testingProviderId={testingProviderId}
            testingProviderDraft={testingProviderDraft}
          />
        ) : null}


        {tab === "assets" ? (
          <AssetsPanel
            assets={assets}
            assetForm={assetForm}
            assetNotice={assetNotice}
            editingAssetId={editingAssetId}
            setAssetForm={setAssetForm}
            saveAsset={saveAsset}
            resetAssetEditor={resetAssetEditor}
            startEditAsset={startEditAsset}
            removeAsset={removeAsset}
            uploadAssetFile={uploadAssetFile}
            importAssetFromUrl={importAssetFromUrl}
            formatDate={formatDate}
          />
        ) : null}
        {tab === "costs" ? (
          <CostsPanel
            projects={projects}
            selectedProjectId={selectedProjectId}
            selectProject={setSelectedProjectId}
            costOverview={costOverview}
            costDetail={costDetail}
            projectName={projectName}
            formatDate={formatDate}
          />
        ) : null}

        {tab === "access" ? (
          <AccessGuidePanel
            textProviderGuides={textProviderGuides}
            videoProviderGuides={videoProviderGuides}
            workspaceGuide={workspaceGuide}
          />
        ) : null}

        {tab === "guide" ? <GuidePanel guideCapabilities={guideCapabilities} guideSteps={guideSteps} guideFaq={guideFaq} moduleCount={tabs.length} /> : null}
      </main>
    </div>
  );
}

export default App;
