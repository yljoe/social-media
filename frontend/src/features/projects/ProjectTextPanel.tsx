import { useState } from "react";

import type { CostSummaryPayload, EmailPayload, Provider, QuizPayload, StoryboardScene, TaskInput } from "../../shared/types/api";

type TextFormState = {
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
};

type ProjectTextPanelProps = {
  projectName: string;
  projectStatus: string;
  hasProject: boolean;
  latestStoryboard: StoryboardScene[];
  latestMail: EmailPayload | null;
  latestQuiz: QuizPayload | null;
  latestCost: number;
  taskInput: TaskInput | null;
  costSummary: CostSummaryPayload | null;
  textForm: TextFormState;
  setTextForm: (value: TextFormState) => void;
  textProviders: Provider[];
  defaultTextProviderLabel: string;
  runTextGenerate: () => void;
  storyboardDraftText: string;
  setStoryboardDraftText: (value: string) => void;
  openVideoGeneration: () => void;
  storyboardDraftValid: boolean;
  contentNotice: string;
};

type PreviewTab = "storyboard" | "mail" | "quiz" | "json";

function costLabel(costSummary: CostSummaryPayload | null, latestCost: number) {
  if (costSummary) return `${costSummary.currency} ${costSummary.grand_total.toFixed(4)}`;
  return `$${Number(latestCost).toFixed(4)}`;
}

export function ProjectTextPanel({
  projectName,
  projectStatus,
  hasProject,
  latestStoryboard,
  latestMail,
  latestQuiz,
  latestCost,
  taskInput,
  costSummary,
  textForm,
  setTextForm,
  textProviders,
  defaultTextProviderLabel,
  runTextGenerate,
  storyboardDraftText,
  setStoryboardDraftText,
  openVideoGeneration,
  storyboardDraftValid,
  contentNotice,
}: ProjectTextPanelProps) {
  const [previewTab, setPreviewTab] = useState<PreviewTab>("storyboard");
  const resolvedSceneCount =
    textForm.scene_count > 0 ? textForm.scene_count : Math.max(1, Math.ceil(textForm.total_duration_seconds / textForm.scene_duration_seconds));

  return (
    <section className="panel-page panel-page-generation text-generation-layout">
      <article className="card card-tight text-card-project">
        <div className="section-head section-head-compact">
          <div>
            <p>內容工作流</p>
            <h3>目前專案摘要</h3>
          </div>
          <span className="section-chip">{projectName}</span>
        </div>
        <div className="project-summary-grid">
          <div className="metric-card">
            <span>專案名稱</span>
            <strong>{hasProject ? projectName : "尚未選擇專案"}</strong>
          </div>
          <div className="metric-card">
            <span>專案狀態</span>
            <strong>{hasProject ? projectStatus : "請先建立或選擇專案"}</strong>
          </div>
          <div className="metric-card">
            <span>目前內容成本</span>
            <strong>${Number(latestCost).toFixed(4)}</strong>
          </div>
        </div>
      </article>

      <article className="card card-tight text-card-input">
        <div className="section-head section-head-compact">
          <div>
            <p>任務輸入</p>
            <h3>生成條件設定</h3>
          </div>
          <span className="section-chip">{textForm.text_model}</span>
        </div>

        <div className="hint-banner">
          <strong>輸入建議</strong>
          <span>若只有主題可先填主題與情境；若已有完整文章，可直接貼上原文，系統會依內容生成更穩定的分鏡、郵件與測驗。</span>
        </div>

        <div className="form-grid">
          <div className="inline-grid two">
            <label>
              輸入模式
              <select className="fixed-field" value={textForm.input_mode} onChange={(event) => setTextForm({ ...textForm, input_mode: event.target.value })}>
                <option value="topic">主題</option>
                <option value="article">完整文章</option>
              </select>
            </label>
            <label>
              文字模型
              <input className="fixed-field" value={textForm.text_model} onChange={(event) => setTextForm({ ...textForm, text_model: event.target.value })} />
            </label>
          </div>

          <label>
            主題
            <input className="fixed-field" value={textForm.topic} onChange={(event) => setTextForm({ ...textForm, topic: event.target.value })} />
          </label>

          <label>
            情境設定
            <textarea className="field-textarea" value={textForm.scenario} onChange={(event) => setTextForm({ ...textForm, scenario: event.target.value })} />
          </label>

          <label>
            來源文章或腳本素材
            <textarea className="field-textarea field-textarea-lg" value={textForm.raw_text} onChange={(event) => setTextForm({ ...textForm, raw_text: event.target.value })} />
          </label>

          <div className="inline-grid three">
            <label>
              目標受眾
              <input className="fixed-field" value={textForm.target_audience} onChange={(event) => setTextForm({ ...textForm, target_audience: event.target.value })} />
            </label>
            <label>
              輸出語言
              <input className="fixed-field" value={textForm.language} onChange={(event) => setTextForm({ ...textForm, language: event.target.value as "zh-TW" })} />
            </label>
            <label>
              影片風格
              <input className="fixed-field" value={textForm.video_style} onChange={(event) => setTextForm({ ...textForm, video_style: event.target.value as "comic" })} />
            </label>
          </div>

          <div className="inline-grid two">
            <label>
              執行模式
              <select
                className="fixed-field"
                value={textForm.run_mode}
                onChange={(event) =>
                  setTextForm({
                    ...textForm,
                    run_mode: event.target.value as "full" | "single_scene",
                    scene_id: event.target.value === "single_scene" ? textForm.scene_id || "scene_001" : null,
                  })
                }
              >
                <option value="full">完整生成</option>
                <option value="single_scene">單一分鏡</option>
              </select>
            </label>
            <label>
              指定分鏡 ID
              <input
                className="fixed-field"
                placeholder="scene_001"
                value={textForm.scene_id ?? ""}
                onChange={(event) => setTextForm({ ...textForm, scene_id: event.target.value || null })}
                disabled={textForm.run_mode !== "single_scene"}
              />
            </label>
          </div>

          <div className="inline-grid three">
            <label>
              影片總時長（秒）
              <input className="fixed-field" type="number" min={1} value={textForm.total_duration_seconds} onChange={(event) => setTextForm({ ...textForm, total_duration_seconds: Number(event.target.value) || 1 })} />
            </label>
            <label>
              每段秒數
              <input className="fixed-field" type="number" min={1} value={textForm.scene_duration_seconds} onChange={(event) => setTextForm({ ...textForm, scene_duration_seconds: Number(event.target.value) || 1 })} />
            </label>
            <label>
              分鏡段數
              <input className="fixed-field" type="number" min={0} value={textForm.scene_count} onChange={(event) => setTextForm({ ...textForm, scene_count: Number(event.target.value) || 0 })} />
            </label>
          </div>

          <div className="inline-grid two">
            <label>
              預算上限
              <input
                className="fixed-field"
                type="number"
                min={0}
                step="0.01"
                value={textForm.budget_limit.max_total_cost}
                onChange={(event) =>
                  setTextForm({
                    ...textForm,
                    budget_limit: { ...textForm.budget_limit, max_total_cost: Number(event.target.value) || 0 },
                  })
                }
              />
            </label>
            <label>
              幣別
              <input
                className="fixed-field"
                value={textForm.budget_limit.currency}
                onChange={(event) =>
                  setTextForm({
                    ...textForm,
                    budget_limit: { ...textForm.budget_limit, currency: event.target.value || "USD" },
                  })
                }
              />
            </label>
          </div>

          <label>
            文字供應商
            <select className="fixed-field" value={textForm.text_provider_id} onChange={(event) => setTextForm({ ...textForm, text_provider_id: event.target.value })}>
              <option value="">{defaultTextProviderLabel}</option>
              {textProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <article className="card card-tight text-card-options">
        <div className="section-head section-head-compact">
          <div>
            <p>產出範圍</p>
            <h3>輸出內容選擇</h3>
          </div>
        </div>

        <div className="selection-grid output-scope-grid">
          <label className="selection-card">
            <input type="checkbox" checked={textForm.generate_storyboard} onChange={(event) => setTextForm({ ...textForm, generate_storyboard: event.target.checked })} />
            <div>
              <strong>分鏡腳本</strong>
              <span>生成可編輯的分鏡 JSON，作為後續影片生成的正式輸入。</span>
            </div>
          </label>
          <label className="selection-card">
            <input type="checkbox" checked={textForm.generate_mail} onChange={(event) => setTextForm({ ...textForm, generate_mail: event.target.checked })} />
            <div>
              <strong>郵件內容</strong>
              <span>產出主旨、預覽摘要、內文與 CTA，供演練郵件直接使用。</span>
            </div>
          </label>
          <label className="selection-card">
            <input type="checkbox" checked={textForm.generate_quiz} onChange={(event) => setTextForm({ ...textForm, generate_quiz: event.target.checked })} />
            <div>
              <strong>測驗題組</strong>
              <span>產出題目、選項、答案與解析，作為課後驗證內容。</span>
            </div>
          </label>
        </div>

        <div className="hint-banner">
          <strong>分鏡規劃摘要</strong>
          <span>
            預計生成 <strong>{resolvedSceneCount}</strong> 段，總長 <strong>{textForm.total_duration_seconds}</strong> 秒。若段數填 0，系統會依總時長與每段秒數自動計算。
          </span>
        </div>

        {contentNotice ? <div className="alert success compact-alert">{contentNotice}</div> : null}

        <div className="action-bar">
          <div className="action-copy">
            <strong>主操作</strong>
            <span>先產生草稿並確認 JSON，通過後再送往影片生成模組。</span>
          </div>
          <button className="primary-button generate-button" type="button" onClick={runTextGenerate} disabled={!hasProject} data-testid="text-generate-submit">
            產生草稿
          </button>
        </div>
      </article>

      <div className="panel-preview-stack text-preview-stack">
        <article className="card panel-preview-card text-card-preview">
          <div className="section-head">
            <div>
              <p>草稿審核</p>
              <h3>內容預覽與確認</h3>
            </div>
            <span className="section-chip">{costLabel(costSummary, latestCost)}</span>
          </div>

          <div className="preview-tab-row" role="tablist" aria-label="內容草稿切換">
            <button className={previewTab === "storyboard" ? "preview-tab active" : "preview-tab"} type="button" onClick={() => setPreviewTab("storyboard")}>
              分鏡
            </button>
            <button className={previewTab === "mail" ? "preview-tab active" : "preview-tab"} type="button" onClick={() => setPreviewTab("mail")}>
              郵件
            </button>
            <button className={previewTab === "quiz" ? "preview-tab active" : "preview-tab"} type="button" onClick={() => setPreviewTab("quiz")}>
              測驗
            </button>
            <button className={previewTab === "json" ? "preview-tab active" : "preview-tab"} type="button" onClick={() => setPreviewTab("json")}>
              JSON
            </button>
          </div>

          {previewTab === "storyboard" ? (
            <div className="preview-document">
              <div className="preview-document-header">
                <span className="preview-document-kicker">分鏡腳本</span>
                <strong>{taskInput?.topic || projectName}</strong>
              </div>
              <div className="storyboard-list">
                {latestStoryboard.length > 0 ? (
                  latestStoryboard.map((scene, index) => (
                    <article key={scene.scene_id || `scene-${index}`} className="storyboard-scene-card">
                      <div className="storyboard-scene-head">
                        <strong>{scene.scene_id || `scene_${index + 1}`}</strong>
                        <span>{scene.duration_seconds} 秒</span>
                      </div>
                      <h4>{scene.goal}</h4>
                      <p>{scene.narration}</p>
                      <small>{scene.visual_prompt}</small>
                    </article>
                  ))
                ) : (
                  <div className="empty-state-card">
                    <strong>尚未產生分鏡草稿</strong>
                    <span>完成上方設定後，這裡會顯示可編輯的分鏡草稿。</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {previewTab === "mail" ? (
            <div className="preview-document">
              {latestMail ? (
                <>
                  <div className="preview-document-header">
                    <span className="preview-document-kicker">郵件草稿</span>
                    <strong>{latestMail.subject}</strong>
                  </div>
                  <p>{latestMail.preview_text}</p>
                  <pre className="json-panel">{latestMail.body_text}</pre>
                </>
              ) : (
                <div className="empty-state-card">
                  <strong>尚未產生郵件內容</strong>
                  <span>勾選郵件內容並重新生成後，這裡會顯示主旨、預覽與內文。</span>
                </div>
              )}
            </div>
          ) : null}

          {previewTab === "quiz" ? (
            <div className="preview-document">
              {latestQuiz ? (
                <div className="storyboard-list">
                  {latestQuiz.items.map((question, index) => (
                    <article key={`${question.question}-${index}`} className="storyboard-scene-card">
                      <div className="storyboard-scene-head">
                        <strong>第 {index + 1} 題</strong>
                        <span>答案：{question.answer}</span>
                      </div>
                      <h4>{question.question}</h4>
                      <ul className="preview-list">
                        {question.options.map((option) => (
                          <li key={option}>
                            <span>{option}</span>
                          </li>
                        ))}
                      </ul>
                      <small>{question.explanation}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state-card">
                  <strong>尚未產生測驗題組</strong>
                  <span>勾選測驗題組並重新生成後，這裡會顯示題目、選項與解析。</span>
                </div>
              )}
            </div>
          ) : null}

          {previewTab === "json" ? (
            <div className="preview-document">
              <div className="preview-document-header">
                <span className="preview-document-kicker">可編輯 JSON</span>
                <strong>分鏡 JSON 定稿區</strong>
              </div>
              <span>你可以直接調整分鏡段落、秒數與文案，這份 JSON 會作為影片生成的正式輸入。</span>
              <textarea className="field-textarea tall-textarea" value={storyboardDraftText} onChange={(event) => setStoryboardDraftText(event.target.value)} />
              <div className={storyboardDraftValid ? "alert success compact-alert" : "alert error compact-alert"}>
                {storyboardDraftValid ? "分鏡 JSON 格式正確，可以送進影片生成。" : "分鏡 JSON 格式有誤，請先修正後再送出。"}
              </div>
              <button className="primary-button" type="button" onClick={openVideoGeneration} disabled={!storyboardDraftValid} data-testid="open-video-generation">
                套用到影片生成
              </button>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
