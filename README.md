# 📚 數位學伴 — 個人任務規劃系統 (Digital Study Buddy)

讓 AI 幫你拆解學習任務、安排具體步驟與到點提醒。  
本專案專為「**台大社會系AI工作坊**」設計，支援學生於 **Windows、macOS 與 Linux** 環境中自由使用各大訂閱制 AI 方案（Claude / ChatGPT / Google）或本地模型，透過自然對話與 AI 共同擬定、持續修改與跟進各項學習計畫。

---

## ✨ 核心功能特色

### 1. 💬 對話式任務規劃與即時修改（類 ChatGPT 雙欄工作區）
- **左側任務側邊欄（Task Sidebar）**：快速切換與管理所有歷史任務，支援「進行中／已完成」狀態篩選與一鍵刪除。
- **左欄對話視窗（Task Chat）**：擺脫單次靜態表單！直接用自然對話告訴學伴你的學習目標、考試範圍或作業要求，AI 自動生成拆解步驟。
- **右欄步驟看板（Task Steps Panel）**：即時視覺化顯示目標、截止時間、剩餘天數與每個執行步驟的建議工具與完成指標。
- **即時雙向聯動**：在對話中隨時告訴 AI「步驟 1 完成了」、「截止日延後兩天」或「加一個整理考古題的步驟」，AI 自動操作 SQLite 資料庫並即時重新渲染右側看板！

### 2. ⚡ 工業級 Context Management（1:1 複刻 Charm-Crush 記憶管理）
完整移植業界開源頂級代理 **Charm Crush (OpenCode)** 的上下文壓縮架構，即使在單一任務中進行幾十輪長期對話，也能保持敏捷精確：
- **動態上下文視窗閾值（Adaptive Threshold）**：根據當前模型（Claude 200k、GPT-4o 128k、Gemini 1M、Ollama 32k 等）動態計算剩餘空間，當抵達安全緩衝門檻（20,000 tokens 或 20%）時自動啟動後台滾動摘要。
- **嚴格結構化摘要（`summary.md` 規格）**：將歷史上下文提煉為 5 大核心區塊（*Current State*、*Steps & Changes*、*Technical Context*、*Strategy & Student Context*、*Exact Next Steps*），杜絕空洞敘述。
- **任務狀態與步驟注入（Todos Injection）**：摘要時自動注入最新步驟進度，指示接續模型持續追蹤。
- **指針切片與角色重寫（Session Slicing & Role Rewriting）**：只保留從摘要開始的上下文，並將摘要角色轉寫為 `user`，API 請求自動拋棄舊歷史，前端完整保留歷史檢視。
- **首尾安全截斷（Head-Tail Truncation）**：超長文字或工具輸出保留前 50% 與後 50%，中間省略為行數標記。
- **確定性快取親和性（Cache Affinity Header）**：自動附加 `x-session-id` 與 `x-session-affinity`，極大化命中大模型 KV Cache。

### 3. 📅 學期課表圖片 AI 辨識
- 支援上傳課表截圖，後端自動調用 Vision 模型（Claude / GPT-4o / Gemini）辨識星期與節次。
- 自動關聯至任務排程系統，避開上課時段安排自習時間。

### 4. ⏰ 零時區誤差的本地提醒排程
- 嚴格採用本地 ISO 時間（No Timezones 政策），杜絕 UTC+8 偏移 Bug。
- `node-cron` 背景服務每分鐘比對到期提醒，準時觸發通知。

---

## 📁 專案架構速覽

```
ai-workshop-study-buddy/
├── backend/                  # Express + TypeScript 核心後端 (Port 3000)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── tasks.ts      # 任務 CRUD、對話 (chat)、手動摘要 (summarize)
│   │   │   ├── schedule.ts   # 課表圖片辨識與管理
│   │   │   └── aiSettings.ts # AI 設定、健康檢查、CLIProxy 授權
│   │   ├── services/
│   │   │   ├── taskChat.ts   # 對話核心與 Crush Context Management 引擎
│   │   │   ├── aiClient.ts   # 統一 AI 網關與快取親和性 Header
│   │   │   ├── scheduler.ts  # node-cron 每分鐘定時排程器
│   │   │   └── llm.ts        # 靜態規劃 fallback 服務
│   │   ├── utils/            # 本地時間政策守門 (time.ts)
│   │   └── db/               # SQLite (better-sqlite3) 與資料庫結構遷移
│   ├── scripts/
│   │   ├── check.js          # 自動化品質檢查腳本 (npm run check)
│   │   └── cliproxy-manager.js # CLIProxyAPI 本地代理管理腳本
│   ├── data/
│   │   ├── app.db           # SQLite 本地資料庫（首次啟動自動建立）
│   │   └── ai-settings.json # AI 模型設定檔（網頁面板即時寫入）
│   └── package.json
│
├── frontend/                 # React + Vite 前端 (Port 5173)
│   ├── src/
│   │   ├── components/
│   │   │   ├── TaskSidebar.tsx    # 任務側邊欄（清單切換、狀態篩選、刪除）
│   │   │   ├── TaskChat.tsx       # 對話框（自適應高度、Crush 摘要渲染）
│   │   │   ├── TaskStepsPanel.tsx # 步驟看板（進度條、狀態切換、提醒開關）
│   │   │   ├── ScheduleUpload.tsx # 課表上傳與辨識檢視
│   │   │   └── AiSettings.tsx     # 浮動 AI 設定面板（各大訂閱制/自訂端點）
│   │   ├── api/                   # 前端 API 請求客戶端
│   │   └── utils/                 # 本地時間處理工具 (time.ts)
│   └── package.json
│
├── AGENTS.md                 # AI 代理協作開發規範 (Claude Desktop Cowork 專用)
└── README.md
```

---

## 🚀 快速開始 (Quick Start)

### 🍎 macOS / Linux 安裝與啟動步驟

在專案根目錄開啟終端機，依序執行：

#### 1. 檢查 Node.js 是否已安裝
```bash
node -v
```
若終端機已顯示版本編號（例如 `v24.x.x` 或 `v18+`），代表已安裝完成，**可直接跳至步驟 3**。

#### 2. 下載並安裝 Node.js（若步驟 1 未安裝）
> 參考官方指引：[Node.js 官方下載頁面 (https://nodejs.org/zh-tw/download)](https://nodejs.org/zh-tw/download)

```bash
# 下載並安裝 nvm：
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# 重新載入 shell 環境：
\. "$HOME/.nvm/nvm.sh"

# 下載並安裝 Node.js：
nvm install 24

# 核對版本：
node -v
npm -v
```

#### 3. 安裝後端與前端依賴
```bash
# 安裝後端依賴
cd backend && npm install

# 安裝前端依賴
cd ../frontend && npm install
```

#### 4. 啟動系統（需同時開啟兩個終端機分別啟動後端與前端）

- **終端機 1（啟動後端 API，Port 3000）**：
  ```bash
  cd backend
  npm run dev
  ```

- **終端機 2（啟動前端介面，Port 5173）**：
  ```bash
  cd frontend
  npm run dev
  ```

#### 5. 開啟瀏覽器
打開瀏覽器前往：  
👉 **[http://localhost:5173](http://localhost:5173)**

---

### 🪟 Windows 安裝與啟動步驟

在專案根目錄開啟 PowerShell，依序執行：

#### 1. 檢查 Node.js 是否已安裝
```powershell
node -v
```
若終端機已顯示版本編號（例如 `v24.x.x` 或 `v18+`），代表已安裝完成，**可直接跳至步驟 3**。

#### 2. 下載並安裝 Node.js（若步驟 1 未安裝）
> 參考官方指引：[Node.js 官方下載頁面 (https://nodejs.org/zh-tw/download)](https://nodejs.org/zh-tw/download)

以系統管理員身分開啟 PowerShell 視窗執行：
```powershell
# 下載並安裝 Chocolatey：
powershell -c "irm https://community.chocolatey.org/install.ps1|iex"

# 下載並安裝 Node.js：
choco install nodejs-lts --version="24"

# 核對版本：
node -v
npm -v
```

#### 3. 安裝後端與前端依賴
```powershell
# 安裝後端依賴
cd backend
npm install

# 安裝前端依賴
cd ../frontend
npm install
```

#### 4. 啟動系統（需同時開啟兩個 PowerShell 視窗分別啟動後端與前端）

- **PowerShell 視窗 1（啟動後端 API，Port 3000）**：
  ```powershell
  cd backend
  npm run dev
  ```

- **PowerShell 視窗 2（啟動前端介面，Port 5173）**：
  ```powershell
  cd frontend
  npm run dev
  ```

#### 5. 開啟瀏覽器
打開瀏覽器前往：  
👉 **[http://localhost:5173](http://localhost:5173)**

---

## ⚙️ AI 模型連線設定

打開網頁 [http://localhost:5173](http://localhost:5173) 後，點擊右下角懸浮按鈕「**⚙️ AI 模型**」，即可自由選擇方案：

1. **訂閱制 Claude**：
   - 適合擁有 Claude Pro / Team 訂閱方案的同學。
   - 點擊「**🔗 連結帳號**」前往瀏覽器授權，**免 API Key**。
2. **訂閱制 OpenAI**：
   - 適合擁有 ChatGPT Plus / Team 訂閱方案的同學。
   - 點擊「**🔗 連結帳號**」前往瀏覽器授權，直接調用現有訂閱額度。
3. **訂閱制 Google**：
   - 適合擁有 Google AI 訂閱方案（Plus / Pro）的同學。
   - 點擊「**🔗 連結帳號**」登入授權即可使用。
4. **自訂模型端點（本機 Ollama / LM Studio 或自備 API Key）**：
   - **本機模型**：離線運行 Ollama（預設 `http://localhost:11434/v1`），API Key 留空即可連線。
   - **外部雲端 API**：填入相應端點與金鑰（如 DeepSeek、OpenAI、Google 等）。

> 💡 **操作流程提示**：
> 1. 授權登入或填寫端點後，點擊「**🩺 檢查連線 (Health Check)**」。
> 2. 連線通過後，系統會**自動從端點動態載入可用模型清單**供下拉選擇。
> 3. 點擊「**儲存設定**」，新設定即刻生效並自動持久化保存！

---

## 🧪 開發與品質驗證

依據本專案 `AGENTS.md` 開發規範，所有後端更動皆必須通過內建驗證套件：

```bash
cd backend
npm run check
```

**驗證項目**：
1. `tsc --noEmit`：TypeScript 型別嚴格檢查。
2. 測試伺服器 Boot：在 Port 3100 啟動暫存資料庫實例。
3. 任務 API 檢查：測試清單、對話與設定端點。
4. 本地時間排程器：以當前分鐘建立測試任務，驗證無時區偏移下是否在 60 秒內準時觸發。

前端亦可執行靜態檢查與打包：
```bash
cd frontend
npm run build
```
