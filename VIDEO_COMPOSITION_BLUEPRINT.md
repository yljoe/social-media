# 影片規劃編輯器藍圖

## 目標

把目前的「輸出設定 / 渲染參數」升級成真正可落地的影片規劃編輯器，支援：

- 多角色、多聲音
- 每個分鏡可綁定自己的素材
- 可從素材庫或上傳檔案引用圖片、表格、Logo、參考圖
- 保留 `JSON edit`，但不讓同事被迫直接改 raw JSON
- 工作設定檔真的能控制預設規格
- 可單獨修正某一條切片 / 某一幕，不必整支影片全部重跑

---

## 1. 資料結構設計

### 1.1 設計原則

- 一般使用者主要操作 UI，不直接碰 raw JSON
- 系統把 UI 狀態轉成 canonical JSON
- 進階使用者仍可在 `JSON edit` 模式做精修
- 固定欄位負責核心流程
- `custom_fields` 負責未來擴充
- 分鏡層必須支援單獨修正、單獨重做、單獨送 API

### 1.2 工作設定檔要控制的預設值

`workspace_profiles.settings_json` 應擴充成真正的影片規劃預設組合，至少包含：

- `default_language`
- `default_target_audience`
- `default_text_provider_id`
- `default_video_provider_id`
- `default_total_duration_seconds`
- `default_scene_duration_seconds`
- `default_resolution`
- `default_aspect_ratio`
- `default_subtitle_enabled`
- `default_subtitle_language`
- `default_font_family`
- `default_render_style_asset_id`
- `default_asset_provider_role`
- `default_document_provider_role`

範例：

```json
{
  "default_language": "zh-TW",
  "default_target_audience": "企業內部員工",
  "default_text_provider_id": "",
  "default_video_provider_id": "",
  "default_total_duration_seconds": 24,
  "default_scene_duration_seconds": 8,
  "default_resolution": "1280x720",
  "default_aspect_ratio": "16:9",
  "default_subtitle_enabled": true,
  "default_subtitle_language": "繁體中文",
  "default_font_family": "Noto Sans TC",
  "default_render_style_asset_id": "",
  "default_asset_provider_role": "google-drive",
  "default_document_provider_role": "supabase-storage"
}
```

### 1.3 Canonical JSON

影片規劃編輯器最終應輸出一份 canonical `video_composition` JSON：

```json
{
  "project_id": "uuid",
  "workspace_profile": "shared",
  "composition_version": "v2",
  "global_settings": {
    "duration_seconds": 24,
    "scene_duration_seconds": 8,
    "resolution": "1280x720",
    "aspect_ratio": "16:9",
    "subtitle_enabled": true,
    "subtitle_language": "繁體中文",
    "font_family": "Noto Sans TC",
    "preferred_video_provider_id": "",
    "preferred_video_model": ""
  },
  "cast_library": [
    {
      "cast_id": "host-a",
      "name": "角色 A",
      "avatar_asset_id": "asset-avatar-a",
      "voice_asset_id": "asset-voice-a",
      "role": "main",
      "notes": "",
      "custom_fields": {}
    }
  ],
  "scene_asset_pool": [
    {
      "asset_binding_id": "binding-1",
      "asset_id": "asset-slide-1",
      "label": "表格截圖",
      "asset_type": "reference_image",
      "placement_hint": "fullscreen",
      "custom_fields": {}
    }
  ],
  "scenes": [
    {
      "scene_id": "scene-1",
      "sequence": 1,
      "title": "開場說明",
      "goal": "說明本段任務目標",
      "duration_seconds": 8,
      "narration": "",
      "subtitle": "",
      "visual_prompt": "",
      "cast_refs": ["host-a"],
      "asset_refs": ["binding-1"],
      "custom_fields": {
        "font_family": "思源黑體"
      },
      "repair_state": {
        "revision": 1,
        "last_repair_reason": "",
        "last_repair_at": null
      }
    }
  ],
  "custom_fields": {
    "project_style_note": "正式簡報風"
  }
}
```

### 1.4 固定欄位與自定義欄位

固定欄位負責：

- 分鏡順序
- 角色
- 聲音
- 素材
- 旁白 / 字幕
- 畫面提示
- 解析度 / 比例
- 影片長度

`custom_fields` 負責：

- 不想每次改前後端才新增的擴充欄位
- 可放全片、角色、素材池、單一 scene

例子：

- `font_family = 思源黑體`
- `subtitle_outline_color = #0A2342`
- `camera_mood = 正式簡報風`
- `animation_density = low`

### 1.5 分鏡層素材與角色綁定

必須明確分兩層：

- `scene_asset_pool`
  全片可用素材池
- `scene.asset_refs`
  單一分鏡實際引用哪些素材

角色也同理：

- `cast_library`
  全片角色 / 聲音庫
- `scene.cast_refs`
  單一分鏡實際使用哪些角色

### 1.6 單獨修正一條切片 / 單幕重做

這個能力應該是正式資料結構的一部分，不是臨時按鈕。

建議新增：

- `scene.repair_state`
  記錄該幕被修正過幾次、最後一次原因、最後時間
- `scene.render_state`
  記錄該幕目前是 `draft / ready / queued / rendering / done / failed`
- `composition_patch_requests[]`
  記錄針對單一 scene 的修正任務

範例：

```json
{
  "patch_id": "patch-scene-2-001",
  "scene_id": "scene-2",
  "mode": "single_scene_repair",
  "reason": "角色口型不自然",
  "fields_changed": ["visual_prompt", "cast_refs", "custom_fields.font_family"],
  "status": "queued",
  "created_at": "2026-03-23T10:00:00Z"
}
```

這樣之後可以做到：

- 只改第 3 幕
- 只重送第 3 幕給影片模型
- 不重做其它已完成的 scenes
- 保留整支影片的 canonical JSON 一致性

---

## 2. UI 藍圖

### 2.1 主頁結構

影片生成模組應改成真正的影片規劃工作台，建議區塊順序：

1. `分鏡來源`
2. `全片設定`
3. `角色與聲音庫`
4. `素材池`
5. `Scene 編輯清單`
6. `自定義欄位`
7. `JSON 預覽 / JSON 編輯`
8. `渲染執行`
9. `渲染結果檢查`

### 2.2 全片設定

負責全片共同規格：

- 影片總秒數
- 每幕秒數
- 解析度
- 長寬比
- 字幕
- 字幕語言
- 預設字型
- 預設影片供應商 / 模型

這一區應顯示：

- 目前工作設定檔帶入的預設值
- 使用者是否手動覆寫

### 2.3 角色與聲音庫

不能再只是一組 avatar + 一組 voice。

每個角色至少有：

- 名稱
- avatar / reference image
- voice
- 角色備註
- 自定義欄位

支援：

- 單人
- 雙人對話
- 三人以上
- 同角色共用 voice
- 同角色在不同 scene 使用不同素材

### 2.4 素材池

素材池要能匯入：

- 素材庫既有素材
- 本機上傳檔案
- URL 匯入素材

每個素材綁定至少有：

- label
- 類型
- placement hint
- 備註
- 自定義欄位

### 2.5 Scene 編輯清單

每個 scene 應該都可編輯：

- 標題
- 目標
- narration
- subtitle
- visual_prompt
- 使用角色
- 使用素材
- 每幕 custom_fields

每個 scene 列需要有明確按鈕：

- `編輯此幕`
- `使用目前設定重做此幕`
- `複製此幕設定`
- `只送出此幕`
- `查看此幕 JSON`

### 2.6 單獨修正此幕的 UI 流程

這個能力應獨立可見，不要藏在 JSON 裡。

建議每個 scene 都有：

- `單獨修正此幕`
- `重做此幕`
- `保留其它幕不變`

點下後流程：

1. 把該幕展開到 scene editor
2. 顯示目前 render 狀態與最後一次修正原因
3. 使用者只改這一幕的角色 / 素材 / prompt / custom_fields
4. 按 `只重送此幕`
5. 系統建立 `single_scene_repair` patch request
6. 完成後更新該幕 render 結果，不改其它已完成 scenes

### 2.7 自定義欄位

這一區應是可視化 editor：

- 新增欄位
- 選欄位範圍
  - 全片
  - 某一角色
  - 某個素材綁定
  - 某一幕
- 支援 `string / number / boolean`

### 2.8 JSON 預覽 / JSON 編輯

`JSON edit` 必須保留，但定位要清楚：

- 預設顯示 `JSON 預覽`
- 進階模式才切到 `JSON 編輯`
- 編輯後要做 schema 驗證
- 驗證通過才允許回寫 UI

這樣同事不用直接碰 raw JSON，但進階使用者仍有彈性。

---

## 3. 前後端實作順序

### Phase 0：先補 schema

建立新的 canonical 結構：

- `global_settings`
- `cast_library`
- `scene_asset_pool`
- `scenes`
- `custom_fields`
- `composition_patch_requests`

檔案：

- `backend/app/schemas.py`
- `frontend/src/shared/types/api.ts`

### Phase 1：工作設定檔真正連動

擴充 `workspace_profiles.settings_json`，讓它真的控制：

- 預設影片規格
- 預設文字 / 影片 provider
- 預設字型
- 預設素材與文件 storage 角色

檔案：

- `backend/app/db.py`
- `backend/app/routers/workspace_profiles.py`
- `frontend/src/App.tsx`

### Phase 2：多角色 / 多素材資料層

把單一 `avatar / voice` 改成：

- `cast_library[]`
- `scene_asset_pool[]`
- `scene.cast_refs[]`
- `scene.asset_refs[]`

檔案：

- `frontend/src/features/video-generation/VideoGenerationPanel.tsx`
- `backend/app/services/video_service.py`

### Phase 3：Scene 編輯器 UI

補完整的 scene-level editor，讓一般使用者不用碰 JSON 也能完成 90% 編輯。

最少支援：

1. 每幕角色綁定
2. 每幕素材綁定
3. 每幕自定義欄位

### Phase 4：自定義欄位系統

把 `custom_fields` 正式做成 UI editor，並做 schema 驗證。

### Phase 5：JSON editor 雙向同步

做到：

- UI -> canonical JSON
- JSON -> UI
- schema validator
- 錯誤提示
- 結構修正

### Phase 6：單獨修正一條切片

這一階段專門落地「單幕修正」能力：

- 建立 `single_scene_repair` request schema
- scene 列新增 `單獨修正此幕 / 只重送此幕`
- backend 支援只送單一 scene 給 render adapter
- 回寫該 scene 的 render 狀態與結果
- 保留其它 scenes 不變

這一階段完成後，才算真的可用於實戰修片。

### Phase 7：送影片模型 API

流程固定成：

`UI -> canonical composition JSON -> normalized render request -> vendor adapter`

`single_scene_repair` 則走：

`scene editor -> scene patch request -> single scene render -> patch back to composition`

### Phase 8：測試

最少要補：

- schema serialize / parse 測試
- 工作設定檔預設值套用測試
- 多角色 / 多素材 / custom_fields 測試
- 單幕修正測試
- JSON 編輯回寫測試
- E2E：
  - 新增 2 個角色
  - 指定 1 個 scene 使用表格素材
  - 單獨重做第 2 幕
  - 檢查其它 scenes 不變

---

## 結論

這個模組不應再只是「渲染參數表單」，而應該升級成：

- 可視化影片規劃器
- 多角色 / 多素材 / 多分鏡編輯器
- 保留 JSON edit 的進階模式
- 與工作設定檔連動
- 支援單獨修正一條切片，不必整支影片全部重跑

這樣同事可以用 UI 完成大多數操作，進階使用者仍保有 JSON 彈性，而真正的修片流程也能落地。
