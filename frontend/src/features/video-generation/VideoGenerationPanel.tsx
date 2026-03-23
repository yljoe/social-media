import { useMemo, useState } from "react";

import type {
  Asset,
  Provider,
  VideoCompositionPayload,
  VideoCompositionScene,
} from "../../shared/types/api";

type VideoFormState = {
  storyboard_text: string;
  avatar_asset_id: string;
  voice_asset_id: string;
  style_asset_id: string;
  duration: number;
  resolution: string;
  aspect_ratio: string;
  subtitle_enabled: boolean;
  subtitle_language: string;
  subtitle_font_family: string;
  subtitle_position: string;
  subtitle_color: string;
  subtitle_size: number;
  speed: number;
  execute_all: boolean;
  selected_scene_ids: string[];
  apply_scene1_to_all: boolean;
};

type RenderOutput = {
  scene_key?: string;
  run_id?: string;
  status?: string;
  output_files?: { mp4?: string; mp3?: string; srt?: string };
};

type Props = {
  videoForm: VideoFormState;
  setVideoForm: (value: VideoFormState) => void;
  videoComposition: VideoCompositionPayload;
  updateVideoComposition: (value: VideoCompositionPayload) => void;
  videoCompositionText: string;
  setVideoCompositionText: (value: string) => void;
  activeSceneId: string;
  setActiveSceneId: (value: string) => void;
  sceneRepairReason: string;
  setSceneRepairReason: (value: string) => void;
  defaultVideoProvider?: Provider;
  videoProviders: Provider[];
  renderOutputs: RenderOutput[];
  assets: Asset[];
  avatars: Asset[];
  voices: Asset[];
  toggleSceneSelection: (sceneKey: string) => void;
  prepareVideo: () => void;
  renderVideo: () => void;
  repairVideoScene: () => void;
  canRender: boolean;
  preparedSceneKeys: string[];
  videoNotice: string;
  platformDefaultLabel: string;
};

type PreviewTab = "scene" | "render" | "json";
type FieldRow = { key: string; value: string };

function toFieldRows(fields: Record<string, unknown>) {
  return Object.entries(fields ?? {}).map(([key, value]) => ({ key, value: String(value ?? "") }));
}

function fromFieldRows(rows: FieldRow[]) {
  return rows.reduce<Record<string, unknown>>((acc, row) => {
    const key = row.key.trim();
    if (!key) return acc;
    acc[key] = row.value.trim();
    return acc;
  }, {});
}

function renderStateLabel(scene: VideoCompositionScene) {
  const revision = scene.repair_state?.revision ?? 0;
  return revision > 0 ? `${scene.render_state} / 修正版 ${revision}` : scene.render_state;
}

export function VideoGenerationPanel({
  videoForm,
  setVideoForm,
  videoComposition,
  updateVideoComposition,
  videoCompositionText,
  setVideoCompositionText,
  activeSceneId,
  setActiveSceneId,
  sceneRepairReason,
  setSceneRepairReason,
  defaultVideoProvider,
  videoProviders,
  renderOutputs,
  assets,
  avatars,
  voices,
  toggleSceneSelection,
  prepareVideo,
  renderVideo,
  repairVideoScene,
  canRender,
  preparedSceneKeys,
  videoNotice,
  platformDefaultLabel,
}: Props) {
  const [previewTab, setPreviewTab] = useState<PreviewTab>("scene");
  const activeScene = videoComposition.scenes.find((scene) => scene.scene_id === activeSceneId) ?? videoComposition.scenes[0] ?? null;
  const selectedSceneIds = videoForm.execute_all ? videoComposition.scenes.map((scene) => scene.scene_id) : videoForm.selected_scene_ids;

  const groupedAssets = useMemo(
    () => ({
      all: assets,
      images: assets.filter((asset) => ["reference_image", "template", "style"].includes(asset.asset_type)),
      docs: assets.filter((asset) => ["reference_image", "template"].includes(asset.asset_type)),
    }),
    [assets],
  );

  function updateGlobal(patch: Partial<VideoCompositionPayload["global_settings"]>) {
    updateVideoComposition({
      ...videoComposition,
      global_settings: { ...videoComposition.global_settings, ...patch },
    });
  }

  function updateScene(sceneId: string, patch: Partial<VideoCompositionScene>) {
    updateVideoComposition({
      ...videoComposition,
      scenes: videoComposition.scenes.map((scene) => (scene.scene_id === sceneId ? { ...scene, ...patch } : scene)),
    });
  }

  function updateCast(castId: string, patch: Record<string, unknown>) {
    updateVideoComposition({
      ...videoComposition,
      cast_library: videoComposition.cast_library.map((cast) => (cast.cast_id === castId ? { ...cast, ...patch } : cast)),
    });
  }

  function updateBinding(bindingId: string, patch: Record<string, unknown>) {
    updateVideoComposition({
      ...videoComposition,
      scene_asset_pool: videoComposition.scene_asset_pool.map((binding) =>
        binding.asset_binding_id === bindingId ? { ...binding, ...patch } : binding,
      ),
    });
  }

  function toggleSceneRef(sceneId: string, field: "cast_refs" | "asset_refs", value: string) {
    const scene = videoComposition.scenes.find((item) => item.scene_id === sceneId);
    if (!scene) return;
    const current = scene[field] ?? [];
    updateScene(sceneId, {
      [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    } as Partial<VideoCompositionScene>);
  }

  function setGlobalCustomFields(rows: FieldRow[]) {
    updateGlobal({ custom_fields: fromFieldRows(rows) });
  }

  function setSceneCustomFields(sceneId: string, rows: FieldRow[]) {
    updateScene(sceneId, { custom_fields: fromFieldRows(rows) });
  }

  function applyJsonEdit() {
    try {
      const parsed = JSON.parse(videoCompositionText);
      if (!parsed || !Array.isArray(parsed.scenes)) {
        throw new Error("invalid");
      }
      updateVideoComposition(parsed as VideoCompositionPayload);
    } catch {
      window.alert("Composition JSON 格式無效，請先修正後再套用。");
    }
  }

  return (
    <section className="panel-page panel-page-management video-generation-layout">
      <article className="card management-card management-card-wide video-card-source">
        <div className="section-head">
          <div>
            <p>分鏡來源</p>
            <h3>Storyboard 與原始腳本</h3>
          </div>
          <span className="section-chip">{videoComposition.scenes.length} 幕</span>
        </div>
        <textarea
          className="tall-textarea"
          value={videoForm.storyboard_text}
          onChange={(event) => setVideoForm({ ...videoForm, storyboard_text: event.target.value })}
        />
      </article>

      <article className="card management-card management-card-wide video-card-settings">
        <div className="section-head">
          <div>
            <p>輸出設定</p>
            <h3>渲染參數與素材組合</h3>
          </div>
          <span className="section-chip">{videoComposition.global_settings.resolution}</span>
        </div>

        <div className="video-form-grid">
          <div className="inline-grid three">
            <label>
              總時長
              <input
                className="fixed-field"
                type="number"
                min={1}
                value={videoComposition.global_settings.duration_seconds}
                onChange={(event) => updateGlobal({ duration_seconds: Number(event.target.value) || 1 })}
              />
            </label>
            <label>
              每幕秒數
              <input
                className="fixed-field"
                type="number"
                min={1}
                value={videoComposition.global_settings.scene_duration_seconds}
                onChange={(event) => updateGlobal({ scene_duration_seconds: Number(event.target.value) || 1 })}
              />
            </label>
            <label>
              預設影片供應商
              <select
                className="fixed-field"
                value={videoComposition.global_settings.preferred_video_provider_id}
                onChange={(event) => updateGlobal({ preferred_video_provider_id: event.target.value })}
              >
                <option value="">{platformDefaultLabel}</option>
                {videoProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="inline-grid three">
            <label>
              解析度
              <input
                className="fixed-field"
                value={videoComposition.global_settings.resolution}
                onChange={(event) => updateGlobal({ resolution: event.target.value })}
              />
            </label>
            <label>
              長寬比
              <input
                className="fixed-field"
                value={videoComposition.global_settings.aspect_ratio}
                onChange={(event) => updateGlobal({ aspect_ratio: event.target.value })}
              />
            </label>
            <label>
              字型
              <input
                className="fixed-field"
                value={videoComposition.global_settings.font_family}
                onChange={(event) => updateGlobal({ font_family: event.target.value })}
              />
            </label>
          </div>

          <div className="inline-grid three">
            <label>
              字幕語言
              <input
                className="fixed-field"
                value={videoComposition.global_settings.subtitle_language}
                onChange={(event) => updateGlobal({ subtitle_language: event.target.value })}
              />
            </label>
            <label>
              字幕位置
              <input
                className="fixed-field"
                value={videoForm.subtitle_position}
                onChange={(event) => setVideoForm({ ...videoForm, subtitle_position: event.target.value })}
              />
            </label>
            <label>
              字幕顏色
              <input
                className="fixed-field"
                value={videoForm.subtitle_color}
                onChange={(event) => setVideoForm({ ...videoForm, subtitle_color: event.target.value })}
              />
            </label>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={videoComposition.global_settings.subtitle_enabled}
              onChange={(event) => updateGlobal({ subtitle_enabled: event.target.checked })}
            />
            <span>啟用字幕</span>
          </label>

          <div className="video-custom-field-block">
            <div className="video-subsection-head">
              <strong>全片自定義欄位</strong>
            </div>
            {toFieldRows(videoComposition.global_settings.custom_fields).map((row, index, rows) => (
              <div key={`${row.key}-${index}`} className="video-custom-field-row">
                <input
                  className="fixed-field"
                  value={row.key}
                  placeholder="欄位名稱"
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...next[index], key: event.target.value };
                    setGlobalCustomFields(next);
                  }}
                />
                <input
                  className="fixed-field"
                  value={row.value}
                  placeholder="欄位內容"
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...next[index], value: event.target.value };
                    setGlobalCustomFields(next);
                  }}
                />
              </div>
            ))}
            <button
              className="ghost-button"
              type="button"
              onClick={() => setGlobalCustomFields([...toFieldRows(videoComposition.global_settings.custom_fields), { key: "", value: "" }])}
            >
              新增自定義欄位
            </button>
          </div>
        </div>

        <div className="video-entity-list">
          <div className="video-entity-card">
            <div className="video-subsection-head">
              <strong>角色與聲音庫</strong>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  updateVideoComposition({
                    ...videoComposition,
                    cast_library: [
                      ...videoComposition.cast_library,
                      {
                        cast_id: `cast-${videoComposition.cast_library.length + 1}`,
                        name: `角色 ${videoComposition.cast_library.length + 1}`,
                        avatar_asset_id: "",
                        voice_asset_id: "",
                        role: "main",
                        notes: "",
                        custom_fields: {},
                      },
                    ],
                  })
                }
              >
                新增角色
              </button>
            </div>
            {videoComposition.cast_library.length === 0 ? <div className="empty-state small-empty">尚未建立角色，可加入雙人或三人角色組合。</div> : null}
            {videoComposition.cast_library.map((cast) => (
              <div key={cast.cast_id} className="inline-grid three">
                <label>
                  角色名稱
                  <input className="fixed-field" value={cast.name} onChange={(event) => updateCast(cast.cast_id, { name: event.target.value })} />
                </label>
                <label>
                  頭像素材
                  <select className="fixed-field" value={cast.avatar_asset_id} onChange={(event) => updateCast(cast.cast_id, { avatar_asset_id: event.target.value })}>
                    <option value="">{platformDefaultLabel}</option>
                    {avatars.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  聲音素材
                  <select className="fixed-field" value={cast.voice_asset_id} onChange={(event) => updateCast(cast.cast_id, { voice_asset_id: event.target.value })}>
                    <option value="">{platformDefaultLabel}</option>
                    {voices.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>

          <div className="video-entity-card">
            <div className="video-subsection-head">
              <strong>素材引用池</strong>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  updateVideoComposition({
                    ...videoComposition,
                    scene_asset_pool: [
                      ...videoComposition.scene_asset_pool,
                      {
                        asset_binding_id: `binding-${videoComposition.scene_asset_pool.length + 1}`,
                        asset_id: "",
                        label: `素材 ${videoComposition.scene_asset_pool.length + 1}`,
                        asset_type: "reference_image",
                        placement_hint: "inline",
                        notes: "",
                        source: "",
                        custom_fields: {},
                      },
                    ],
                  })
                }
              >
                新增素材引用
              </button>
            </div>
            {videoComposition.scene_asset_pool.length === 0 ? <div className="empty-state small-empty">可從素材庫引用圖片、表格截圖、Logo 或其它上傳素材。</div> : null}
            {videoComposition.scene_asset_pool.map((binding) => (
              <div key={binding.asset_binding_id} className="inline-grid three">
                <label>
                  引用名稱
                  <input className="fixed-field" value={binding.label} onChange={(event) => updateBinding(binding.asset_binding_id, { label: event.target.value })} />
                </label>
                <label>
                  選擇素材
                  <select
                    className="fixed-field"
                    value={binding.asset_id}
                    onChange={(event) => {
                      const asset = groupedAssets.all.find((item) => item.id === event.target.value);
                      updateBinding(binding.asset_binding_id, {
                        asset_id: event.target.value,
                        asset_type: asset?.asset_type ?? binding.asset_type,
                        source: asset?.file_path ?? "",
                      });
                    }}
                  >
                    <option value="">從素材庫選擇</option>
                    {groupedAssets.all.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  出現方式
                  <input className="fixed-field" value={binding.placement_hint} onChange={(event) => updateBinding(binding.asset_binding_id, { placement_hint: event.target.value })} />
                </label>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="card management-card management-card-wide video-card-scenes">
        <div className="section-head">
          <div>
            <p>Scene 編輯</p>
            <h3>每幕都能指定角色、素材與修正策略</h3>
          </div>
          <span className="section-chip">{selectedSceneIds.length} 幕待輸出</span>
        </div>

        <div className="video-scene-layout">
          <div className="video-scene-list">
            {videoComposition.scenes.map((scene) => (
              <button
                key={scene.scene_id}
                className={scene.scene_id === activeScene?.scene_id ? "video-scene-row active" : "video-scene-row"}
                type="button"
                onClick={() => setActiveSceneId(scene.scene_id)}
              >
                <strong>{scene.title || scene.scene_id}</strong>
                <span>{renderStateLabel(scene)} / {scene.duration_seconds} 秒</span>
              </button>
            ))}
          </div>

          {activeScene ? (
            <div className="video-scene-editor">
              <div className="video-subsection-head">
                <strong>目前編輯：{activeScene.title || activeScene.scene_id}</strong>
                <div className="inline-actions">
                  <button className="table-link-button" type="button" onClick={() => toggleSceneSelection(activeScene.scene_id)}>
                    {selectedSceneIds.includes(activeScene.scene_id) ? "取消輸出此幕" : "只輸出此幕"}
                  </button>
                  <button className="table-link-button" type="button" onClick={repairVideoScene} data-testid="video-repair-submit">
                    單獨修正此幕
                  </button>
                </div>
              </div>

              <div className="video-form-grid">
                <div className="inline-grid three">
                  <label>
                    場景標題
                    <input className="fixed-field" value={activeScene.title} onChange={(event) => updateScene(activeScene.scene_id, { title: event.target.value })} />
                  </label>
                  <label>
                    場景目標
                    <input className="fixed-field" value={activeScene.goal} onChange={(event) => updateScene(activeScene.scene_id, { goal: event.target.value })} />
                  </label>
                  <label>
                    場景秒數
                    <input className="fixed-field" type="number" min={1} value={activeScene.duration_seconds} onChange={(event) => updateScene(activeScene.scene_id, { duration_seconds: Number(event.target.value) || 1 })} />
                  </label>
                </div>

                <label>
                  視覺提示詞
                  <textarea className="field-textarea" value={activeScene.visual_prompt} onChange={(event) => updateScene(activeScene.scene_id, { visual_prompt: event.target.value })} />
                </label>

                <div className="inline-grid two">
                  <label>
                    旁白
                    <textarea className="field-textarea" value={activeScene.narration} onChange={(event) => updateScene(activeScene.scene_id, { narration: event.target.value })} />
                  </label>
                  <label>
                    字幕
                    <textarea className="field-textarea" value={activeScene.subtitle} onChange={(event) => updateScene(activeScene.scene_id, { subtitle: event.target.value })} />
                  </label>
                </div>

                <div className="video-reference-grid">
                  <div className="video-reference-panel">
                    <strong>本幕角色</strong>
                    {videoComposition.cast_library.map((cast) => (
                      <label key={cast.cast_id} className="video-reference-item">
                        <input type="checkbox" checked={activeScene.cast_refs.includes(cast.cast_id)} onChange={() => toggleSceneRef(activeScene.scene_id, "cast_refs", cast.cast_id)} />
                        <span>{cast.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="video-reference-panel">
                    <strong>本幕素材</strong>
                    {videoComposition.scene_asset_pool.map((binding) => (
                      <label key={binding.asset_binding_id} className="video-reference-item">
                        <input type="checkbox" checked={activeScene.asset_refs.includes(binding.asset_binding_id)} onChange={() => toggleSceneRef(activeScene.scene_id, "asset_refs", binding.asset_binding_id)} />
                        <span>{binding.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label>
                  單幕修正說明
                  <input
                    className="fixed-field"
                    value={sceneRepairReason}
                    onChange={(event) => setSceneRepairReason(event.target.value)}
                    placeholder="例如：加入表格特寫、角色改成雙人對話、字幕改用思源黑體"
                  />
                </label>

                <div className="video-custom-field-block">
                  <div className="video-subsection-head">
                    <strong>本幕自定義欄位</strong>
                  </div>
                  {toFieldRows(activeScene.custom_fields).map((row, index, rows) => (
                    <div key={`${row.key}-${index}`} className="video-custom-field-row">
                      <input
                        className="fixed-field"
                        value={row.key}
                        placeholder="欄位名稱"
                        onChange={(event) => {
                          const next = [...rows];
                          next[index] = { ...next[index], key: event.target.value };
                          setSceneCustomFields(activeScene.scene_id, next);
                        }}
                      />
                      <input
                        className="fixed-field"
                        value={row.value}
                        placeholder="欄位內容"
                        onChange={(event) => {
                          const next = [...rows];
                          next[index] = { ...next[index], value: event.target.value };
                          setSceneCustomFields(activeScene.scene_id, next);
                        }}
                      />
                    </div>
                  ))}
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => setSceneCustomFields(activeScene.scene_id, [...toFieldRows(activeScene.custom_fields), { key: "", value: "" }])}
                  >
                    新增本幕欄位
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state small-empty">目前沒有可編輯的分鏡。</div>
          )}
        </div>
      </article>

      <article className="card management-card management-card-wide video-output-stack">
        <div className="section-head">
          <div>
            <p>JSON 預覽</p>
            <h3>保留進階 JSON 編輯彈性</h3>
          </div>
          <button className="primary-button" type="button" onClick={applyJsonEdit}>
            套用 JSON 變更
          </button>
        </div>
        <textarea className="json-panel video-json-editor" value={videoCompositionText} onChange={(event) => setVideoCompositionText(event.target.value)} />
      </article>

      <article className="card management-card management-card-wide video-card-output">
        <div className="section-head">
          <div>
            <p>輸出預覽</p>
            <h3>渲染結果檢查</h3>
          </div>
          <span className="section-chip">{defaultVideoProvider?.name || "未指定影片供應商"}</span>
        </div>

        {videoNotice ? <div className="alert success compact-alert">{videoNotice}</div> : null}

        <div className="action-bar">
          <div className="action-copy">
            <strong>主操作</strong>
            <span>先產生 render request，再送出整批或單幕渲染。</span>
          </div>
          <div className="action-group">
            <button className="secondary-button" onClick={prepareVideo} type="button" data-testid="video-prepare-submit">
              產生渲染請求
            </button>
            <button className="primary-button generate-button" onClick={renderVideo} type="button" disabled={!canRender} data-testid="video-render-submit">
              送出影片渲染
            </button>
          </div>
        </div>

        {!canRender ? <div className="compact-alert">請先產生渲染請求，再送出影片渲染。</div> : null}

        <div className="preview-tab-row" role="tablist" aria-label="影片預覽切換">
          <button className={previewTab === "scene" ? "preview-tab active" : "preview-tab"} type="button" onClick={() => setPreviewTab("scene")}>
            分鏡摘要
          </button>
          <button className={previewTab === "render" ? "preview-tab active" : "preview-tab"} type="button" onClick={() => setPreviewTab("render")}>
            渲染輸出
          </button>
          <button className={previewTab === "json" ? "preview-tab active" : "preview-tab"} type="button" onClick={() => setPreviewTab("json")}>
            JSON
          </button>
        </div>

        <div className="preview-metrics">
          <div>
            <span>分鏡數</span>
            <strong>{videoComposition.scenes.length}</strong>
          </div>
          <div>
            <span>已準備</span>
            <strong>{preparedSceneKeys.length}</strong>
          </div>
          <div>
            <span>已輸出</span>
            <strong>{renderOutputs.length}</strong>
          </div>
        </div>

        {previewTab === "scene" ? (
          <ul className="preview-list">
            {videoComposition.scenes.map((scene) => (
              <li key={scene.scene_id}>
                <strong>{scene.title || scene.scene_id}</strong>
                <span>{scene.visual_prompt || scene.narration || "尚未填寫內容"}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {previewTab === "render" ? (
          <ul className="preview-list">
            {renderOutputs.length === 0 ? <li className="preview-empty">目前還沒有任何輸出結果。</li> : null}
            {renderOutputs.map((item, index) => (
              <li key={item.run_id || item.scene_key || `output-${index}`}>
                <strong>{item.scene_key || `scene_${index + 1}`}</strong>
                <span>{item.output_files?.mp4 || item.status || "尚未取得輸出檔案"}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {previewTab === "json" ? <pre className="json-panel">{videoCompositionText}</pre> : null}
      </article>
    </section>
  );
}
