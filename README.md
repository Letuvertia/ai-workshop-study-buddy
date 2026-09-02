# 📚 數位學伴 — 個人任務規劃系統 (Digital Study Buddy)

讓 AI 幫你拆解學習任務、安排具體步驟與到點提醒。  
本專案專為「**台大社會系AI工作坊**」設計，支援學生於 **Windows、macOS 與 Linux** 環境中搭配 **Claude Desktop Cowork 模式** 進行協作與使用。

---

## 📁 專案架構速覽

```
ai-workshop-study-buddy/
├── backend/                  # Express + TypeScript 核心後端
│   ├── src/
│   │   ├── routes/          # 任務規劃 API (tasks.ts) 與課表 API (schedule.ts)
│   │   ├── services/        # AI 統一入口 (aiClient.ts)、排程器 (scheduler.ts)
│   │   └── utils/           # 本地時間政策守門 (time.ts)
│   ├── scripts/
│   │   └── cliproxy-manager.js # CLIProxyAPI 本地代理管理腳本
│   ├── data/
│   │   ├── app.db           # SQLite 本地資料庫（首次啟動自動建立）
│   │   └── ai-settings.json # AI 模型設定檔（網頁面板即時寫入）
│   └── .env.example         # 後端環境變數範本
│
├── frontend/                 # React + Vite 前端
│   ├── src/
│   │   ├── components/      # 任務列表、建立表單、課表辨識、AI 設定面板
│   │   └── utils/           # 本地時間政策守門 (time.ts)
│   └── dist/                # 前端打包產物（供後端單一伺服器模式直接託管）
│
├── AGENTS.md                 # AI 代理協作開發規範 (Claude Desktop Cowork 專用)
└── README.md
```

---

## 🚀 快速開始 (Quick Start)

### 1. 前置需求 (Prerequisites)
電腦上**唯一需要預先安裝的環境**只有：
- **Node.js 18+**（推薦安裝 LTS 版本）：[https://nodejs.org](https://nodejs.org)  
  *安裝完成後，開啟終端機輸入 `node -v` 確認版本為 v18 或以上即可（npm 會隨 Node.js 一併安裝完畢）。*

> 💡 **不需要預先安裝 Git 或任何資料庫伺服器**。學生可直接下載壓縮檔解壓縮後於資料夾內開始。

---

### 🤖 給 Claude Desktop Cowork 的自動執行指引
當學生在 Claude Desktop Cowork 中開啟此專案目錄並說：
> **「幫我跑起來」**

Claude 應依序執行下列具體指令，從零建置並啟動系統：

#### 步驟 1：檢查 Node.js 環境
```bash
node -v
```
確認 Node.js 版本大於等於 18。

#### 步驟 2：安裝後端依賴並初始化設定檔
進入 `backend/` 安裝相依套件，並複製環境變數範本：
- **macOS / Linux**：
  ```bash
  cd backend && npm install && cp -n .env.example .env
  ```
- **Windows (PowerShell)**：
  ```powershell
  cd backend
  npm install
  if (!(Test-Path .env)) { Copy-Item .env.example .env }
  ```
- **Windows (Command Prompt / cmd)**：
  ```cmd
  cd backend
  npm install
  if not exist .env copy .env.example .env
  ```

#### 步驟 3：安裝前端依賴並打包為單一伺服器產物
進入 `frontend/` 安裝相依套件並編譯成靜態網頁（編譯後的產物會存放於 `frontend/dist`，後端可直接託管，免開第二個終端機）：
```bash
cd ../frontend && npm install && npm run build
```

#### 步驟 4：啟動單一伺服器模式
返回 `backend/` 啟動主服務：
```bash
cd ../backend && npm run dev
```
此指令會自動：
1. 在背景自動啟動本地代理 `CLIProxyAPI`（Port 8317，支援免 API Key 的訂閱制 AI 授權）。
2. 自動初始化 SQLite 本地資料庫 `data/app.db`。
3. 啟動 Express 伺服器（Port 3000），並同時託管前端介面與任務排程器。

#### 步驟 5：驗證與開啟瀏覽器
在終端機或背景驗證健康狀態：
```bash
curl http://localhost:3000/health
```
看到回傳 `{"status":"ok",...}` 即代表系統完全就緒！  
此時請引導學生以瀏覽器開啟：  
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🛠️ 開發者雙終端即時熱重載模式（選用）

如果您正在大幅度修改前端 React 畫面，希望存檔後瀏覽器自動即時刷新（HMR），可使用雙終端模式：

- **終端機 1（後端 API，Port 3000）**：
  ```bash
  cd backend && npm run dev
  ```
- **終端機 2（前端 Vite 開發伺服器，Port 5173）**：
  ```bash
  cd frontend && npm run dev
  ```
啟動後打開瀏覽器前往：**[http://localhost:5173](http://localhost:5173)**。

---

## ⚙️ AI 模型連線設定

打開網頁 [http://localhost:3000](http://localhost:3000) 後，點擊右下角「**⚙️ AI 模型**」按鈕，可自由切換模型來源：

1. **➕ 訂閱制模型（Claude / OpenAI / Google AI）**：
   - 適合擁有 Claude Pro、ChatGPT Plus 或 Google One AI 訂閱的同學。
   - 點擊設定面板上的「以 ... 帳號登入」按鈕，在瀏覽器完成一次性授權即可，**完全不需要付費購買 API Key**！
2. **🖥️ 本機模型（Ollama / LM Studio）**：
   - 適合注重隱私或無網路環境。
   - 本機安裝並啟動 Ollama（預設 `http://localhost:11434/v1/chat/completions`）即可直接連線。
3. **🟢 外部雲端 API**：
   - 若您手邊有 Google Gemini、OpenAI 或 Anthropic 的 API Key，直接貼上即可使用。
4. **🌐 自訂端點**：
   - 支援任何相容 OpenAI 格式（`/v1/chat/completions`）的自建服務或校園 API 轉發站。

*設定完成後點擊「連線檢查」，打通後系統會自動自端點拉取可用模型清單供下拉選擇！*

---

## 💻 跨平台注意事項

- **macOS / Linux**：
  - 原生終端機執行上述步驟即可順暢存取 `http://localhost:3000`。
- **Windows**：
  - 無論使用原生 PowerShell 或 WSL2，只要執行 `backend` 的 `npm run dev` 即可在 Windows 瀏覽器開啟 `http://localhost:3000`。
- **修改前端程式碼後的更新方式**：
  - 在「單一伺服器模式（Port 3000）」下，若修改了 `frontend/src` 中的檔案，請至 `frontend/` 執行一次 `npm run build` 重新打包，Port 3000 即可看到最新改動。

---

## 🧪 自動化品質檢驗指令

專案內建嚴格的一鍵驗證腳本，修改程式碼後可隨時執行以確保無破壞性變更：

```bash
cd backend && npm run check
```
*(檢驗內容包含：TypeScript 型別檢查、暫存資料庫開機、任務 API 整合、本地時間排程器比對，需全數通過)*
