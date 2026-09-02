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
  console.log('🚀 數位學伴後端 API 已啟動！');
  console.log(`   API 伺服器：http://localhost:${PORT}`);
  console.log(`   健康檢查：http://localhost:${PORT}/health`);
  console.log('');

  // 啟動提醒排程
  startScheduler();
});

export default app;
