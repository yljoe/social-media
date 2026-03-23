type GuideStep = {
  title: string;
  detail: string;
};

type GuideFaqItem = {
  title: string;
  detail: string;
};

type GuidePanelProps = {
  guideCapabilities: string[];
  guideSteps: GuideStep[];
  guideFaq: GuideFaqItem[];
  moduleCount: number;
};

export function GuidePanel({ guideCapabilities, guideSteps, guideFaq, moduleCount }: GuidePanelProps) {
  return (
    <section className="panel-page panel-page-guide">
      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>操作總覽</p>
            <h3>平台工作流程與模組定位</h3>
          </div>
          <span className="section-chip">{moduleCount} 個模組</span>
        </div>

        <div className="guide-overview-grid">
          <div className="preview-block">
            <span>適合誰使用</span>
            <strong>給需要快速管理專案、生成內容、送出影片並檢查成本的同事使用</strong>
            <p>這份指南整理的是平台的操作順序與模組分工。先把工作設定檔和專案整理好，再進入內容生成、影片生成、檔案管理與成本紀錄，能讓整體流程保持清楚。</p>
          </div>
          <div className="preview-block">
            <span>這版重點</span>
            <strong>工作設定檔、專案管理與影片規劃器都已拆成更清楚的責任區</strong>
            <p>工作設定檔現在獨立成單獨面板，專案管理只處理專案本身；影片生成則保留 JSON 編修，同時支援多角色、多素材與單幕修正。</p>
          </div>
        </div>
      </article>

      <article className="card management-card">
        <div className="section-head">
          <div>
            <p>目前能力</p>
            <h3>這個平台現在可以做什麼</h3>
          </div>
        </div>
        <div className="selection-grid">
          {guideCapabilities.map((item) => (
            <div key={item} className="selection-card selection-card-static">
              <div className="selection-card-spacer" />
              <div>
                <strong>{item}</strong>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>建議流程</p>
            <h3>依這個順序操作最不容易出錯</h3>
          </div>
          <span className="section-chip">{guideSteps.length} 步</span>
        </div>
        <div className="guide-step-list">
          {guideSteps.map((step, index) => (
            <div key={step.title} className="guide-step-card">
              <div className="guide-step-index">{index + 1}</div>
              <div className="guide-step-copy">
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>常見問題</p>
            <h3>第一次使用前最常會問的事</h3>
          </div>
        </div>
        <div className="guide-faq-grid">
          {guideFaq.map((item) => (
            <div key={item.title} className="selection-card selection-card-static">
              <div className="selection-card-spacer" />
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
