// =============================================
// aiClient.ts — 統一的 AI 呼叫入口
//
// 呼叫端永遠只呼叫 callOpenAICompatible(cfg, messages)，由它依 endpoint 前綴自動分流：
//   - endpoint 為 "claude-cli://..."  → 走本機 claude CLI（吃訂閱額度，見 claudeCli.ts）
//   - 其他（外部雲端／自建本地）      → 打 OpenAI 相容的 /chat/completions
// =============================================
import type { AiConfig, AiMessage, TestConnectionResult } from '../types/index';
import { callClaudeCli, callClaudeCliVision } from './claudeCli';

import crypto from 'crypto';

const CLAUDE_CLI_PREFIX = 'claude-cli';

// Crush 架構：為工作階段生成確定性的快取親和性 Header (Cache Affinity)
export function sessionHeaders(sessionId: string | number): Record<string, string> {
  const hash = crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 16);
  return {
    'x-session-id': hash,
    'x-session-affinity': hash,
  };
}

export interface CallAiOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface CallAiResult {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callOpenAICompatibleWithUsage(
  cfg: AiConfig,
  messages: AiMessage[],
  options?: CallAiOptions
): Promise<CallAiResult> {
  const timeoutMs = options?.timeoutMs || 120_000;

  if (cfg.endpoint && cfg.endpoint.trim().toLowerCase().startsWith(CLAUDE_CLI_PREFIX)) {
    const text = await callClaudeCli(messages, cfg.model_name, Math.max(timeoutMs, 180_000));
    return { content: text };
  }

  const url = cfg.endpoint.replace(/\/+$/, '') + '/chat/completions';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options?.headers || {}),
  };
  if (cfg.api_key) headers.Authorization = `Bearer ${cfg.api_key}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({ model: cfg.model_name, messages, temperature: 0.1 }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`API 錯誤 ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = (data?.choices?.[0]?.message?.content || '').trim();
    const usage = data?.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        }
      : undefined;

    return { content, usage };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`連線逾時（超過 ${timeoutMs / 1000} 秒）`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function callOpenAICompatible(
  cfg: AiConfig,
  messages: AiMessage[],
  timeoutMs = 120_000,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const res = await callOpenAICompatibleWithUsage(cfg, messages, {
    timeoutMs,
    headers: extraHeaders,
  });
  return res.content;
}

// ── 圖片辨識（課表上傳用）─────────────────────────────────────────────────
// 三種模型來源都支援：
//   - 訂閱制 Claude → 把圖片存成暫存檔，讓 Claude Code 用 Read 工具讀取
//     （headless 模式需要 bypassPermissions 才不會卡在權限詢問，見 claudeCli.ts）
//   - 外部雲端／自建本地 → OpenAI 相容 /chat/completions 的 image_url 多模態格式
//     （自建本地要選支援視覺的模型，例如 Ollama 的 gemma3、llava）
export async function callVisionModel(
  cfg: AiConfig,
  promptText: string,
  imageBase64: string,
  mimeType: string,
  timeoutMs = 90_000
): Promise<string> {
  if (cfg.endpoint && cfg.endpoint.trim().toLowerCase().startsWith(CLAUDE_CLI_PREFIX)) {
    return callClaudeCliVision(promptText, imageBase64, mimeType, cfg.model_name, Math.max(timeoutMs, 120_000));
  }

  const url = cfg.endpoint.replace(/\/+$/, '') + '/chat/completions';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (cfg.api_key) headers.Authorization = `Bearer ${cfg.api_key}`;

  const body = {
    model: cfg.model_name,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { method: 'POST', headers, signal: ctrl.signal, body: JSON.stringify(body) });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`圖片辨識 API 錯誤 ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    return (data?.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`圖片辨識逾時（超過 ${timeoutMs / 1000} 秒），可嘗試較小的圖片或較快的模型。`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function testAiConnection(cfg: AiConfig): Promise<TestConnectionResult> {
  try {
    const reply = await callOpenAICompatible(
      cfg,
      [
        { role: 'system', content: '你是測試助手，請只用 5 個字以內回覆「連線成功」。' },
        { role: 'user', content: 'ping' },
      ],
      30_000
    );
    const sample = (reply || '').trim().slice(0, 60);
    return { ok: !!sample, message: sample ? '模型連線成功' : '模型有回應但內容為空', sample };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), sample: '' };
  }
}
