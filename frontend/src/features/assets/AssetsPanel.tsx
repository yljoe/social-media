import { useMemo, useRef, useState, type ChangeEvent } from "react";

import type { Asset } from "../../shared/types/api";

type AssetFormState = {
  asset_type: "mail_template" | "storyboard_template" | "avatar" | "reference_image" | "voice" | "style_preset";
  name: string;
  content: string;
  file_path: string;
  status: "active" | "inactive";
  metadata_json: Record<string, unknown>;
};

type AssetCategoryKey = "all" | "template" | "avatar" | "reference_image" | "voice" | "style_preset";

type AssetsPanelProps = {
  assets: Asset[];
  assetForm: AssetFormState;
  editingAssetId: string;
  setAssetForm: (value: AssetFormState) => void;
  saveAsset: () => void;
  resetAssetEditor: () => void;
  startEditAsset: (asset: Asset) => void;
  removeAsset: (assetId: string) => void;
  uploadAssetFile: (file: File, assetType: Asset["asset_type"], name: string, status: Asset["status"]) => Promise<void>;
  importAssetFromUrl: (sourceUrl: string, assetType: Asset["asset_type"], name: string, status: Asset["status"]) => Promise<void>;
  formatDate: (value?: string) => string;
  assetNotice: string;
};

const assetCategoryButtons: Array<{ key: AssetCategoryKey; label: string; description: string }> = [
  { key: "all", label: "全部素材", description: "查看所有模板、頭像、參考圖片、聲音與風格素材。" },
  { key: "template", label: "模板", description: "包含郵件模板與分鏡模板，適合快速複用內容結構。" },
  { key: "avatar", label: "頭像", description: "角色形象、講師人物與替身頭像。" },
  { key: "reference_image", label: "參考圖片", description: "用來控制畫面風格、場景構圖與視覺方向。" },
  { key: "voice", label: "聲音", description: "旁白、角色聲線與語音資產。" },
  { key: "style_preset", label: "風格", description: "色調、字幕、品牌規範與整體視覺風格。" },
];

function assetTypeLabel(value: AssetFormState["asset_type"] | Asset["asset_type"]) {
  if (value === "mail_template") return "郵件模板";
  if (value === "storyboard_template") return "分鏡模板";
  if (value === "avatar") return "頭像";
  if (value === "reference_image") return "參考圖片";
  if (value === "voice") return "聲音";
  return "風格預設";
}

function assetStatusLabel(value: AssetFormState["status"] | Asset["status"]) {
  return value === "active" ? "啟用" : "停用";
}

function editorHeadline(assetType: AssetFormState["asset_type"]) {
  if (assetType === "mail_template") return "郵件模板編輯器";
  if (assetType === "storyboard_template") return "分鏡模板編輯器";
  if (assetType === "avatar") return "頭像編輯器";
  if (assetType === "reference_image") return "參考圖片編輯器";
  if (assetType === "voice") return "聲音編輯器";
  return "風格預設編輯器";
}

function libraryCategoryForAsset(assetType: Asset["asset_type"]): AssetCategoryKey {
  if (assetType === "mail_template" || assetType === "storyboard_template") return "template";
  if (assetType === "avatar") return "avatar";
  if (assetType === "reference_image") return "reference_image";
  if (assetType === "voice") return "voice";
  return "style_preset";
}

function acceptedTypes(assetType: AssetFormState["asset_type"]) {
  if (assetType === "mail_template" || assetType === "storyboard_template") return ".txt,.md,.json,.html,.csv,.xml,.yaml,.yml";
  if (assetType === "voice") return "audio/*,.mp3,.wav,.m4a,.aac";
  if (assetType === "avatar" || assetType === "reference_image") return "image/*,.png,.jpg,.jpeg,.webp";
  return ".json,.txt,.md,image/*";
}

function primarySourceHint(assetType: AssetFormState["asset_type"]) {
  if (assetType === "mail_template" || assetType === "storyboard_template") return "可直接貼上文字內容，也可匯入文字檔或遠端模板網址。";
  if (assetType === "voice") return "支援本機音訊檔與遠端音訊網址匯入。";
  if (assetType === "avatar" || assetType === "reference_image") return "支援本機圖片與遠端圖片網址匯入。";
  return "可上傳本機風格檔、圖片或透過網址匯入參考素材。";
}

function summarizeAsset(asset: Asset) {
  const body = asset.content?.trim();
  if (body) return body;
  return "已建立素材檔案來源，可在編輯器中補充說明與中繼資料。";
}

export function AssetsPanel({
  assets,
  assetForm,
  editingAssetId,
  setAssetForm,
  saveAsset,
  resetAssetEditor,
  startEditAsset,
  removeAsset,
  uploadAssetFile,
  importAssetFromUrl,
  formatDate,
  assetNotice,
}: AssetsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<AssetCategoryKey>("all");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const filteredAssets = useMemo(() => {
    const normalized = assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      const categoryMatched = selectedCategory === "all" ? true : libraryCategoryForAsset(asset.asset_type) === selectedCategory;
      if (!categoryMatched) return false;
      if (!normalized) return true;
      return [asset.name, asset.content, asset.file_path, assetTypeLabel(asset.asset_type)]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [assetSearch, assets, selectedCategory]);

  const categorySummary = assetCategoryButtons.find((item) => item.key === selectedCategory) ?? assetCategoryButtons[0];

  async function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadAssetFile(file, assetForm.asset_type, assetForm.name || file.name.replace(/\.[^.]+$/, ""), assetForm.status);
    event.target.value = "";
  }

  async function handleUrlImport() {
    if (!assetUrl.trim()) return;
    setImporting(true);
    try {
      await importAssetFromUrl(assetUrl.trim(), assetForm.asset_type, assetForm.name || "", assetForm.status);
      setAssetUrl("");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="panel-page panel-page-management">
      <article className="card management-card management-card-wide asset-library-card">
        <div className="section-head">
          <div>
            <p>Asset Library</p>
            <h3>素材資產庫</h3>
          </div>
          <span className="section-chip">{filteredAssets.length} 筆素材</span>
        </div>

        <div className="asset-category-strip" role="tablist" aria-label="素材分類">
          {assetCategoryButtons.map((item) => (
            <button
              key={item.key}
              className={item.key === selectedCategory ? "asset-category-button active" : "asset-category-button"}
              type="button"
              role="tab"
              aria-selected={item.key === selectedCategory}
              onClick={() => setSelectedCategory(item.key)}
              data-testid={`asset-category-${item.key}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="asset-library-search-panel">
          <label>
            素材搜尋
            <input
              className="fixed-field"
              type="search"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              data-testid="asset-search-input"
              placeholder="搜尋名稱、路徑、內容或類型…"
            />
          </label>
        </div>

        <div className="asset-library-summary-card">
          <strong className="truncate-single">{categorySummary.label}</strong>
          <span className="truncate-double">{categorySummary.description}</span>
        </div>

        <div className="asset-library-list">
          {filteredAssets.map((asset) => (
            <article key={asset.id} className="asset-row-card" data-testid={`asset-row-${asset.id}`}>
              <div className="asset-row-main">
                <div className="asset-row-heading">
                  <strong className="truncate-single">{asset.name}</strong>
                  <span className="section-chip">{assetTypeLabel(asset.asset_type)}</span>
                  <span className={asset.status === "active" ? "status-badge status-badge-active" : "status-badge status-badge-muted"}>
                    {assetStatusLabel(asset.status)}
                  </span>
                </div>
                <p className="truncate-double">{summarizeAsset(asset)}</p>
                <div className="asset-row-meta">
                  <span className="truncate-single">來源：{asset.file_path || "內嵌內容"}</span>
                  <span>更新：{formatDate(asset.updated_at)}</span>
                </div>
              </div>
              <div className="asset-row-actions">
                <button className="ghost-button" type="button" onClick={() => startEditAsset(asset)} data-testid={`asset-edit-${asset.id}`}>
                  編輯
                </button>
                <button className="ghost-button ghost-danger" type="button" onClick={() => removeAsset(asset.id)} data-testid={`asset-delete-${asset.id}`}>
                  刪除
                </button>
              </div>
            </article>
          ))}
          {filteredAssets.length === 0 ? <div className="empty-state">目前沒有符合條件的素材。</div> : null}
        </div>
      </article>

      <article className="card management-card asset-editor-card">
        <div className="section-head">
          <div>
            <p>Asset Editor</p>
            <h3>{editingAssetId ? `編輯素材：${assetForm.name || "未命名素材"}` : editorHeadline(assetForm.asset_type)}</h3>
          </div>
          <span className="section-chip">{assetTypeLabel(assetForm.asset_type)}</span>
        </div>

        {assetNotice ? <div className="alert success compact-alert">{assetNotice}</div> : null}

        <div className="asset-editor-layout">
          <div className="form-grid">
            <div className="inline-grid two">
              <label>
                素材類型
                <select
                  className="fixed-field"
                  value={assetForm.asset_type}
                  onChange={(event) => setAssetForm({ ...assetForm, asset_type: event.target.value as AssetFormState["asset_type"] })}
                  data-testid="asset-form-type"
                >
                  <option value="mail_template">郵件模板</option>
                  <option value="storyboard_template">分鏡模板</option>
                  <option value="avatar">頭像</option>
                  <option value="reference_image">參考圖片</option>
                  <option value="voice">聲音</option>
                  <option value="style_preset">風格預設</option>
                </select>
              </label>
              <label>
                狀態
                <select
                  className="fixed-field"
                  value={assetForm.status}
                  onChange={(event) => setAssetForm({ ...assetForm, status: event.target.value as AssetFormState["status"] })}
                  data-testid="asset-form-status"
                >
                  <option value="active">啟用</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
            </div>

            <label>
              名稱
              <input
                className="fixed-field"
                value={assetForm.name}
                onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })}
                placeholder="輸入素材名稱"
                data-testid="asset-form-name"
              />
            </label>

            <div className="asset-import-card">
              <div className="asset-import-head">
                <div>
                  <strong>素材匯入方式</strong>
                  <p>{primarySourceHint(assetForm.asset_type)}</p>
                </div>
                <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()} data-testid="asset-upload-trigger">
                  上傳本機檔案
                </button>
              </div>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept={acceptedTypes(assetForm.asset_type)}
                onChange={handleFilePick}
                data-testid="asset-file-input"
              />
              <div className="asset-url-import">
                <label>
                  從網址匯入
                  <input
                    className="fixed-field"
                    value={assetUrl}
                    onChange={(event) => setAssetUrl(event.target.value)}
                    placeholder="貼上素材網址"
                    data-testid="asset-form-source-url"
                  />
                </label>
                <button className="secondary-button" type="button" onClick={handleUrlImport} disabled={!assetUrl.trim() || importing}>
                  {importing ? "匯入中…" : "匯入網址"}
                </button>
              </div>
            </div>

            <label>
              說明內容
              <textarea
                className="field-textarea"
                value={assetForm.content}
                onChange={(event) => setAssetForm({ ...assetForm, content: event.target.value })}
                data-testid="asset-form-content"
                placeholder="描述素材用途、腳本內容、聲音設定或風格規則。"
              />
            </label>

            <label>
              檔案路徑
              <input
                className="fixed-field"
                value={assetForm.file_path}
                onChange={(event) => setAssetForm({ ...assetForm, file_path: event.target.value })}
                data-testid="asset-form-file-path"
                placeholder="例如 templates/phishing-mail.md"
              />
            </label>
          </div>

          <div className="action-row">
            <button className="primary-button" type="button" onClick={saveAsset} data-testid="asset-form-save">
              {editingAssetId ? "儲存變更" : "新增素材"}
            </button>
            <button className="ghost-button" type="button" onClick={resetAssetEditor}>
              清空表單
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
