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
│   └── package.json
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


### 🍎 macOS / Linux 安裝與啟動步驟

在專案根目錄開啟終端機，依序執行：

#### 1. 檢查並安裝 Node.js（若尚未安裝）
```bash
if command -v node &>/dev/null; then
  echo "✅ Node.js 已安裝: $(node -v)"
elif command -v brew &>/dev/null; then
  brew install node
else
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install --lts
fi
node -v
```

#### 2. 安裝後端依賴
```bash
cd backend
npm install
```

#### 3. 安裝前端依賴並打包
```bash
cd ../frontend
npm install
npm run build
```

#### 4. 啟動系統
```bash
cd ../backend
npm run dev
```

啟動後打開瀏覽器前往：  
👉 **[http://localhost:3000](http://localhost:3000)**

---

### 🪟 Windows 安裝與啟動步驟

在專案根目錄開啟 PowerShell，依序執行：

#### 1. 檢查並安裝 Node.js（若尚未安裝）
```powershell
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "✅ Node.js 已安裝: $(node -v)"
} elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -OutFile "$env:TEMP\node.msi"
    Start-Process msiexec.exe -ArgumentList "/i `"$env:TEMP\node.msi`" /quiet /norestart" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
node -v
```

#### 2. 安裝後端依賴
```powershell
cd backend
npm install
```

#### 3. 安裝前端依賴並打包
```powershell
cd ../frontend
npm install
npm run build
```

#### 4. 啟動系統
```powershell
cd ../backend
npm run dev
```

啟動後打開瀏覽器前往：  
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ⚙️ AI 模型連線設定

打開網頁 [http://localhost:3000](http://localhost:3000) 後，點擊右下角「**⚙️ AI 模型**」按鈕，可自由切換模型來源：

1. **➕ 訂閱制模型（Claude / OpenAI / Google AI）**：
   - 適合擁有 Claude Pro、ChatGPT Plus 或 Google One AI 訂閱的同學。
   - 點擊設定面板上的登入授權按鈕，在瀏覽器完成一次性授權即可，**完全不需要另外付費購買 API Key**！
2. **🖥️ 本機模型（Ollama / LM Studio）**：
   - 適合注重隱私或離線使用。
   - 本機安裝並啟動 Ollama（預設 `http://localhost:11434/v1/chat/completions`）即可直接連線。
3. **🟢 外部雲端 API**：
   - 若您手邊有 Google Gemini、OpenAI 或 Anthropic 的 API Key，直接貼上即可使用。
4. **🌐 自訂端點**：
   - 支援任何相容 OpenAI 格式（`/v1/chat/completions`）的自建服務或校園 API 轉發站。

*設定完成後點擊「連線檢查」，成功後系統會自動由端點動態拉取可用模型清單供下拉選擇！*

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

## 🧪 自動化品質檢驗指令

專案內建一鍵驗證腳本，修改程式碼後可隨時執行以確保系統穩定：

```bash
cd backend && npm run check
```
*(檢驗內容包含：TypeScript 型別檢查、暫存資料庫開機、任務 API 整合、本地時間排程器比對，需全數通過)*
