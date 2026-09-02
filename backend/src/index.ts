import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 若 .env 不存在，自動從 .env.example 複製一份（跨平台防呆）
const envPath = path.resolve(__dirname, '../.env');
const envExamplePath = path.resolve(__dirname, '../.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  try {
    fs.copyFileSync(envExamplePath, envPath);
  } catch {
    /* 忽略錯誤 */
  }
}

dotenv.config(); // 一定要在最頂端，才能讀到 .env

import express from 'express';
import cors from 'cors';
import './db/index'; // 初始化資料庫（建立資料表）
import tasksRouter from './routes/tasks';
import aiSettingsRouter from './routes/aiSettings';
import scheduleRouter from './routes/schedule';
import { startScheduler } from './services/scheduler';
import { getAiSettings } from './services/aiSettings';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// =============================================
// 簡易請求日誌
app.use((req, _res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// 允許前端存取後端（包含 localhost 與區域網路 IP）
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));

// 課表圖片用 base64 塞進 JSON body 傳，預設 100kb 上限太小，拉高到 15mb
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// =============================================
// 路由
// =============================================
app.use('/api/tasks', tasksRouter);
app.use('/api/ai', aiSettingsRouter);
app.use('/api/schedule', scheduleRouter);

// =============================================
// 單一伺服器模式：直接供應打包好的前端網頁
// 前端 fetch 用的是相對路徑 /api，跟後端同一個網址時不需要 CORS，
// 所以只要跑 backend 一個伺服器、開 http://localhost:3000 就能用。
// 注意：這裡供應的是 frontend/dist（打包成品）。改了前端程式碼之後，
// 要在 frontend/ 跑一次 `npm run build` 才會反映到這裡；
// 開發前端時仍建議照舊開兩個伺服器（vite 會即時更新）。
// =============================================
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback：不是 API 的 GET 請求，一律回 index.html（由前端路由接手）
  app.get(/^\/(?!api|health).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// 健康檢查（方便確認後端是否在執行）
app.get('/health', (_req, res) => {
  const ai = getAiSettings();
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    env: {
      ai_source: ai.kind,
      ai_endpoint: ai.endpoint,
    },
  });
});

// =============================================
// 啟動伺服器
// =============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 數位學伴後端已啟動！');
  console.log(`   網頁（單一伺服器模式）：http://localhost:${PORT}`);
  console.log(`   健康檢查：http://localhost:${PORT}/health`);
  console.log('');

  // 啟動提醒排程
  startScheduler();
});

export default app;
