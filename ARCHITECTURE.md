# Architecture Map

## Purpose

這份文件是 repo 的快速查找地圖，用來定位功能頁、API、storage 寫入位置、資料表寫入責任，以及之後 subagent 分工時的入口點。

## Top-Level Structure

- `frontend/`: React + Vite 單頁應用
- `backend/`: FastAPI + SQLite
- `backend/data/storage/`: 預設本機 artifact root
- `backend/data/gdrive_mock/`: Google Drive mock root
- `backend/data/supabase_mock/`: Supabase mock root

## Frontend Map

### Entry

- `frontend/src/main.tsx`: React mount point
- `frontend/src/App.tsx`: app shell、導航、頁面切換與高層狀態

### Shared

- `frontend/src/shared/api/client.ts`: 共用 API client
- `frontend/src/shared/types/api.ts`: 共用 DTO 與前後端契約型別

### Feature Panels

- `frontend/src/features/projects/ProjectManagementPanel.tsx`: 專案 CRUD、搜尋、勾選與批次檢視
- `frontend/src/features/projects/ProjectTextPanel.tsx`: `Task Input -> Storyboard / Email / Quiz -> JSON 草稿`
- `frontend/src/features/video-generation/VideoGenerationPanel.tsx`: video prepare / render / merge 工作區
- `frontend/src/features/providers/ProvidersPanel.tsx`: provider CRUD、連線測試、storage policy 相關 UI
- `frontend/src/features/assets/AssetsPanel.tsx`: 素材管理
- `frontend/src/features/files/FilesPanel.tsx`: 檔案與 rerun / merge 入口
- `frontend/src/features/costs/CostsPanel.tsx`: 成本與 ledger 檢視
- `frontend/src/features/guide/GuidePanel.tsx`: 使用說明

## Backend Map

### Entry

- `backend/app/main.py`: FastAPI app、CORS、router bootstrap

### Routers

- `backend/app/routers/__init__.py`: `/api` bootstrap 與 `/health`
- `backend/app/routers/projects.py`: project CRUD、text generate、video prepare / render、rerun、merge、provider logs、project files
- `backend/app/routers/providers.py`: provider CRUD、provider test、provider health、video vendor catalog、storage policy
- `backend/app/routers/assets.py`: asset CRUD
- `backend/app/routers/costs.py`: cost summary 與 project cost detail

### Services

- `backend/app/services/project_flow.py`: project lookup 與 workflow 共用查詢
- `backend/app/services/text_service.py`: TaskInput、Storyboard、Email、Quiz 生成
- `backend/app/services/video_service.py`: storyboard parse / render request 前處理
- `backend/app/services/provider_service.py`: provider lookup、health check、provider test、呼叫 adapter、storage provider helper
- `backend/app/services/video_vendor_registry.py`: 影片供應商 catalog 與預設值
- `backend/app/services/video_vendor_adapters.py`: vendor-aware create / poll / normalize / probe
- `backend/app/services/storage_service.py`: storage binding、artifact 寫入、rebind、list files
- `backend/app/services/cost_service.py`: ledger 與成本計算

### Persistence

- `backend/app/db.py`: SQLite 連線、schema bootstrap、default seed data
- `backend/app/config.py`: data root、價格常數、SQL 預留設定

## API Map

### Health

- `GET /api/health` -> `backend/app/routers/__init__.py`

### Projects

- `GET /api/projects` -> `backend/app/routers/projects.py`
- `POST /api/projects` -> `backend/app/routers/projects.py`
- `GET /api/projects/{project_id}` -> `backend/app/routers/projects.py`
- `PUT /api/projects/{project_id}` -> `backend/app/routers/projects.py`
- `DELETE /api/projects/{project_id}` -> `backend/app/routers/projects.py`
- `POST /api/projects/{project_id}/text-generate` -> `backend/app/routers/projects.py`
- `POST /api/projects/{project_id}/video-prepare` -> `backend/app/routers/projects.py`
- `POST /api/projects/{project_id}/video-render` -> `backend/app/routers/projects.py`
- `POST /api/projects/{project_id}/scenes/{scene_key}/rerun` -> `backend/app/routers/projects.py`
- `POST /api/projects/{project_id}/merge` -> `backend/app/routers/projects.py`
- `GET /api/projects/{project_id}/files` -> `backend/app/routers/projects.py`
- `GET /api/projects/{project_id}/provider-logs` -> `backend/app/routers/projects.py`
- `POST /api/projects/{project_id}/storage/rebind` -> `backend/app/routers/projects.py`

### Providers

- `GET /api/providers` -> `backend/app/routers/providers.py`
- `POST /api/providers` -> `backend/app/routers/providers.py`
- `PUT /api/providers/{provider_id}` -> `backend/app/routers/providers.py`
- `DELETE /api/providers/{provider_id}` -> `backend/app/routers/providers.py`
- `POST /api/providers/test` -> `backend/app/routers/providers.py`
- `POST /api/providers/{provider_id}/test` -> `backend/app/routers/providers.py`
- `GET /api/providers/{provider_id}/health` -> `backend/app/routers/providers.py`
- `GET /api/providers/video-vendors` -> `backend/app/routers/providers.py`
- `GET /api/storage-policy` -> `backend/app/routers/providers.py`
- `POST /api/storage-policy/apply` -> `backend/app/routers/providers.py`

### Assets

- `GET /api/assets` -> `backend/app/routers/assets.py`
- `POST /api/assets` -> `backend/app/routers/assets.py`
- `PUT /api/assets/{asset_id}` -> `backend/app/routers/assets.py`
- `DELETE /api/assets/{asset_id}` -> `backend/app/routers/assets.py`

### Costs

- `GET /api/costs` -> `backend/app/routers/costs.py`
- `GET /api/costs/{project_id}` -> `backend/app/routers/costs.py`

## Storage Map

### Project Artifact Structure

- `input/`: request inputs 與原始文字
- `text/`: `storyboard.json`、`mail.json`、`mail_preview.html`、`quiz.json`
- `scenes/`: per-scene video / subtitle / audio outputs
- `video/`: merge 後的影片與 manifest
- `control/`: render request、summary、provider call snapshot

### Main Write Paths

- Text generation -> `backend/app/routers/projects.py` + `backend/app/services/storage_service.py`
- Video prepare -> `control/render_request.json`
- Video render -> `scenes/*` 與 `control/scene_render_summary.json`
- Merge -> `video/*` 與 `video/merge_manifest.json`

### Storage Policy

- Data artifacts: 優先 Supabase，否則 local
- Video artifacts: 優先 Google Drive，否則 local
- Local storage 永遠是 fallback

## Database Map

### Tables

- `projects`
- `provider_configs`
- `asset_records`
- `text_generation_jobs`
- `storyboard_scenes`
- `scene_render_runs`
- `scene_outputs`
- `merge_jobs`
- `final_videos`
- `cost_ledgers`
- `storage_bindings`
- `provider_call_logs`
- `storage_policies`

### Main Writers

- `projects` -> project routes
- `provider_configs` -> provider CRUD routes
- `asset_records` -> asset CRUD routes
- `text_generation_jobs` / `storyboard_scenes` -> text generation flow
- `scene_render_runs` / `scene_outputs` -> video render flow
- `merge_jobs` / `final_videos` -> merge flow
- `cost_ledgers` -> `cost_service.py`
- `storage_bindings` / `storage_policies` -> `storage_service.py`
- `provider_call_logs` -> `provider_service.py`

## Bug Triage Guide

### UI 問題

先看：

- `frontend/src/App.tsx`
- 對應的 `frontend/src/features/**`

### API 問題

先看：

- `backend/app/routers/**`

### Workflow 問題

先看：

- `backend/app/routers/projects.py`
- `backend/app/services/text_service.py`
- `backend/app/services/video_service.py`
- `backend/app/services/cost_service.py`

### Provider / Adapter 問題

先看：

- `backend/app/services/provider_service.py`
- `backend/app/services/video_vendor_registry.py`
- `backend/app/services/video_vendor_adapters.py`

### Storage / File 問題

先看：

- `backend/app/services/storage_service.py`
- `backend/app/services/provider_service.py`

### Data / Schema 問題

先看：

- `backend/app/db.py`
- `backend/app/schemas.py`
