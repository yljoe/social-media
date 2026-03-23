# 社交工程內容生成平台

這個 repo 是一個以 React + Vite 前端、FastAPI 後端組成的內部工作台，目的是把社交工程演練內容的規劃、產出、影片執行、資產管理與成本追蹤放在同一個平台內完成。

## 目前功能

- 專案管理：專案建立、編輯、刪除、搜尋、批次勾選檢視。
- 內容生成：輸入 `Task Input`，產出 `Storyboard / Email / Quiz`，並可編輯 JSON 草稿。
- 影片生成：依定稿的 storyboard 產生 render request，送往影片供應商。
- Provider 管理：管理文字模型、影片模型與個人工作設定檔。
- Assets / Files / Costs：管理素材、檔案與成本資料。

## 技術堆疊

- Frontend: React + TypeScript + Vite
- Backend: FastAPI
- Database: SQLite
- Storage: local-first，保留 Google Drive / Supabase / SQL 擴充接口

## 主要文件

- [ARCHITECTURE.md](C:\Users\alvin\Desktop\社交工程內容生成平台\ARCHITECTURE.md)
  - 功能對應檔案、API map、storage map、DB map
- [OWNERSHIP.md](C:\Users\alvin\Desktop\社交工程內容生成平台\OWNERSHIP.md)
  - subagent 分工規則與 hot file 邊界
- [SQL_SETUP_GUIDE.md](C:\Users\alvin\Desktop\社交工程內容生成平台\SQL_SETUP_GUIDE.md)
  - 之後切換自有 SQL 時的保留設定
- [PRD.md](C:\Users\alvin\Desktop\社交工程內容生成平台\PRD.md)
  - 目前產品範圍與流程說明

## 啟動方式

### Backend

```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

預設開啟：

- `http://localhost:5173`

## 驗證指令

### Backend

```powershell
python -m compileall backend\app
python -m unittest backend.tests.test_api_smoke backend.tests.test_workflow
```

### Frontend

```powershell
cd frontend
npm test -- --run
npm run build
```

## 目前保留的延伸方向

- 真實 Google Drive / Supabase 整合
- SQL runtime switch 與 migration
- 更完整的 provider adapter
- auth / RBAC
