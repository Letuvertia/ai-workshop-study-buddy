import { useEffect, useState, useRef } from 'react';
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  getCliProxyStatus,
  cliProxyLogin,
  healthCheckAi,
} from '../api/aiSettings.js';
import { AiConfig, TestConnectionResult } from '../types/index.js';
import './AiSettings.css';

type ProviderKey = 'claude' | 'openai' | 'google' | 'custom';

const PROVIDERS: { key: ProviderKey; name: string; emoji: string }[] = [
  { key: 'claude', name: '訂閱制 Claude', emoji: '🟣' },
  { key: 'openai', name: '訂閱制 OpenAI', emoji: '🟢' },
  { key: 'google', name: '訂閱制 Google AI Pro', emoji: '🔵' },
  { key: 'custom', name: '自訂模型端點', emoji: '⚙️' },
];

function Guide({ provider }: { provider: ProviderKey }) {
  if (provider === 'claude') {
    return (
      <div className="provider-guide">
        <strong>🟣 訂閱制 Claude（透過 CLIProxyAPI）</strong>
        <p>吃你現有的 Claude 訂閱方案額度（Pro / Team），免 API Key。</p>
        <p>點選下方「連結帳號」完成授權，打通後將自動載入可用的模型選單。</p>
      </div>
    );
  }
  if (provider === 'openai') {
    return (
      <div className="provider-guide">
        <strong>🟢 訂閱制 OpenAI（透過 CLIProxyAPI）</strong>
        <p>吃你現有的 ChatGPT / OpenAI 訂閱方案額度（Plus / Team），免 API Key。</p>
        <p>點選下方「連結帳號」完成授權，打通後將自動載入可用的模型選單。</p>
      </div>
    );
  }
  if (provider === 'google') {
    return (
      <div className="provider-guide">
        <strong>🔵 訂閱制 Google AI Pro（透過 CLIProxyAPI）</strong>
        <p>吃 Google One AI Premium 或 Gemini 方案額度，免 API Key。</p>
        <p>點選下方「連結帳號」完成授權，打通後將自動載入可用的模型選單。</p>
      </div>
    );
  }
  return (
    <div className="provider-guide">
      <strong>⚙️ 自訂模型端點</strong>
      <p>可串接本機 Ollama（如 <code>http://localhost:11434/v1</code>）或任意相容 OpenAI 格式的自建 / 外部服務。</p>
      <p>輸入端點與金鑰後，需先點擊「Health Check」測試連線，通過後方可選擇可用模型。</p>
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
  const [authStatus, setAuthStatus] = useState<Record<string, { logged_in: boolean; email?: string }>>({});
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('claude');
  const [form, setForm] = useState<AiConfig | null>(null);

  // 實際打通後取得的真實模型清單
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthPassed, setHealthPassed] = useState(false);
  const [healthMessage, setHealthMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [fallbackManual, setFallbackManual] = useState(false);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<TestConnectionResult | null>(null);
  const pollTimerRef = useRef<any>(null);

  // 執行 Health Check 並抓取可用模型
  const checkEndpointHealth = async (endpoint: string, apiKey: string, provider: ProviderKey) => {
    setCheckingHealth(true);
    setHealthMessage(null);
    try {
      const res = await healthCheckAi(endpoint, apiKey, provider);
      if (res.ok) {
        setHealthPassed(true);
        setFallbackManual(!!res.fallback_manual);
        const models = res.models || [];
        setLiveModels(models);
        setHealthMessage({ ok: true, text: res.message || `連線成功！取得 ${models.length} 個模型` });
        if (models.length > 0) {
          setForm((prev) => (prev ? { ...prev, model_name: prev.model_name && models.includes(prev.model_name) ? prev.model_name : models[0] } : prev));
        }
      } else {
        setHealthPassed(false);
        setLiveModels([]);
        setHealthMessage({ ok: false, text: res.error || 'Health Check 失敗' });
      }
    } catch (e: any) {
      setHealthPassed(false);
      setLiveModels([]);
      setHealthMessage({ ok: false, text: `連線異常：${e.message || e}` });
    } finally {
      setCheckingHealth(false);
    }
  };

  // 載入初始設定
  const loadData = async () => {
    try {
      const data = await getAiSettings();
      setPresets(data.presets);
      if (data.auth_status) setAuthStatus(data.auth_status);

      const curKind = (data.current?.kind as ProviderKey) || 'claude';
      const validProvider: ProviderKey = ['claude', 'openai', 'google', 'custom'].includes(curKind) ? curKind : 'claude';
      setSelectedProvider(validProvider);

      const initialForm: AiConfig = {
        ...data.presets[validProvider],
        ...data.current,
        endpoint: validProvider === 'custom' ? data.current?.endpoint || '' : 'http://localhost:8317/v1',
        kind: validProvider,
      };
      setForm(initialForm);

      // 如果不是自訂端點，自動檢查 CLIProxyAPI 是否有模型
      if (validProvider !== 'custom') {
        checkEndpointHealth('http://localhost:8317/v1', '', validProvider);
      }
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
    setHealthMessage(null);

    const basePreset = presets?.[key] || {
      kind: key,
      name: key === 'custom' ? '自訂模型端點' : '訂閱制服務',
      endpoint: key === 'custom' ? '' : 'http://localhost:8317/v1',
      model_name: '',
      api_key: '',
      is_local: false,
    };

    setForm({
      ...basePreset,
      endpoint: key === 'custom' ? '' : 'http://localhost:8317/v1',
      model_name: '',
      kind: key,
    });

    if (key === 'custom') {
      setHealthPassed(false);
      setLiveModels([]);
    } else {
      checkEndpointHealth('http://localhost:8317/v1', '', key);
    }
  };

  // 點擊「連結帳號」按鈕
  const handleConnect = async () => {
    setConnecting(true);
    setResult(null);
    try {
      const res = await cliProxyLogin(selectedProvider);
      if (res.auth_url) {
        window.open(res.auth_url, '_blank');
      }

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
            // 登入成功後，立刻重新打通並載入真實模型清單！
            checkEndpointHealth('http://localhost:8317/v1', '', selectedProvider);
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
    if (!form.model_name) {
      setResult({ ok: false, message: '請選擇或輸入模型代號', sample: '' });
      return;
    }
    setSaving(true);
    try {
      const r = await saveAiSettings(form);
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

  const isCustom = selectedProvider === 'custom';
  const currentAuth = authStatus[selectedProvider];
  const isLoggedIn = !!currentAuth?.logged_in;

  return (
    <div className="ai-overlay" onClick={() => onClose()}>
      <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ai-panel-head">
          <h3>AI 模型設定</h3>
          <button className="ai-x" onClick={() => onClose()}>✕</button>
        </div>
        <p className="ai-hint">支援各大訂閱制方案直連與自訂端點。模型清單將在連線打通後動態載入。</p>

        {/* 頂部四按鈕選項 */}
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

        {/* 訂閱制帳號連結區塊 */}
        {!isCustom && (
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
        )}

        {/* 欄位設定 */}
        <div className="ai-fields">
          {/* 端點欄位 */}
          {!isCustom ? (
            <div className="endpoint-banner">
              <span className="endpoint-icon">⚡</span>
              <span>API 端點已自動指定為本機代理（<code>http://localhost:8317/v1</code>）</span>
            </div>
          ) : (
            <>
              <label htmlFor="endpoint-input">API 端點</label>
              <input
                id="endpoint-input"
                type="text"
                placeholder="例如 http://localhost:11434/v1 或 https://api.openai.com/v1"
                value={form.endpoint}
                onChange={(e) => {
                  setForm({ ...form, endpoint: e.target.value });
                  setHealthPassed(false);
                  setLiveModels([]);
                  setHealthMessage(null);
                }}
              />

              <label htmlFor="apikey-input">API Key</label>
              <input
                id="apikey-input"
                type="password"
                placeholder="貼上 API Key（若為本機 Ollama 則留空）"
                value={form.api_key}
                onChange={(e) => {
                  setForm({ ...form, api_key: e.target.value });
                  setHealthPassed(false);
                  setLiveModels([]);
                  setHealthMessage(null);
                }}
              />
            </>
          )}

          {/* Health Check 按鈕（置於 API Key 與模型之間） */}
          <div className="health-check-row">
            <button
              type="button"
              className="health-check-btn"
              disabled={checkingHealth || (!form.endpoint && isCustom)}
              onClick={() => checkEndpointHealth(form.endpoint, form.api_key, selectedProvider)}
            >
              {checkingHealth ? '⏳ 正在檢查連線與查詢模型…' : '🩺 檢查連線 (Health Check)'}
            </button>
            {healthMessage && (
              <div className={`health-check-msg ${healthMessage.ok ? 'ok' : 'bad'}`}>
                {healthMessage.ok ? '✓ ' : '✕ '}
                {healthMessage.text}
              </div>
            )}
          </div>

          {/* 模型下拉選單：只有當 health check 通過時才出現！ */}
          {healthPassed ? (
            <>
              <label htmlFor="model-select">模型</label>
              {liveModels.length > 0 ? (
                <select
                  id="model-select"
                  className="model-select"
                  value={form.model_name}
                  onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                >
                  {liveModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {!liveModels.includes(form.model_name) && form.model_name && (
                    <option value={form.model_name}>{form.model_name} (自訂)</option>
                  )}
                </select>
              ) : fallbackManual ? (
                <input
                  type="text"
                  placeholder="輸入模型名稱，例如 gpt-4o 或 gemma:latest"
                  value={form.model_name}
                  onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                />
              ) : (
                <div className="health-check-notice">
                  ⚠️ 端點已連線，但目前未偵測到相容的模型清單。若為訂閱制，請確認已完成「連結帳號」。
                </div>
              )}
            </>
          ) : (
            <div className="health-check-notice">
              💡 {isCustom ? '請先輸入端點與 API Key，並點擊上方的「檢查連線 (Health Check)」；通過後才會顯示可用的模型下拉選單。' : '請點擊上方「檢查連線 (Health Check)」或完成「連結帳號」，打通後將自動顯示可用模型。'}
            </div>
          )}
        </div>

        {result && (
          <div className={`test-result ${result.ok ? 'ok' : 'bad'}`}>
            {result.ok ? `✓ ${result.message}` : `✕ ${result.message}`}
            {result.sample ? `（回應：${result.sample}）` : ''}
          </div>
        )}

        <div className="ai-actions">
          <button className="ai-btn" disabled={testing || !form.model_name} onClick={test}>
            {testing ? '測試中…' : '測試對話'}
          </button>
          <button className="ai-btn primary" disabled={saving || !form.model_name} onClick={save}>
            {saving ? '儲存中…' : '儲存設定'}
          </button>
        </div>
        <p className="ai-foot muted">設定會自動儲存於系統，重啟後仍會生效。</p>
      </div>
    </div>
  );
}
