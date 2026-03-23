type TextProviderGuide = {
  title: string;
  summary: string;
  fields: string[];
  docs: { label: string; href: string }[];
};

type VideoProviderGuide = {
  provider: string;
  auth: string;
  models: string[];
  fields: Array<{ label: string; value: string }>;
  notes: string[];
  docs: { label: string; href: string }[];
};

type WorkspaceGuide = {
  title: string;
  checklist: string[];
  docs: { label: string; href: string }[];
};

type AccessGuidePanelProps = {
  textProviderGuides: TextProviderGuide[];
  videoProviderGuides: VideoProviderGuide[];
  workspaceGuide: WorkspaceGuide;
};

export function AccessGuidePanel({ textProviderGuides, videoProviderGuides, workspaceGuide }: AccessGuidePanelProps) {
  return (
    <section className="panel-page panel-page-management">
      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>API 接入說明</p>
            <h3>整理模型、影片供應商與 Workspace 憑證的接入方式</h3>
          </div>
          <span className="section-chip">先看這頁再填設定</span>
        </div>

        <div className="guide-overview-grid">
          <div className="preview-block">
            <span>核心原則</span>
            <strong>先判斷是 API key、OAuth，還是服務帳戶，再去填對欄位</strong>
            <p>同事最容易卡住的不是 API 本身，而是憑證型態搞混。這頁把每種接法拆開說明，讓你知道去哪拿、該填哪些欄位、哪些欄位會跟供應商一起變動。</p>
          </div>
          <div className="preview-block">
            <span>使用順序</span>
            <strong>先決定供應商，再去填 model、基礎網址、建立任務路徑與查詢方式</strong>
            <p>影片供應商不是單看 API key 就能接好。像 Veo、Sora、SeedDance、Runway 都有自己的 model 名稱與任務路徑，建議先看這裡整理的範例再進 UI 實作。</p>
          </div>
        </div>
      </article>

      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>文本 LLM</p>
            <h3>文字模型 API 怎麼拿、要填哪些欄位</h3>
          </div>
        </div>
        <div className="access-guide-grid">
          {textProviderGuides.map((item) => (
            <section key={item.title} className="access-guide-card">
              <div className="access-guide-head">
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
              </div>
              <ul className="checklist-list">
                {item.fields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
              <div className="access-doc-links">
                {item.docs.map((doc) => (
                  <a key={doc.href} className="ghost-button access-link-button" href={doc.href} target="_blank" rel="noreferrer">
                    {doc.label}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>

      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>影片 API</p>
            <h3>以實際供應商說明哪些欄位會變動</h3>
          </div>
          <span className="section-chip">VEO / SORA / SEEDDANCE / RUNWAY</span>
        </div>
        <div className="video-guide-list">
          {videoProviderGuides.map((item) => (
            <section key={item.provider} className="video-guide-card">
              <div className="video-guide-header">
                <div>
                  <strong>{item.provider}</strong>
                  <p>{item.auth}</p>
                </div>
                <div className="video-guide-models">
                  {item.models.map((model) => (
                    <span key={model} className="section-chip">
                      {model}
                    </span>
                  ))}
                </div>
              </div>
              <div className="video-guide-fields">
                {item.fields.map((field) => (
                  <div key={`${item.provider}-${field.label}`} className="video-guide-field-row">
                    <span>{field.label}</span>
                    <code>{field.value}</code>
                  </div>
                ))}
              </div>
              <ul className="checklist-list">
                {item.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <div className="access-doc-links">
                {item.docs.map((doc) => (
                  <a key={doc.href} className="ghost-button access-link-button" href={doc.href} target="_blank" rel="noreferrer">
                    {doc.label}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>

      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>Google Workspace</p>
            <h3>說明什麼情況要用 OAuth，什麼情況該用服務帳戶</h3>
          </div>
        </div>
        <section className="access-guide-card">
          <div className="access-guide-head">
            <strong>{workspaceGuide.title}</strong>
          </div>
          <ul className="checklist-list">
            {workspaceGuide.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="access-doc-links">
            {workspaceGuide.docs.map((doc) => (
              <a key={doc.href} className="ghost-button access-link-button" href={doc.href} target="_blank" rel="noreferrer">
                {doc.label}
              </a>
            ))}
          </div>
        </section>
      </article>
    </section>
  );
}
