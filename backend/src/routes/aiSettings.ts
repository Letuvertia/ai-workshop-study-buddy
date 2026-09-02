// =============================================
// routes/aiSettings.ts — AI 模型設定路由
// 對應前端的三按鈕設定面板（訂閱制 Claude／訂閱制 OpenAI／訂閱制 Google AI Pro）。
// =============================================
import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getAiSettings, saveAiSettings, PRESETS, PROVIDER_MODELS } from '../services/aiSettings';
import { testAiConnection } from '../services/aiClient';
import { getClaudeAccount, claudeLogin } from '../services/claudeCli';
import type { AiConfig, CliProxyAuthMap } from '../types/index';

const router = Router();

let currentLoginProcess: ChildProcess | null = null;

function getCliProxyAuthStatus(): CliProxyAuthMap {
  const authDir = path.join(os.homedir(), '.cli-proxy-api');
  const res: CliProxyAuthMap = {
    claude: { logged_in: false },
    openai: { logged_in: false },
    google: { logged_in: false },
  };
  if (!fs.existsSync(authDir)) return res;

  try {
    const files = fs.readdirSync(authDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(authDir, file);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const type = (content.type || '').toLowerCase();
        const email = content.email || '';
        if (file.startsWith('claude-') || type === 'claude') {
          res.claude = { logged_in: true, email, type: 'claude' };
        } else if (file.startsWith('codex-') || type === 'codex' || type === 'openai') {
          res.openai = { logged_in: true, email, type: 'openai' };
        } else if (file.startsWith('antigravity-') || file.startsWith('gemini-') || type === 'antigravity' || type === 'gemini') {
          res.google = { logged_in: true, email, type: 'google' };
        }
      } catch {
        /* ignore corrupt file */
      }
    }
  } catch {
    /* ignore dir read error */
  }
  return res;
}

// GET /api/ai/settings — 目前設定 ＋ 三個按鈕的預設值 ＋ 各供應商模型清單
router.get('/settings', (_req: Request, res: Response) => {
  res.json({
    current: getAiSettings(),
    presets: PRESETS,
    provider_models: PROVIDER_MODELS,
    auth_status: getCliProxyAuthStatus(),
  });
});

// GET /api/ai/cliproxy/status — 查詢三種訂閱制在 CLIProxyAPI 中的登入授權狀態
router.get('/cliproxy/status', (_req: Request, res: Response) => {
  res.json(getCliProxyAuthStatus());
});

// GET /api/ai/cliproxy/models — 取得各供應商支援的模型選單
router.get('/cliproxy/models', (_req: Request, res: Response) => {
  res.json({ models: PROVIDER_MODELS });
});

// POST /api/ai/health_check — 檢查端點連線並動態取得實際可用的模型清單
router.post('/health_check', async (req: Request, res: Response) => {
  const { endpoint, api_key, provider } = req.body as {
    endpoint?: string;
    api_key?: string;
    provider?: string;
  };

  const base = (endpoint || '').trim().replace(/\/+$/, '');
  if (!base) {
    return res.status(400).json({ ok: false, error: '請輸入 API 端點網址' });
  }

  const modelsUrl = base.endsWith('/models') ? base : `${base}/models`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (api_key && api_key.trim()) {
    headers['Authorization'] = `Bearer ${api_key.trim()}`;
  }

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      let rawList: string[] = [];
      if (Array.isArray(data?.data)) {
        rawList = data.data.map((m: any) => m.id || m.name).filter(Boolean);
      } else if (Array.isArray(data?.models)) {
        rawList = data.models.map((m: any) => m.name || m.id).filter(Boolean);
      } else if (Array.isArray(data)) {
        rawList = data.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      }

      let filtered = rawList;
      if (provider === 'claude') {
        filtered = rawList.filter((id) => /claude/i.test(id));
      } else if (provider === 'openai') {
        filtered = rawList.filter((id) => /gpt|o1|o3|codex/i.test(id));
      } else if (provider === 'google') {
        filtered = rawList.filter((id) => /gemini/i.test(id));
      }

      const finalList = filtered.length > 0 ? filtered : rawList;

      return res.json({
        ok: true,
        models: finalList,
        message: `Health Check 通過！成功取得 ${finalList.length} 個可用模型。`,
      });
    }

    // 若 /models 回應失敗，嘗試用 test 連線
    const testCfg: AiConfig = {
      kind: (provider as any) || 'custom',
      name: '自訂端點',
      endpoint: base,
      model_name: 'test',
      api_key: api_key || '',
      is_local: false,
    };
    const testRes = await testAiConnection(testCfg);
    if (testRes.ok) {
      return res.json({
        ok: true,
        models: [],
        fallback_manual: true,
        message: 'Health Check 通過！（端點運作正常，但未開放 /models 清單，請手動輸入模型）',
      });
    }

    return res.status(response.status).json({
      ok: false,
      error: `端點回應 HTTP ${response.status}：${response.statusText}`,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: `連線失敗（${err.message}），請確認伺服器已啟動或網址正確。`,
    });
  }
});

// POST /api/ai/cliproxy/login — 啟動 CLIProxyAPI OAuth 登入，捕捉並回傳授權網址
router.post('/cliproxy/login', async (req: Request, res: Response) => {
  const { provider } = req.body as { provider: 'claude' | 'openai' | 'google' };
  const flagMap: Record<string, string> = {
    claude: '-claude-login',
    openai: '-codex-login',
    google: '-antigravity-login',
  };
  const flag = flagMap[provider] || '-claude-login';

  const binPath = path.resolve(__dirname, '../../bin', os.platform() === 'win32' ? 'cli-proxy-api.exe' : 'cli-proxy-api');
  const configPath = path.resolve(__dirname, '../../data/cliproxy-config.yaml');

  if (!fs.existsSync(binPath)) {
    return res.status(500).json({ ok: false, error: '尚未安裝 CLIProxyAPI 執行檔，請先執行 npm run cliproxy:install' });
  }

  // 關閉先前的登入程序
  if (currentLoginProcess && !currentLoginProcess.killed) {
    try {
      currentLoginProcess.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    currentLoginProcess = null;
  }

  let responded = false;
  const child = spawn(binPath, [flag, '-no-browser', '-config', configPath], {
    cwd: os.tmpdir(),
  });
  currentLoginProcess = child;

  let buffer = '';
  const timeoutTimer = setTimeout(() => {
    if (!responded) {
      responded = true;
      res.status(504).json({ ok: false, error: '取得登入授權網址逾時，請重試' });
    }
  }, 12_000);

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    buffer += text;
    // 匹配輸出中的 OAuth 網址
    const match = buffer.match(/https:\/\/[^\s"'`]+/);
    if (match && !responded) {
      responded = true;
      clearTimeout(timeoutTimer);
      const authUrl = match[0];
      return res.json({ ok: true, auth_url: authUrl, provider });
    }
  });

  child.stderr?.on('data', (chunk) => {
    buffer += chunk.toString();
  });

  child.on('close', (code) => {
    clearTimeout(timeoutTimer);
    if (!responded) {
      responded = true;
      res.status(500).json({ ok: false, error: `登入程序異常結束（代碼 ${code}）\n${buffer.slice(-300)}` });
    }
    currentLoginProcess = null;
  });
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

// GET /api/ai/claude_account — 偵測本機 Claude Code 登入狀態（相容舊版）
router.get('/claude_account', async (_req: Request, res: Response) => {
  const status = await getClaudeAccount();
  return res.json(status);
});

// POST /api/ai/claude_login — 開終端機跑 `claude auth login`（相容舊版）
router.post('/claude_login', async (_req: Request, res: Response) => {
  const result = await claudeLogin();
  return res.json(result);
});

export default router;
