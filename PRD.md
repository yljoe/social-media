# PRD

## 產品定位

這是一個內部工作台，用來把社交工程演練內容從規劃、定稿、影片執行到檔案與成本追蹤串成一條流程。

目標不是單純聊天生成，而是提供一個可管理、可審核、可追蹤的 workflow console。

## 核心模組

### 1. 專案管理

- 專案 CRUD
- 搜尋與清單檢視
- 多筆勾選與批次聚焦
- 專案狀態與最後更新時間

### 2. 內容生成

- 輸入 `Task Input`
- 產出 `Storyboard / Email / Quiz`
- JSON 草稿可編輯
- schema 導向的內容定稿

### 3. 影片生成

- 讀取已確認的 storyboard
- 建立 render request
- 呼叫影片供應商
- scene rerun / merge

### 4. Provider 管理

- 文字模型 provider
- 影片模型 provider
- 個人工作設定檔
- vendor-aware 連線測試

### 5. Assets / Files / Costs

- 素材管理
- 專案檔案檢視
- 成本與 ledger

## 主要流程

1. 建立或選擇專案
2. 在內容生成頁填入 `Task Input`
3. 產出並編輯 `Storyboard / Email / Quiz`
4. 確認 JSON 草稿
5. 送到影片生成模組
6. 執行 scene render
7. merge 成最終影片
8. 檢視檔案、provider logs 與成本

## 內容契約

目前平台以這幾種主要 payload 為核心：

- `TaskInput`
- `StoryboardPayload`
- `EmailPayload`
- `QuizPayload`
- `MetadataPayload`
- `CostSummaryPayload`

影片供應商部分則以平台內部統一格式接到不同 vendor adapter，而不是直接暴露各家原生 API 差異。

## 目前已落地的方向

- 專案管理獨立頁面
- 內容生成改為定稿工作台
- 影片供應商 adapter 基礎層
- `openai_sora / google_veo / seedance / runway` 連線測試
- SQL 設定保留在 server side，不從 UI 管理

## 保留的後續方向

- 真實 Google Drive / Supabase 整合
- SQL runtime switch / migration
- 更完整的影片供應商 create / poll / result adapter
- auth / RBAC
