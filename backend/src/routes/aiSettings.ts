// =============================================
// routes/aiSettings.ts — AI 模型設定路由
// 對應前端的三按鈕設定面板（訂閱制 Claude／外部雲端／自建本地）。
// =============================================
import { Router, Request, Response } from 'express';
import { getAiSettings, saveAiSettings, PRESETS } from '../services/aiSettings';
import { testAiConnection } from '../services/aiClient';
import { getClaudeAccount, claudeLogin } from '../services/claudeCli';
import type { AiConfig } from '../types/index';

const router = Router();

// GET /api/ai/settings — 目前設定 ＋ 三個按鈕的預設值
router.get('/settings', (_req: Request, res: Response) => {
  res.json({ current: getAiSettings(), presets: PRESETS });
});

// POST /api/ai/settings — 儲存設定
router.post('/settings', (req: Request, res: Response) => {
  const body = req.body as Partial<AiConfig>;
  if (!body || !body.endpoint || !body.model_name) {
    return res.status(400).json({ error: '缺少 endpoint 或 model_name' });
  }
  const saved = saveAiSettings(body);
  return res.json({ ok: true, current: saved });
});

// POST /api/ai/test — 真的 ping 一次模型，驗證連線
router.post('/test', async (req: Request, res: Response) => {
  const body = req.body as Partial<AiConfig>;
  const cfg: AiConfig = { ...getAiSettings(), ...body };
  const result = await testAiConnection(cfg);
  return res.json(result);
});

// GET /api/ai/claude_account — 偵測本機 Claude Code 登入狀態
router.get('/claude_account', async (_req: Request, res: Response) => {
  const status = await getClaudeAccount();
  return res.json(status);
});

// POST /api/ai/claude_login — 開終端機跑 `claude auth login`
router.post('/claude_login', async (_req: Request, res: Response) => {
  const result = await claudeLogin();
  return res.json(result);
});

export default router;
