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
│   └── package.json
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

#### 2. 安裝後端與前端依賴
```bash
# 安裝後端依賴
cd backend && npm install

# 安裝前端依賴
cd ../frontend && npm install
```

#### 3. 啟動系統（需同時開啟兩個終端機分別啟動後端與前端）

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

啟動後打開瀏覽器前往：  
👉 **[http://localhost:5173](http://localhost:5173)**

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

#### 2. 安裝後端與前端依賴
```powershell
# 安裝後端依賴
cd backend
npm install

# 安裝前端依賴
cd ../frontend
npm install
```

#### 3. 啟動系統（需同時開啟兩個 PowerShell 視窗分別啟動後端與前端）

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

啟動後打開瀏覽器前往：  
👉 **[http://localhost:5173](http://localhost:5173)**

---

## ⚙️ AI 模型連線設定

打開網頁 [http://localhost:5173](http://localhost:5173) 後，點擊右下角「**⚙️ AI 模型**」按鈕，可於面板頂端自由切換模式：

1. **🟣 訂閱制 Claude**：
   - 適合擁有 Claude Pro / Team 訂閱方案的同學。
   - 點擊「**🔗 連結帳號**」並於瀏覽器完成一次性授權，**完全不需要另外付費購買 API Key**！
2. **🟢 訂閱制 OpenAI**：
   - 適合擁有 ChatGPT Plus / Team 訂閱方案的同學。
   - 點擊「**🔗 連結帳號**」並於瀏覽器完成一次性授權，直接調用訂閱方案額度。
3. **🔵 訂閱制 Google AI Pro**：
   - 適合擁有 Google One AI Premium 方案的同學。
   - 點擊「**🔗 連結帳號**」登入 Google 帳號授權即可使用。
4. **⚙️ 自訂模型端點（本機 Ollama / LM Studio 或外部 API Key）**：
   - **本機模型**：注重隱私或離線使用，本機安裝並啟動 Ollama（預設端點 `http://localhost:11434/v1`），API Key 留空即可連線。
   - **外部雲端 API**：若有 Google Gemini、OpenAI 等服務的 API Key，直接填入相應端點與金鑰。

> 💡 **操作流程提示**：
> 1. 授權登入或填寫端點後，點擊「**🩺 檢查連線 (Health Check)**」。
> 2. 連線通過後，系統會**自動從端點動態抓取可用模型清單**供下拉選擇。
> 3. 點擊「**儲存設定**」，新設定即刻生效並自動持久化保存！
