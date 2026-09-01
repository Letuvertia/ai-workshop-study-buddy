# 📚 數位學伴 — 個人任務規劃系統

讓 AI 幫你拆解任務、安排時程，並透過 LINE 在對的時間提醒你。

---

## 📁 專案結構

```
數位學伴/
├── backend/          ← Node.js + Express + TypeScript 後端
│   ├── src/
│   │   ├── db/           # 資料庫（SQLite）
│   │   ├── routes/       # API 路由
│   │   │   ├── tasks.ts  # 任務 CRUD + AI 規劃
│   │   │   └── line.ts   # LINE Webhook
│   │   ├── services/
│   │   │   ├── llm.ts        # 呼叫本機 LLM
│   │   │   ├── lineService.ts # 傳送 LINE 訊息
│   │   │   └── scheduler.ts  # 定時提醒
│   │   ├── types/        # TypeScript 型別
│   │   └── index.ts      # 主程式
│   ├── data/             # 資料庫檔案（自動建立）
│   └── .env.example      # 環境變數範本
│
├── frontend/         ← React + TypeScript 前端
│   ├── src/
│   │   ├── api/          # API 呼叫函式
│   │   ├── components/   # React 元件
│   │   └── types/        # TypeScript 型別
│   └── ...
│
└── README.md
```

---

## 🚀 第一次安裝

### 前置需求

- **Node.js 18+**：https://nodejs.org （建議安裝 LTS 版本）
- **本機 LLM**：[Ollama](https://ollama.com)（推薦）或 [LM Studio](https://lmstudio.ai)

---

### Step 1：安裝 Ollama（本機 LLM）

1. 到 https://ollama.com 下載並安裝 Ollama
2. 開啟終端機，下載一個語言模型（約 4～8 GB）：
   ```bash
   ollama pull llama3
   ```
3. 啟動 Ollama（通常安裝後會自動在背景執行）：
   ```bash
   ollama serve
   ```
4. 測試是否正常：開瀏覽器前往 http://localhost:11434

---

### Step 2：安裝後端

```bash
# 進入 backend 資料夾
cd backend

# 安裝套件
npm install

# 複製環境變數範本
cp .env.example .env
```

---

### Step 3：填寫後端 .env

用文字編輯器（例如 VSCode、記事本）打開 `backend/.env`，填入以下資訊：

```env
PORT=3000
DATABASE_URL=./data/app.db

# Ollama 的 API 網址（保持預設即可）
LOCAL_LLM_API_URL=http://localhost:11434/v1/chat/completions
LOCAL_LLM_MODEL=llama3

# LINE Bot 相關（先跳過，之後再填）
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_USER_ID=
```

> 💡 如果用 **LM Studio**，把 API URL 改成：
> `LOCAL_LLM_API_URL=http://localhost:1234/v1/chat/completions`
> 並把 MODEL 改成你載入的模型名稱

---

### Step 4：安裝前端

```bash
# 進入 frontend 資料夾
cd ../frontend

# 安裝套件
npm install
```

---

## ▶️ 啟動系統

需要開兩個終端機視窗：

**終端機 1：啟動後端**
```bash
cd backend
npm run dev
```
看到「🚀 數位學伴後端已啟動！」表示成功。

**終端機 2：啟動前端**
```bash
cd frontend
npm run dev
```
看到「Local: http://localhost:5173」表示成功。

然後用瀏覽器開啟：**http://localhost:5173**

---

## ⚙ 設定 AI 模型（三按鈕面板）

網頁右下角有一顆「⚙ AI 模型」按鈕，點開後可以選三種模型來源，不用再手動編輯 `.env`：

- **🖥️ 自建／本地模型**：跑 Ollama／LM Studio，資料不出本機，適合機敏資料。多數情況不用填任何東西。
- **🟢 外部雲端模型**：貼上雲端服務（例如 Gemini）的 API Key 即可。
- **➕ 訂閱制 Claude**：吃你本機已登入的 Claude Code 訂閱額度，免 API Key；面板會偵測登入狀態，未登入可一鍵開終端機登入。**注意：這條路徑的資料會送到 Anthropic 雲端，跟外部雲端一樣不算「本機」，機敏資料請改用自建／本地模型。**

設定完可以按「測試連線」實際 ping 一次模型，成功後按「儲存設定」即可（存在 `backend/data/ai-settings.json`，重啟系統仍會保留；還沒設定過時會沿用 `.env` 的 `LOCAL_LLM_API_URL`／`LOCAL_LLM_MODEL`）。

---

## 📱 設定 LINE Bot

> 如果你只想在網頁使用，不需要 LINE 提醒，可以跳過這個步驟。

### Step 1：建立 LINE Bot

1. 前往 https://developers.line.biz/console/
2. 登入你的 LINE 帳號
3. 點選「Create a new provider」，輸入名稱
4. 點選「Create a Messaging API channel」
5. 填寫必填欄位（Channel name 等），建立完成

### Step 2：取得憑證

在你的 Channel 設定頁面：

1. **Channel Secret**：在「Basic settings」分頁，找到「Channel secret」
2. **Channel Access Token**：在「Messaging API」分頁，點選「Issue」產生

### Step 3：取得你的 LINE User ID

1. 在「Messaging API」分頁，找到「Bot basic ID」（例如 @abc1234）
2. 用 LINE 掃描 QR Code，加入你自己的 Bot 為好友
3. 在「Basic settings」分頁，找到「Your user ID」（格式像 Uxxxxxxxxxx）

### Step 4：把憑證填入 .env

```env
LINE_CHANNEL_SECRET=你的_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=你的_access_token
LINE_USER_ID=U你的_user_id
```

填好後重新啟動後端：
```bash
# 按 Ctrl+C 停止，再重新啟動
npm run dev
```

---

## 🌐 設定 ngrok（讓 LINE 連到你的本機）

LINE Webhook 需要一個可以從外網存取的 HTTPS 網址，ngrok 可以把你的本機暫時對外開放。

### Step 1：安裝 ngrok

前往 https://ngrok.com 下載安裝，並用 GitHub 帳號登入後取得 Auth Token。

```bash
ngrok authtoken 你的token
```

### Step 2：啟動 ngrok

在第三個終端機視窗執行：
```bash
ngrok http 3000
```

你會看到類似這樣的輸出：
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

### Step 3：設定 LINE Webhook URL

1. 複製 ngrok 給的 HTTPS 網址
2. 前往 LINE Developers Console → 你的 Channel → Messaging API
3. 找到「Webhook URL」，填入：
   ```
   https://abc123.ngrok-free.app/webhook
   ```
4. 點選「Verify」，應該會顯示「Success」
5. 開啟「Use webhook」開關

---

## 🧪 測試提醒功能

### 方法一：設定一個近期提醒

1. 建立任務時，讓 AI 安排提醒
2. 在確認畫面，把某則提醒時間改成「5 分鐘後」
3. 確認建立後，等待 5 分鐘，LINE 就會收到提醒

### 方法二：直接觀察後端 log

後端每分鐘掃描一次提醒，你可以在終端機看到：
```
⏰ 找到 1 則到期提醒
✅ 提醒 #1 已處理（任務：XXX）
✅ LINE 訊息已傳送給 Uxxxxxx
```

### 測試 LINE 回覆

收到提醒後，在 LINE 回覆：
- `完成` → 標記該提醒完成
- `延後30分鐘` → 把提醒延後 30 分鐘
- `查看下一步` → 顯示下一個任務步驟

---

## ❓ 常見問題

**Q：按下「產生 AI 規劃」沒反應或出現錯誤**
A：確認 Ollama 正在執行（`ollama serve`），且已下載模型（`ollama pull llama3`）。
可以在瀏覽器開 http://localhost:11434 確認。

**Q：AI 回覆很慢**
A：這是正常的，本機 LLM 需要一點時間。如果超過 60 秒會 timeout，可以嘗試使用較小的模型（例如 `ollama pull gemma2:2b`）。

**Q：LINE 沒有收到提醒**
A：確認後端 .env 裡的 LINE 憑證都填正確，且 ngrok 仍在執行中。
後端啟動時會顯示 `line_configured: true/false`，可以確認設定是否生效。

**Q：ngrok 網址一直在變**
A：每次重啟 ngrok，網址都會不同，要記得去 LINE Developers Console 更新 Webhook URL。
免費版的限制，或是購買 ngrok 付費版可以取得固定網址。

---

## 🔧 開發指令

```bash
# 後端
cd backend
npm run dev      # 開發模式（熱重載）
npm run build    # 編譯為 JS
npm start        # 執行編譯後的版本

# 前端
cd frontend
npm run dev      # 開發模式
npm run build    # 打包為靜態檔案
```

---

## 📋 系統架構簡圖

```
瀏覽器（React 前端）
    ↕ HTTP API
Node.js 後端（Express）
    ├── SQLite 資料庫（任務、步驟、提醒）
    ├── 本機 LLM API（AI 規劃）
    ├── LINE API（傳送提醒）
    └── node-cron（每分鐘檢查提醒）
         ↕ Webhook（ngrok）
LINE App（使用者的手機）
```
