// =============================================
// aiSettings.ts — AI 模型設定的讀取與儲存
//
// 設定存成一個 JSON 檔（backend/data/ai-settings.json），取代手動編輯 .env。
// 第一次啟動、還沒存過設定時，預設沿用 .env 裡的 LOCAL_LLM_API_URL / LOCAL_LLM_MODEL
// （行為與舊版完全相容，不會讓現有使用者的設定失效）。
// =============================================
import fs from 'node:fs';
import path from 'node:path';
import type { AiConfig } from '../types/index';

const DATA_DIR = path.resolve(process.env.AI_SETTINGS_DIR || './data');
const SETTINGS_PATH = path.join(DATA_DIR, 'ai-settings.json');

// 三顆按鈕的預設值（語義固定：訂閱制／外部雲端／自建本地）
export const PRESETS: Record<AiConfig['kind'], AiConfig> = {
  subscription: {
    kind: 'subscription',
    name: '訂閱制 Claude（本機）',
    endpoint: 'claude-cli://local',
    model_name: 'sonnet',
    api_key: '',
    is_local: false,
  },
  external: {
    kind: 'external',
    name: '外部雲端（Gemini）',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model_name: 'gemini-3.1-flash-lite',
    api_key: '',
    is_local: false,
  },
  local: {
    kind: 'local',
    name: '自建／本地（Ollama）',
    endpoint: 'http://localhost:11434/v1',
    model_name: 'gemma3:12b',
    api_key: '',
    is_local: true,
  },
};

// 舊版 .env 存的是完整的 .../chat/completions 網址，這裡去掉尾巴，
// 統一成「base endpoint」，跟 callOpenAICompatible 的組合方式一致。
function stripChatCompletions(url: string): string {
  return url.replace(/\/chat\/completions\/?$/, '');
}

function defaultsFromEnv(): AiConfig {
  const envUrl = process.env.LOCAL_LLM_API_URL;
  return {
    ...PRESETS.local,
    endpoint: envUrl ? stripChatCompletions(envUrl) : PRESETS.local.endpoint,
    model_name: process.env.LOCAL_LLM_MODEL || PRESETS.local.model_name,
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getAiSettings(): AiConfig {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.endpoint && parsed.model_name) {
        return { ...defaultsFromEnv(), ...parsed };
      }
    }
  } catch {
    /* 檔案損毀時直接回退到 .env 預設值 */
  }
  return defaultsFromEnv();
}

export function saveAiSettings(cfg: Partial<AiConfig>): AiConfig {
  const current = getAiSettings();
  const next: AiConfig = {
    kind: cfg.kind || current.kind,
    name: cfg.name ?? current.name,
    endpoint: cfg.endpoint ?? current.endpoint,
    model_name: cfg.model_name ?? current.model_name,
    api_key: cfg.api_key ?? current.api_key,
    is_local: cfg.is_local ?? current.is_local,
  };
  ensureDataDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}
