import { useEffect, useState, useRef } from 'react';
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  getCliProxyStatus,
  cliProxyLogin,
} from '../api/aiSettings.js';
import { AiConfig, TestConnectionResult } from '../types/index.js';
import './AiSettings.css';

type ProviderKey = 'claude' | 'openai' | 'google';

const PROVIDERS: { key: ProviderKey; name: string; emoji: string }[] = [
  { key: 'claude', name: '訂閱制 Claude', emoji: '🟣' },
  { key: 'openai', name: '訂閱制 OpenAI', emoji: '🟢' },
  { key: 'google', name: '訂閱制 Google AI Pro', emoji: '🔵' },
];

function Guide({ provider }: { provider: ProviderKey }) {
  if (provider === 'claude') {
    return (
      <div className="provider-guide">
        <strong>🟣 訂閱制 Claude（透過 CLIProxyAPI）</strong>
        <p>吃你現有的 Claude 訂閱方案額度（Pro / Team），免 API Key。</p>
        <p>點選下方「連結帳號」按鈕完成 OAuth 授權，登入後即可直接使用。</p>
      </div>
    );
  }
  if (provider === 'openai') {
    return (
      <div className="provider-guide">
        <strong>🟢 訂閱制 OpenAI（透過 CLIProxyAPI）</strong>
        <p>吃你現有的 ChatGPT / OpenAI 訂閱方案額度（Plus / Team），免 API Key。</p>
        <p>點選下方「連結帳號」按鈕完成 OAuth 授權，登入後即可直接使用。</p>
      </div>
    );
  }
  return (
    <div className="provider-guide">
      <strong>🔵 訂閱制 Google AI Pro（透過 CLIProxyAPI）</strong>
      <p>吃 Google One AI Premium 或 Gemini 方案額度，免 API Key。</p>
      <p>點選下方「連結帳號」按鈕完成 Google 授權，登入後即可直接使用。</p>
    </div>
  );
}

export default function AiSettings() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<AiConfig | null>(null);

  useEffect(() => {
    getAiSettings()
      .then((r) => setCurrent(r.current))
      .catch(() => setCurrent(null));
  }, []);

  return (
    <>
      <button className="ai-gear" onClick={() => setOpen(true)} title="AI 模型設定">
        <span className={`ai-dot ${current ? 'on' : ''}`} />
        ⚙ AI 模型{current ? `：${current.name}` : ''}
      </button>
      {open && (
        <Panel
          onClose={(saved) => {
            setOpen(false);
            if (saved) setCurrent(saved);
          }}
        />
      )}
    </>
  );
}

function Panel({ onClose }: { onClose: (saved?: AiConfig) => void }) {
  const [presets, setPresets] = useState<Record<string, AiConfig> | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, { id: string; name: string }[]> | null>(null);
  const [authStatus, setAuthStatus] = useState<Record<string, { logged_in: boolean; email?: string }>>({});
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('claude');
  const [form, setForm] = useState<AiConfig | null>(null);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<TestConnectionResult | null>(null);
  const pollTimerRef = useRef<any>(null);

  // 載入設定與登入狀態
  const loadData = async () => {
    try {
      const data = await getAiSettings();
      setPresets(data.presets);
      setProviderModels(data.provider_models);
      if (data.auth_status) setAuthStatus(data.auth_status);

      const curKind = (data.current?.kind as ProviderKey) || 'claude';
      const validProvider: ProviderKey = ['claude', 'openai', 'google'].includes(curKind) ? curKind : 'claude';
      setSelectedProvider(validProvider);

      setForm({
        ...data.presets[validProvider],
        ...data.current,
        endpoint: 'http://localhost:8317/v1',
        kind: validProvider,
      });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // 當切換供應商時
  const pickProvider = (key: ProviderKey) => {
    setSelectedProvider(key);
    setResult(null);
    if (presets && presets[key]) {
      const defaultModel = providerModels?.[key]?.[0]?.id || presets[key].model_name;
      setForm({
        ...presets[key],
        endpoint: 'http://localhost:8317/v1',
        model_name: defaultModel,
        kind: key,
      });
    }
  };

  // 點擊「連結帳號」按鈕
  const handleConnect = async () => {
    setConnecting(true);
    setResult(null);
    try {
      const res = await cliProxyLogin(selectedProvider);
      if (res.auth_url) {
        // 在新分頁開啟 OAuth 授權頁
        window.open(res.auth_url, '_blank');
      }

      // 開始輪詢登入狀態（每 2 秒一次，最多 60 秒）
      let attempts = 0;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        attempts++;
        const status = await getCliProxyStatus().catch(() => null);
        if (status) {
          setAuthStatus(status);
          if (status[selectedProvider]?.logged_in) {
            clearInterval(pollTimerRef.current);
            setConnecting(false);
          }
        }
        if (attempts > 30) {
          clearInterval(pollTimerRef.current);
          setConnecting(false);
        }
      }, 2000);
    } catch (e: any) {
      setResult({ ok: false, message: `連結失敗：${e.message || e}`, sample: '' });
      setConnecting(false);
    }
  };

  const test = async () => {
    if (!form) return;
    setTesting(true);
    setResult(null);
    const r = await testAiConnection(form).catch((e) => ({
      ok: false,
      message: String(e.message || e),
      sample: '',
    }));
    setResult(r);
    setTesting(false);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const r = await saveAiSettings({
        ...form,
        endpoint: 'http://localhost:8317/v1',
      });
      onClose(r.current);
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e), sample: '' });
    } finally {
      setSaving(false);
    }
  };

  if (!form || !presets) {
    return (
      <div className="ai-overlay" onClick={() => onClose()}>
        <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
          <p className="ai-hint">載入設定中…</p>
        </div>
      </div>
    );
  }

  const currentAuth = authStatus[selectedProvider];
  const isLoggedIn = !!currentAuth?.logged_in;
  const models = providerModels?.[selectedProvider] || [];

  return (
    <div className="ai-overlay" onClick={() => onClose()}>
      <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ai-panel-head">
          <h3>AI 模型設定</h3>
          <button className="ai-x" onClick={() => onClose()}>✕</button>
        </div>
        <p className="ai-hint">使用 CLIProxyAPI 本地代理服務，直接吃你的 AI 訂閱額度，免填 API Key。</p>

        {/* 頂部三按鈕 */}
        <div className="preset-row">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              className={`preset-btn ${selectedProvider === p.key ? 'on' : ''}`}
              onClick={() => pickProvider(p.key)}
            >
              <div className="preset-emoji">{p.emoji}</div>
              <div className="preset-name">{p.name}</div>
            </button>
          ))}
        </div>

        {/* 說明文字 */}
        <Guide provider={selectedProvider} />

        {/* 帳號連結狀態與按鈕 */}
        <div className="auth-card">
          <div className="auth-card-info">
            <span className="auth-label">帳號狀態：</span>
            {isLoggedIn ? (
              <span className="auth-badge success">
                ✓ 已登入 {currentAuth?.email ? `(${currentAuth.email})` : ''}
              </span>
            ) : (
              <span className="auth-badge warning">⚠️ 尚未連結帳號</span>
            )}
          </div>
          <button
            className={`ai-btn ${isLoggedIn ? 'ghost' : 'connect-btn'}`}
            disabled={connecting}
            onClick={handleConnect}
          >
            {connecting
              ? '⏳ 開啟登入頁面並等待授權…'
              : isLoggedIn
              ? '🔄 重新登入 / 切換帳號'
              : '🔗 連結帳號（前往登入）'}
          </button>
        </div>

        {/* 欄位設定 */}
        <div className="ai-fields">
          {/* endpoint 自動帶入並關閉/隱藏手動編輯 */}
          <div className="endpoint-banner">
            <span className="endpoint-icon">⚡</span>
            <span>API 端點已自動連結本機代理（<code>http://localhost:8317/v1</code>）</span>
          </div>

          {/* 模型名稱改成「模型」並提供下拉選單 */}
          <label htmlFor="model-select">模型</label>
          <select
            id="model-select"
            className="model-select"
            value={form.model_name}
            onChange={(e) => setForm({ ...form, model_name: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.id})
              </option>
            ))}
            {!models.some((m) => m.id === form.model_name) && (
              <option value={form.model_name}>{form.model_name} (自訂)</option>
            )}
          </select>
        </div>

        {result && (
          <div className={`test-result ${result.ok ? 'ok' : 'bad'}`}>
            {result.ok ? `✓ ${result.message}` : `✕ ${result.message}`}
            {result.sample ? `（回應：${result.sample}）` : ''}
          </div>
        )}

        <div className="ai-actions">
          <button className="ai-btn" disabled={testing} onClick={test}>
            {testing ? '測試中…' : '測試連線'}
          </button>
          <button className="ai-btn primary" disabled={saving} onClick={save}>
            {saving ? '儲存中…' : '儲存設定'}
          </button>
        </div>
        <p className="ai-foot muted">設定會自動儲存於系統，重啟後仍會生效。</p>
      </div>
    </div>
  );
}
