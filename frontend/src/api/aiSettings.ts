// =============================================
// api/aiSettings.ts — AI 模型設定的前端呼叫封裝
// 對應後端 routes/aiSettings.ts。
// =============================================
import { AiConfig, ClaudeAccountStatus, TestConnectionResult } from '../types/index.js';

const BASE = '/api/ai';

// 統一的 JSON 取用：後端偶爾會回 HTML 而非 JSON（路由不存在 = 404、伺服器掛了 = 500），
// 直接 .json() 會丟出「Unexpected token '<'」這種非技術使用者看不懂的錯誤。
// 這裡先檢查 content-type，轉成人看得懂的訊息。
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (res.status === 404) throw new Error('找不到這個功能，請確認後端伺服器是最新版本後再試。');
    throw new Error(`伺服器回應異常（HTTP ${res.status}）。請重新啟動後端再試。`);
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

// 取得目前設定＋三個按鈕的預設值＋供應商模型
export async function getAiSettings(): Promise<{
  current: AiConfig;
  presets: Record<string, AiConfig>;
  provider_models: Record<string, { id: string; name: string }[]>;
  auth_status: Record<string, { logged_in: boolean; email?: string }>;
}> {
  return request('/settings');
}

// 查詢 CLIProxyAPI 各供應商登入狀態
export async function getCliProxyStatus(): Promise<Record<string, { logged_in: boolean; email?: string }>> {
  return request('/cliproxy/status');
}

// 請求 CLIProxyAPI OAuth 登入授權網址
export async function cliProxyLogin(provider: string): Promise<{ ok: boolean; auth_url: string; provider: string }> {
  return request('/cliproxy/login', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
}

// 手動送出回呼網址（由後端在本機直接代為轉發交握）
export async function sendCliProxyCallback(
  callback_url: string
): Promise<{ ok: boolean; message: string; auth_status?: any }> {
  return request('/cliproxy/callback', {
    method: 'POST',
    body: JSON.stringify({ callback_url }),
  });
}

// 斷開指定供應商的授權連結
export async function cliProxyDisconnect(
  provider: string
): Promise<{ ok: boolean; message: string; auth_status?: any }> {
  return request('/cliproxy/disconnect', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
}

// 執行 Health Check 並動態取得真實可用模型
export async function healthCheckAi(
  endpoint: string,
  api_key?: string,
  provider?: string
): Promise<{ ok: boolean; models?: string[]; fallback_manual?: boolean; message?: string; error?: string }> {
  return request('/health_check', {
    method: 'POST',
    body: JSON.stringify({ endpoint, api_key, provider }),
  });
}

// 儲存設定
export async function saveAiSettings(cfg: AiConfig): Promise<{ ok: boolean; current: AiConfig }> {
  return request('/settings', { method: 'POST', body: JSON.stringify(cfg) });
}

// 實際 ping 一次模型，驗證連線
export async function testAiConnection(cfg: AiConfig): Promise<TestConnectionResult> {
  return request('/test', { method: 'POST', body: JSON.stringify(cfg) });
}

// 偵測本機 Claude Code 登入狀態（相容舊版）
export async function getClaudeAccount(): Promise<ClaudeAccountStatus> {
  return request('/claude_account');
}

// 開終端機跑 `claude auth login`（相容舊版）
export async function claudeLogin(): Promise<{ ok: boolean; started: boolean; message: string }> {
  return request('/claude_login', { method: 'POST', body: JSON.stringify({}) });
}
