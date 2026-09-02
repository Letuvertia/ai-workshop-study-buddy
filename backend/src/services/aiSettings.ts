// =============================================
// aiSettings.ts — AI 模型設定的讀取與儲存
//
// 設定存成一個 JSON 檔（backend/data/ai-settings.json），由網頁面板直接即時設定。
// 第一次啟動時預設使用訂閱制 Claude。
// =============================================
import fs from 'node:fs';
import path from 'node:path';
import type { AiConfig } from '../types/index';

const DATA_DIR = path.resolve(process.env.AI_SETTINGS_DIR || './data');
const SETTINGS_PATH = path.join(DATA_DIR, 'ai-settings.json');

// 預設支援的模型選項（由 CLIProxyAPI 提供轉發）
export const PROVIDER_MODELS: Record<string, { id: string; name: string }[]> = {
  claude: [
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (推薦)' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku (極速)' },
    { id: 'claude-3-opus', name: 'Claude 3 Opus (高思考力)' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (代理特化)' },
    { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (推薦)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (輕量快速)' },
    { id: 'o1', name: 'o1 (深度推理)' },
    { id: 'o3-mini', name: 'o3-mini (極速推理)' },
    { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B' },
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (推薦)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (快速)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash High' },
    { id: 'gemini-3.6-flash-high', name: 'Gemini 3.6 Flash High' },
    { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro Low' },
  ],
};

// 頂部按鈕預設值：訂閱制 Claude／訂閱制 OpenAI／訂閱制 Google AI Pro
export const PRESETS: Record<string, AiConfig> = {
  claude: {
    kind: 'claude',
    name: '訂閱制 Claude',
    endpoint: 'http://localhost:8317/v1',
    model_name: 'claude-3-7-sonnet',
    api_key: '',
    is_local: false,
  },
  openai: {
    kind: 'openai',
    name: '訂閱制 OpenAI',
    endpoint: 'http://localhost:8317/v1',
    model_name: 'gpt-4o',
    api_key: '',
    is_local: false,
  },
  google: {
    kind: 'google',
    name: '訂閱制 Google',
    endpoint: 'http://localhost:8317/v1',
    model_name: 'gemini-2.5-pro',
    api_key: '',
    is_local: false,
  },
  custom: {
    kind: 'custom',
    name: '自訂模型端點',
    endpoint: '',
    model_name: '',
    api_key: '',
    is_local: false,
  },
  // 保留舊版相容
  subscription: {
    kind: 'claude',
    name: '訂閱制 Claude',
    endpoint: 'http://localhost:8317/v1',
    model_name: 'claude-3-7-sonnet',
    api_key: '',
    is_local: false,
  },
  external: {
    kind: 'google',
    name: '外部雲端（Gemini）',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model_name: 'gemini-2.5-pro',
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
        return { ...PRESETS.claude, ...parsed };
      }
    }
  } catch {
    /* 檔案損毀時直接回退到預設值 */
  }

  return { ...PRESETS.claude };
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
