# AGENTS.md — 數位學伴系統開發規範

> **讀者是 AI 模型**（Claude Opus／Sonnet、Codex／GPT 等）。動這個資料夾的任何程式前，先讀完本文件。
> 上層制度（正本規則、歸檔規則、用詞風格）在 `../CLAUDE.md`，本文件只管數位學伴系統本身。
> 維護義務與 CLAUDE.md 相同：使用者拍板的規則變更，當場寫回本文件並在文末「事故與決策記錄」加一行。

## 0. 這個系統是什麼、為什麼它跟一般專案不一樣

這是「AI 識能工作坊」模組二的**課堂示範系統**：講師會在台上現場操作給大一學生看。它不是產品，最重要的品質指標只有一個——**示範當天、在講師的 MacBook 上、完整功能鏈一次跑通**。所以：

- 「在我機器上能跑」在這裡是**正經的驗收標準**，不是笑話。目標機器就是講師的 Mac。
- 穩定 > 優雅。能用小改動修好的，不要用大重構修好。
- 任何「順手升級」（依賴版本、Node 版本、框架）都是風險，沒有使用者點頭不做。

## 1. 架構速覽

```
frontend/  React+Vite（port 5173）── fetch ──▶ backend/  Express+TS（port 3000）
                                              ├─ data/app.db        SQLite（better-sqlite3, WAL）
                                              ├─ data/ai-settings.json  AI 模型設定（網頁面板寫入）
                                              ├─ services/scheduler  node-cron 每分鐘掃 reminders
                                              ├─ services/aiClient   AI 統一入口（依 endpoint 分流）
                                              │    ├─ claude-cli://…  → claudeCli.ts（spawn 本機 claude CLI，吃訂閱額度）
                                              │    └─ 其他 URL        → OpenAI 相容 /chat/completions
                                              └─ routes/line + LINE Messaging API（push＋webhook 回覆）
```

功能鏈（課堂示範的完整路徑）：表單／課表照片 → AI 產生規劃 → 使用者確認 → 寫入 SQLite → 排程器到點發 LINE → 學生在 LINE 回「完成／延後30分鐘／查看下一步」→ webhook 更新資料庫。

相鄰規範：AI 模型設定介面（三按鈕）的做法在 `../skill-ai-model-settings/SKILL.md`（含 macOS 權限地雷）；`study-buddy-reminder/` 是早期 JS 版，只留作歷史，**禁止開發**。

## 2. 不可違反的系統不變量（Invariants）

**I-1 時間政策：資料庫一律存「本地時間、無時區」字串**（`YYYY-MM-DDTHH:MM[:SS]`）。
適用 `reminders.remind_at`、`tasks.deadline`。任何要與之比對或寫入的「現在」，後端一律用 `backend/src/utils/time.ts`、前端一律用 `frontend/src/utils/time.ts`（兩檔政策相同）。**前後端都禁止對這些欄位用 `Date.prototype.toISOString()`**——它回傳 UTC，在台灣會差 8 小時（見事故 A-1、A-3）。datetime-local 輸入框的值本來就是本地格式，直接用字串收發，不要繞經 Date。想支援多時區？那是整體遷移，先問使用者。

**I-2 LINE 簽章必須算在原始 bytes 上**。`index.ts` 用 `express.json({ verify })` 把原始 body 存進 `req.rawBody`，`routes/line.ts` 拿它做 HMAC。**禁止自寫 middleware 先讀 request stream**（stream 只能讀一次，會讓 express.json 丟 `stream is not readable`、整條 webhook 500，見事故 A-2）；**禁止用 `JSON.stringify(req.body)` 重組後驗簽**（欄位順序不保證）。

**I-3 單人系統假設**。全系統假設只有一位使用者（講師），LINE 推播對象是 `.env` 的 `LINE_USER_ID`，`line_state` 一人一列。要改成多人是產品級改造，先問使用者。

**I-4 AI 呼叫只走 `services/aiClient.ts` 這一個入口**。不要在別處直接 fetch 模型 API 或 spawn claude。三種模型來源（訂閱制 CLI／外部雲端／本地 Ollama）的分流、逾時、錯誤訊息都集中在這裡。

**I-5 `data/app.db`（含 `-shm`、`-wal`）不可刪、不可搬**，裡面是示範用的真實資料。測試一律用暫存資料庫（`npm run check` 已示範：以 `DATABASE_URL` 環境變數指到 `check-tmp.db`）。

## 3. 驗證制度（把「驗證再宣稱」變成可執行的動作）

**改動 backend 後，必須在 backend/ 執行 `npm run check`，看到「✅ 全部通過」才能說「已完成」。**

它會做：tsc 型別檢查 → 起測試伺服器（port 3100、暫存 DB、不真發 LINE）→ 驗 webhook 簽章（對→200、錯→401）→ 建「提醒＝現在」的任務並等排程器真的把它送出（最多 75 秒）。第 3、4 項就是事故 A-1、A-2 的回歸測試。

`npm run check` **沒有涵蓋**、需要人工實測的三件事：真實 LINE 推播（需 ngrok＋LINE 官方帳號）、AI 模型實際呼叫（吃額度）、課表圖片辨識。課前彩排時人工跑一次完整鏈。

改 frontend 後：`npm run dev` 起兩端，實際點過一輪主流程（建任務→確認→看清單），最後 `npm run build` 更新 dist（單一伺服器模式吃的是它）。

給在受限沙盒工作的 AI：單一指令有秒數上限時，可先跑 `tsc --noEmit`，再帶 `CHECK_SKIP_TSC=1` 跑其餘三關（分段驗證）；正式驗收一律完整跑。

## 4. 課前保命規則（操作版）

工作坊前一週內：
1. 只修「示範會當場失敗」等級的 bug；其他問題記進本文件第 6 節，不動手。
2. 每次改動後 `npm run check` ＋ 人工跑一次完整功能鏈。
3. 改動前確認 git 乾淨（`git status`），改完立刻 commit。出事退回：`git checkout 課堂展示版-202607 -- .`（或最近的乾淨 commit）。
4. 禁止：升級依賴、動 node_modules、改 Node 版本、重構、「順手美化」。

## 5. 環境與啟動（含已知地雷）

- **單一伺服器模式（課堂示範用，2026-07-07 起）**：backend 會自動供應 `frontend/dist` 打包成品，所以只要跑 backend `npm run dev`（port 3000，需 `.env`，樣板在 `.env.example`），開 http://localhost:3000 就是完整系統。**改了 frontend 程式碼後，必須在 frontend/ 跑 `npm run build` 重新打包**，否則 3000 埠看到的還是舊版——這是本模式唯一的坑。
- 開發前端時仍照舊開兩個伺服器：frontend `npm run dev`（port 5173，vite 即時更新，經 proxy 轉發 API）。
- CORS 只允許 localhost:5173／127.0.0.1:5173，前端換 port 要同步改 `index.ts`；單一伺服器模式同源、不經 CORS。
- `better-sqlite3` 是原生模組，**綁定安裝時的作業系統與 Node 版本**。在講師 Mac 上編譯的版本，換 Node 大版本或在別的機器（如 Linux 沙盒）會直接掛（`invalid ELF header`／`NODE_MODULE_VERSION` 錯誤）。這是「課前不准升級 Node、不准重灌 node_modules」的技術原因。AI 模型在沙盒驗證時：把 src 複製出去另外 `npm install`，**不要動使用者資料夾裡的 node_modules**。
- 訂閱制 Claude 走本機 `claude` CLI：GUI 啟動的程序常拿不到 shell 的 PATH，`claudeCli.ts` 的 `findClaude()` 有一串候選路徑；圖片辨識用 `--permission-mode bypassPermissions`（headless 沒人按確認），原因與風險評估寫在 `claudeCli.ts` 註解，改動前先讀。
- LINE webhook 本機測試需 ngrok 之類的隧道；沒有隧道時 push 提醒仍可用，只有「回覆」進不來。

## 6. 已知限制與待辦（非致命，動手前先問使用者）

- `POST /api/tasks/plan` 對 `deadline` 沒驗證格式，壞值會讓提示詞出現「距今約 NaN 天」。
- LINE 回覆固定回給 `.env` 的 `LINE_USER_ID`，且用 push API（有月額度上限）而非免費的 reply token。單人示範夠用。
- `handleLineReply` 的「查看下一步」拿的是整個任務第一個未完成步驟，不是「該提醒對應步驟的下一步」。行為可接受，屬設計簡化。
- 錯誤處理散在各 route 的 try/catch，沒有統一 error middleware。現況夠用。
- 前端 `dist/` 是舊建置產物，示範用 `npm run dev`，不依賴它。

## 7. 給接手 AI 的工作順序

1. 讀 `../CLAUDE.md`（制度）→ 讀本文件 → 需要動 AI 設定介面再讀 `../skill-ai-model-settings/SKILL.md`。
2. `git status` 確認起點乾淨；動手；`npm run check`；人工驗證受影響的流程。
3. commit（訊息寫「改了什麼＋為什麼」，中文）；重大節點打 tag。
4. 有規則變更 → 寫回本文件與 `../CLAUDE.md` 決策記錄。你的記憶不會留下，這兩份文件會。

## 事故與決策記錄

| 編號 | 日期 | 內容 |
|---|---|---|
| A-1 | 2026-07-07 | **致命 bug**：排程器用 `toISOString()`（UTC）比對本地時間的 `remind_at`，LINE 提醒晚 8 小時；snooze 寫回 UTC 又讓提醒提早 8 小時。修法：新增 `src/utils/time.ts` 統一本地時間格式，訂為不變量 I-1，`npm run check` 第 4 項為回歸測試。教訓：**混用「有時區」與「無時區」時間表示法的系統，遲早在時區差上爆炸；政策要文件化，不能靠每個人自己小心。** |
| A-2 | 2026-07-07 | **致命 bug**：自寫 middleware 先讀 `/webhook` 的 request stream，express.json 對同一請求再讀一次 → 所有 webhook 一律 500，學生 LINE 回覆功能整條失效；且簽章算在 `JSON.stringify(req.body)` 上本來就不可靠。修法：改用 `express.json({ verify })` 保存原始 bytes，訂為不變量 I-2，`npm run check` 第 3 項為回歸測試。教訓：**「還沒被觸發到」的程式路徑等於沒測過；關鍵路徑要有自動化測試，不能靠「上次示範有過」。** |
| A-3 | 2026-07-07 | **bug（A-1 同家族）**：前端四個元件用 `toISOString()` 處理提醒／截止時間——編輯框顯示早 8 小時、存檔再早 8 小時（每編輯一次就偏移一次）、延後按鈕同病。修法：新增 `frontend/src/utils/time.ts`（與後端同政策），datetime-local 直接用字串收發。教訓：**同一個時間政策必須前後端各有一個守門檔案，且寫進不變量；只修一端，另一端遲早把它弄髒。** |
| D-1 | 2026-07-07 | 建立本文件（AGENTS.md，Codex 系模型會自動讀取此檔名）；建立 git 版本控制與 `npm run check` 驗證制度（使用者拍板）。 |
| D-3 | 2026-07-07 | 新增任務建立後的編輯功能（使用者要求）：任務詳情頁可編輯任務基本資料（新 API `PUT /api/tasks/:id`，白名單欄位）與單則提醒時間（沿用 `PUT /api/tasks/reminders/:id`；改時間時一併把 status 拉回 pending，讓排程器重新發送）。 |
| D-2 | 2026-07-07 | 新增單一伺服器模式：backend 直接供應 frontend/dist，課堂示範只需開一個伺服器（使用者要求）。前端 API 本來就走相對路徑 `/api`，同源即可運作。同日從 `study-buddy-reminder/.env` 救回 LINE 金鑰重建 `backend/.env`（TOKEN 與 USER_ID 已填，CHANNEL_SECRET 原本就空，webhook 簽章驗證會跳過——單人本機示範可接受，若要補上請至 LINE Developers Console 抄 Channel secret）。 |
| D-4 | 2026-09-02 | **整合 CLIProxyAPI**：為避免學生端安裝 Claude Code CLI 的終端機相容性地雷，整合 `router-for-me/CLIProxyAPI` 作為本地代理。`npm run dev` 啟動時自動檢查並拉起 CLIProxyAPI（port 8317），後端統一走標準 OpenAI-compatible API（`http://localhost:8317/v1`），免裝 Claude Code CLI。 |
