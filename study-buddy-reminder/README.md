# 📚 數位學伴 — 個人任務規劃與 LINE 提醒工具

用 AI 幫你把任務拆解成步驟，並在對的時間透過 LINE（或終端機）提醒你。

---

## 🗺 這個工具是做什麼的？

1. 你在網頁表單填入任務內容
2. 系統呼叫本機 AI（Ollama）幫你規劃任務步驟與提醒時間
3. 你確認規劃後，系統把任務存起來
4. 到提醒時間時，系統自動送出通知（終端機或 LINE）

---

## 📁 檔案結構

```
study-buddy-reminder/
  src/
    app.js        ← 主程式（Express 路由、伺服器）
    db.js         ← 資料庫（SQLite，自動建立）
    llm.js        ← 呼叫本機 LLM API
    planner.js    ← 規劃主入口（LLM 或固定規則）
    reminders.js  ← 發送提醒（LINE 或終端機）
    line.js       ← LINE API 函式
    scheduler.js  ← 定時排程（每分鐘檢查）
  views/
    index.ejs         ← 新增任務表單
    confirm.ejs       ← 確認規劃頁
    tasks.ejs         ← 所有任務列表
    task-detail.ejs   ← 任務詳情
    partials/
      header.ejs      ← 共用頁首與 CSS
  data/
    app.db        ← SQLite 資料庫（第一次啟動自動建立）
  .env.example    ← 環境變數範本
  package.json
  README.md
```

---

## 🚀 安裝步驟

### 前置需求

- **Node.js 18 以上**：https://nodejs.org（選 LTS 版本）
- 安裝完後在終端機執行 `node -v` 確認，應該顯示 `v18.x.x` 以上

### 1. 安裝套件

```bash
# 進入專案資料夾
cd study-buddy-reminder

# 安裝所有需要的套件
npm install
```

---

## ⚙️ 設定 .env

複製範本並修改：

```bash
cp .env.example .env
```

用文字編輯器打開 `.env`，依照以下說明填寫：

```env
PORT=3000                    # 伺服器埠號，不需要改
DATABASE_PATH=./data/app.db  # 資料庫位置，不需要改

USE_LLM=true                 # 要用 AI 規劃請設 true，否則 false
LOCAL_LLM_API_URL=http://localhost:11434/api/chat  # Ollama 預設
LOCAL_LLM_MODEL=llama3       # 你安裝的模型名稱

REMINDER_CHANNEL=console     # 先用 console 測試，之後改成 line
REQUIRE_CONFIRMATION=true    # true = 顯示確認頁，false = 直接存
ENABLE_LINE_REPLY=false      # 先設 false，之後再啟用
```

---

## ▶️ 啟動伺服器

```bash
npm start
```

看到這樣代表成功：

```
🚀 數位學伴 已啟動！
   網址：http://localhost:3000
⚙️  目前設定：
   USE_LLM            = ✅ 使用 LLM
   REMINDER_CHANNEL   = 🖥  終端機（console）
   ...
⏰ 排程已啟動（每分鐘檢查一次提醒）
```

然後用瀏覽器開啟 **http://localhost:3000**

> 💡 開發時也可以用 `npm run dev`，會在你修改 .js 檔後自動重啟（Node.js 18+ 內建 `--watch`）

---

## 🖥 用 console 模式測試提醒（不需要 LINE）

這是最簡單的測試方式：

### Step 1：設定 .env

```env
REMINDER_CHANNEL=console
USE_LLM=false       ← 先用固定規則，不需要 Ollama
REQUIRE_CONFIRMATION=true
```

### Step 2：建立一個測試任務

1. 開啟 http://localhost:3000
2. 填入任務名稱（例如「測試任務」），**不填截止時間**
3. 按「產生 AI 規劃」
4. 確認頁會顯示一則「5 分鐘後」的測試提醒
5. 按「確認建立任務」

### Step 3：等 5 分鐘，或手動觸發

等 5 分鐘後終端機會自動印出提醒。

或是立即測試：開啟 http://localhost:3000/test-reminder

終端機會顯示類似這樣：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【任務提醒】
任務：測試任務
現在要做：開始執行
提醒內容：這是「測試任務」的測試提醒
建議工具：—
完成標準：確認提醒功能正常運作
（傳送時間：2026/6/8 下午 3:00:00）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📱 改成 LINE 提醒模式

### Step 1：取得 LINE Channel Access Token

1. 前往 https://developers.line.biz/console/
2. 登入你的 LINE 帳號（個人帳號即可）
3. 點選「Create a new provider」，輸入任意名稱（例如「我的學伴」）
4. 點選「Create a Messaging API channel」
5. 填寫：
   - Channel name：任意（例如「數位學伴」）
   - Channel description：任意
   - Category 和 Subcategory：選任意分類
6. 同意條款，建立完成
7. 進入你建立的 Channel → 點選「Messaging API」分頁
8. 找到「Channel access token」→ 點「Issue」→ 複製這串 Token

### Step 2：取得你的 LINE User ID

**方法：從 LINE Developers Console 取得**

1. 在 Channel 設定頁 → 「Basic settings」分頁
2. 找到「Your user ID」（格式像 `U1234567890abcdef`）
3. 複製這個 ID

> ⚠️ 注意：這是你「自己的」User ID，不是 Bot 的 ID。
> 如果找不到，可以先用下面的 ngrok 方法讓 Bot 上線後，
> 在 LINE 傳一條訊息給 Bot，後端 log 就會印出你的 User ID。

### Step 3：把憑證填入 .env

```env
REMINDER_CHANNEL=line
LINE_CHANNEL_ACCESS_TOKEN=貼上你的 Token
LINE_USER_ID=U你的UserId
LINE_CHANNEL_SECRET=（可選，用於 Webhook 驗證）
```

### Step 4：重新啟動伺服器

```bash
# 按 Ctrl+C 停止，再重新啟動
npm start
```

現在建立任務後，到提醒時間就會收到 LINE 訊息！

---

## 🌐 用 ngrok 設定 LINE Webhook（ENABLE_LINE_REPLY=true 時才需要）

> 如果你只需要 LINE 傳送提醒（單向），**不需要設定 Webhook**，
> 只要填好 Access Token 和 User ID 就夠了。
>
> 以下步驟只有在 `ENABLE_LINE_REPLY=true` 時才需要。

### Step 1：安裝 ngrok

前往 https://ngrok.com → 下載並安裝 → 用 GitHub 帳號登入取得 Token：

```bash
ngrok authtoken 你的token
```

### Step 2：啟動 ngrok

```bash
ngrok http 3000
```

會看到類似：
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

### Step 3：設定 LINE Webhook URL

1. LINE Developers Console → 你的 Channel → Messaging API 分頁
2. 找到「Webhook URL」，填入：
   ```
   https://abc123.ngrok-free.app/webhook
   ```
3. 點「Verify」，應該看到「Success」
4. 開啟「Use webhook」開關

### Step 4：設定 .env 並重啟

```env
ENABLE_LINE_REPLY=true
LINE_CHANNEL_SECRET=你的_channel_secret
```

---

## 🔄 四個選項如何切換

| 選項 | 環境變數 | 可選值 | 說明 |
|------|----------|--------|------|
| 是否用 LLM | `USE_LLM` | `true` / `false` | false 時用固定規則（截止前 1 天/3 小時/30 分） |
| 提醒方式 | `REMINDER_CHANNEL` | `console` / `line` | console 直接印在終端機，line 透過 LINE 傳送 |
| 是否需確認 | `REQUIRE_CONFIRMATION` | `true` / `false` | false 時 AI 規劃完直接存入，不顯示確認頁 |
| LINE 回覆互動 | `ENABLE_LINE_REPLY` | `true` / `false` | true 時可在 LINE 回覆「完成/延後30分鐘/查看下一步」 |

修改 `.env` 後，重新執行 `npm start` 才會生效。

---

## ❓ 常見錯誤排除

**Q：`npm install` 失敗，提示 better-sqlite3 無法編譯**
A：需要安裝 C++ build tools：
- macOS：執行 `xcode-select --install`
- Windows：安裝 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

**Q：按「產生 AI 規劃」出現「LLM 沒有回傳有效的 JSON」**
A：可能原因：
1. Ollama 沒有啟動 → 終端機執行 `ollama serve`
2. 模型沒有下載 → 執行 `ollama pull llama3`
3. 模型太小，無法輸出 JSON → 改用 `LOCAL_LLM_MODEL=llama3:8b` 等更大的模型
4. 先把 `USE_LLM=false` 測試其他功能

**Q：LINE 沒有收到訊息**
A：
1. 確認 `.env` 裡的 `LINE_CHANNEL_ACCESS_TOKEN` 和 `LINE_USER_ID` 是否正確
2. 確認 `REMINDER_CHANNEL=line`（要重啟伺服器才生效）
3. 確認你有把那個 Bot 加為 LINE 好友
4. 看終端機是否有錯誤訊息

**Q：LINE Webhook Verify 失敗**
A：確認 ngrok 正在執行，且填入的網址是 ngrok 給的 HTTPS 網址（不是 localhost）

**Q：ngrok 網址每次都不一樣**
A：是的，免費版 ngrok 每次重啟都會換網址。要記得去 LINE Console 更新 Webhook URL。
或購買付費版 ngrok 取得固定網址。

---

## 🔮 後續升級路線

本工具故意設計得簡單，以下是可以加的功能：

**1. LINE 回覆互動（已支援框架）**
設定 `ENABLE_LINE_REPLY=true` 並完成 ngrok 設定，就能在 LINE 回覆「完成/延後30分鐘/查看下一步」。

**2. 加入 MCP（Model Context Protocol）**
把 LLM 換成透過 MCP 呼叫，可以讓 AI 存取更多工具（Google Calendar、Notion 等）。

**3. 升級為 React 介面**
目前的 EJS 頁面可以逐步改成 React + Express API 的前後端分離架構，提供更流暢的編輯體驗。

**4. Google Calendar 整合**
在建立提醒時，同步新增 Google Calendar 事件。
需要 Google OAuth 設定，可參考 `googleapis` 套件。

**5. 多任務模板**
預先定義常見任務模板（讀書計畫、專案規劃、論文寫作等），讓 AI 直接套用。
