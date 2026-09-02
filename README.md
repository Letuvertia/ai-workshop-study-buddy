# 📚 數位學伴 — 個人任務規劃系統 (Digital Study Buddy)

讓 AI 幫你拆解任務、安排時程與到點提醒。  
本專案專為「AI 識能工作坊」設計，支援學生於 **Windows、macOS 與 Linux** 環境中搭配 **Claude Desktop Cowork 模式** 進行開發與使用。

---

## 📁 專案架構速覽

```
ai-workshop-study-buddy/
├── backend/                  # Express + TypeScript 後端
│   ├── src/
│   │   ├── routes/          # 任務 API (tasks.ts) 與課表 API (schedule.ts)
│   │   ├── services/        # AI 統一入口 (aiClient.ts)、排程器 (scheduler.ts)
│   │   └── utils/           # 本地時間政策守門 (time.ts)
│   ├── scripts/
│   │   └── cliproxy-manager.js # CLIProxyAPI 本地代理管理腳本
│   ├── data/
│   │   ├── app.db           # SQLite 本地資料庫
│   │   └── ai-settings.json # AI 模型設定檔 (網頁面板即時寫入)
│   └── .env.example         # 後端環境變數範本
│
├── frontend/                 # React + Vite 前端
│   ├── src/
│   │   ├── components/      # 任務列表、建立表單、AI 設定面板 (AiSettings.tsx)
│   │   └── utils/           # 本地時間政策守門 (time.ts)
│   └── dist/                # 前端靜態打包產物 (供單一伺服器模式直接供應)
│
├── AGENTS.md                 # AI 代理協作開發規範 (Claude Desktop Cowork 專用)
└── README.md
```

---

## 🚀 快速開始 (Quick Start)

### 1. 環境前置需求
- **Node.js 18+**（建議安裝 LTS 版本）：[https://nodejs.org](https://nodejs.org)
- **Git**

---

### 2. 安裝步驟

#### 步驟 A：安裝後端依賴
```bash
cd backend
npm install
cp .env.example .env
```
*(Windows 命令提示字元若無 `cp`，請用 `copy .env.example .env`)*

#### 步驟 B：安裝並編譯前端
```bash
cd ../frontend
npm install
npm run build
```

---

### 3. 啟動系統

本專案支援**兩種啟動方式**：

#### 🌟 方式一：單一伺服器模式（最推薦、最簡單）
只需要開啟**一個終端機**，由後端直接同時供應 Web 介面與 API，並自動拉起本地 AI 代理服務：

```bash
cd backend
npm run dev
```

啟動後打開瀏覽器前往：  
👉 **[http://localhost:3000](http://localhost:3000)**

---

#### 🛠️ 方式二：雙伺服器即時熱重載開發模式（需大幅修改前端畫面時使用）
需要開啟**兩個終端機視窗**：

- **視窗 1（後端 API，Port 3000）**：
  ```bash
  cd backend
  npm run dev
  ```
- **視窗 2（前端 Vite 即時熱重載，Port 5173）**：
  ```bash
  cd frontend
  npm run dev
  ```

啟動後打開瀏覽器前往：  
👉 **[http://localhost:5173](http://localhost:5173)**

---

## ⚙️ AI 模型設定

進入網頁後，點擊右下角「**⚙️ AI 模型**」按鈕，即可自由切換四種模型來源：

1. **➕ 訂閱制模型（Claude / OpenAI / Google AI）**：
   - 系統在啟動 `npm run dev` 時會自動在背景啟動 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)（Port 8317）。
   - 點擊設定面板的登入授權按鈕，依照指引完成一次性登入即可直接調用您的訂閱模型額度，**完全不需輸入 API Key**！
2. **🖥️ 本機模型（Ollama / LM Studio）**：
   - 確保本機已啟動 Ollama（預設 `http://localhost:11434/v1/chat/completions`），資料完全不出電腦。
3. **🟢 外部雲端 API**：
   - 貼上您個人的 Google Gemini 或 OpenAI API Key 即可使用。
4. **🌐 自訂端點**：
   - 支援任何相容 OpenAI `/v1/chat/completions` 的 API 端點。

*提示：設定完成後可點擊「連線檢查」，成功後系統會自動由端點動態載入可用模型清單供下拉選擇！*

---

## 💻 跨平台注意事項

- **macOS / Linux**：
  - 原生執行 `npm run dev` 即可順暢透過 `http://localhost:3000` 連線。
- **Windows (WSL2)**：
  - 若在 WSL2 中使用，Windows 宿主機瀏覽器若遇到 `localhost` 連線問題，可直接在瀏覽器輸入 WSL 宿主機 IP 或在 `C:\Windows\System32\drivers\etc\hosts` 確認解析設定。
- **前端修改注意事項**：
  - 當您修改了 `frontend/src` 的前端程式碼後，若使用「單一伺服器模式（Port 3000）」，請記得在 `frontend/` 執行 `npm run build` 重新打包，Port 3000 才會更新顯示新畫面。

---

## 🧪 常用測試與驗證指令

```bash
# 後端自動化回歸檢驗（包含型別檢查、測試伺服器、任務 API 整合與排程器驗證）
cd backend
npm run check

# 前端型別檢查與打包建置
cd frontend
npm run build
```
