import { useMemo, useState } from "react";
import type { CostDetail, CostProjectOverview, Project } from "../../shared/types/api";

type CostsPanelProps = {
  projects: Project[];
  selectedProjectId: string;
  selectProject: (projectId: string) => void;
  costOverview: CostProjectOverview[];
  costDetail: CostDetail | null;
  projectName: string;
  formatDate: (value?: string) => string;
};

type LedgerViewMode = "overview" | "project";

function money(value: number | undefined) {
  return Number(value ?? 0).toFixed(4);
}

export function CostsPanel({
  projects,
  selectedProjectId,
  selectProject,
  costOverview,
  costDetail,
  projectName,
  formatDate,
}: CostsPanelProps) {
  const [projectSearch, setProjectSearch] = useState("");
  const [ledgerViewMode, setLedgerViewMode] = useState<LedgerViewMode>("project");

  const filteredProjects = useMemo(() => {
    const keyword = projectSearch.trim().toLowerCase();
    if (!keyword) return projects;
    return projects.filter((project) => `${project.name} ${project.description} ${project.status}`.toLowerCase().includes(keyword));
  }, [projectSearch, projects]);

  const recentProjects = useMemo(() => {
    const byProject = new Map(costOverview.map((item) => [item.project_id, item]));
    return projects
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5)
      .map((project) => ({
        project,
        overview: byProject.get(project.id) ?? {
          project_id: project.id,
          project_name: project.name,
          subtotal: 0,
          items: [],
        },
      }));
  }, [costOverview, projects]);

  const activeOverview = costOverview.find((item) => item.project_id === selectedProjectId) ?? null;
  const summaryCards = [
    { label: "文字生成成本", value: money(costDetail?.bom?.text_generation) },
    { label: "場景生成成本", value: money(costDetail?.bom?.scene_generation) + (costDetail?.bom?.scene_rerun ? ` / 重做 ${money(costDetail?.bom?.scene_rerun)}` : "") },
    { label: "專案合併成本", value: money(costDetail?.bom?.merge) },
    { label: "總成本", value: money(costDetail?.subtotal ?? activeOverview?.subtotal) },
  ];

  const ledgerPayload = ledgerViewMode === "overview" ? costOverview : costDetail ?? {};
  const ledgerTitle = ledgerViewMode === "overview" ? "總覽 Ledger JSON" : `${projectName} Ledger JSON`;

  return (
    <section className="panel-page panel-page-logs">
      <article className="card management-card management-card-wide">
        <div className="section-head">
          <div>
            <p>Cost Overview</p>
            <h3>費用與紀錄</h3>
          </div>
          <span className="section-chip">{projectName}</span>
        </div>

        <div className="costs-layout">
          <aside className="costs-sidebar-card">
            <div className="costs-sidebar-head">
              <div>
                <strong>最近 5 個專案</strong>
                <p>先看近期專案成本，再切換到指定專案。</p>
              </div>
            </div>

            <div className="costs-recent-list">
              {recentProjects.map(({ project, overview }) => (
                <button
                  key={project.id}
                  className={project.id === selectedProjectId ? "cost-project-chip active" : "cost-project-chip"}
                  type="button"
                  onClick={() => {
                    selectProject(project.id);
                    setLedgerViewMode("project");
                  }}
                  data-testid={`cost-recent-project-${project.id}`}
                >
                  <strong>{project.name}</strong>
                  <span>${money(overview.subtotal)}</span>
                  <small>{formatDate(project.updated_at)}</small>
                </button>
              ))}
            </div>

            <label>
              專案搜尋
              <input
                className="fixed-field"
                type="search"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                data-testid="cost-project-search"
                placeholder="搜尋專案名稱、描述或狀態…"
              />
            </label>

            <label>
              專案切換
              <select
                className="fixed-field"
                value={selectedProjectId}
                onChange={(event) => {
                  selectProject(event.target.value);
                  setLedgerViewMode("project");
                }}
                data-testid="cost-project-select"
              >
                <option value="">請選擇專案</option>
                {filteredProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </aside>

          <div className="costs-main-column">
            <div className="metric-strip metric-strip-four">
              {summaryCards.map((item) => (
                <div key={item.label} className="metric-card">
                  <span>{item.label}</span>
                  <strong>${item.value}</strong>
                </div>
              ))}
            </div>

            <article className="preview-document costs-ledger-card">
              <div className="preview-document-header">
                <div>
                  <span className="preview-document-kicker">Ledger JSON</span>
                  <strong>{ledgerTitle}</strong>
                </div>
                <div className="cost-json-toggle">
                  <button
                    className={ledgerViewMode === "overview" ? "ghost-button active-filter" : "ghost-button"}
                    type="button"
                    onClick={() => setLedgerViewMode("overview")}
                    data-testid="cost-ledger-overview"
                  >
                    查看總覽 JSON
                  </button>
                  <button
                    className={ledgerViewMode === "project" ? "ghost-button active-filter" : "ghost-button"}
                    type="button"
                    onClick={() => setLedgerViewMode("project")}
                    disabled={!selectedProjectId}
                    data-testid="cost-ledger-project"
                  >
                    查看專案 JSON
                  </button>
                </div>
              </div>
              <pre className="json-panel json-panel-fixed" data-testid="cost-ledger-json">{JSON.stringify(ledgerPayload, null, 2)}</pre>
            </article>
          </div>
        </div>
      </article>
    </section>
  );
}
