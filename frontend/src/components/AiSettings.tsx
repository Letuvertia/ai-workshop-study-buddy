import { useEffect, useState, useRef } from 'react';
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  getCliProxyStatus,
  cliProxyLogin,
  sendCliProxyCallback,
  healthCheckAi,
  cliProxyDisconnect,
} from '../api/aiSettings.js';
import { AiConfig, TestConnectionResult } from '../types/index.js';
import './AiSettings.css';

type ProviderKey = 'claude' | 'openai' | 'google' | 'custom';

// 官方品牌向量圖示
export function ClaudeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="#D97757" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  );
}

export function OpenAIIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 2406 2406" fill="#10a37f" aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs>
        <path
          id="openai-petal-ai-settings"
          d="M1107.3 299.1c-197.999 0-373.9 127.3-435.2 315.3L650 743.5v427.9c0 21.4 11 40.4 29.4 51.4l344.5 198.515V833.3h.1v-27.9L1372.7 604c33.715-19.52 70.44-32.857 108.47-39.828L1447.6 450.3C1361 353.5 1237.1 298.5 1107.3 299.1zm0 117.5-.6.6c79.699 0 156.3 27.5 217.6 78.4-2.5 1.2-7.4 4.3-11 6.1L952.8 709.3c-18.4 10.4-29.4 30-29.4 51.4V1248l-155.1-89.4V755.8c-.1-187.099 151.601-338.9 339-339.2z"
        />
      </defs>
      <use href="#openai-petal-ai-settings" />
      <use href="#openai-petal-ai-settings" transform="rotate(60 1203 1203)" />
      <use href="#openai-petal-ai-settings" transform="rotate(120 1203 1203)" />
      <use href="#openai-petal-ai-settings" transform="rotate(180 1203 1203)" />
      <use href="#openai-petal-ai-settings" transform="rotate(240 1203 1203)" />
      <use href="#openai-petal-ai-settings" transform="rotate(300 1203 1203)" />
    </svg>
  );
}

export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function CustomIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#64748b"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const PROVIDERS: {
  key: ProviderKey;
  name: string;
  renderIcon: (size?: number) => React.ReactNode;
}[] = [
  { key: 'claude', name: '訂閱制 Claude', renderIcon: (s = 22) => <ClaudeIcon size={s} /> },
  { key: 'openai', name: '訂閱制 OpenAI', renderIcon: (s = 22) => <OpenAIIcon size={s} /> },
  { key: 'google', name: '訂閱制 Google', renderIcon: (s = 22) => <GoogleIcon size={s} /> },
  { key: 'custom', name: '自訂模型端點', renderIcon: (s = 22) => <CustomIcon size={s} /> },
];

function Guide({ provider }: { provider: ProviderKey }) {
  if (provider === 'claude') {
    return (
      <div className="provider-guide">
        <strong className="guide-title">
          <ClaudeIcon size={17} /> 訂閱制 Claude（透過 CLIProxyAPI）
        </strong>
        <p>吃你現有的 Claude 訂閱方案額度（Pro / Team），免 API Key。</p>
        <p>點選下方「連結帳號」完成授權，打通後將自動載入可用的模型選單。</p>
      </div>
    );
  }
  if (provider === 'openai') {
    return (
      <div className="provider-guide">
        <strong className="guide-title">
          <OpenAIIcon size={17} /> 訂閱制 OpenAI（透過 CLIProxyAPI）
        </strong>
        <p>吃你現有的 OpenAI 訂閱方案額度（Plus / Team），免 API Key。</p>
        <p>點選下方「連結帳號」完成授權，打通後將自動載入可用的模型選單。</p>
      </div>
    );
  }
  if (provider === 'google') {
    return (
      <div className="provider-guide">
        <strong className="guide-title">
          <GoogleIcon size={17} /> 訂閱制 Google（透過 CLIProxyAPI）
        </strong>
        <p>吃你現有的 Google 訂閱方案額度（Plus / Pro），免 API Key。</p>
        <p>點選下方「連結帳號」完成授權，打通後將自動載入可用的模型選單。</p>
      </div>
    );
  }
  return (
    <div className="provider-guide">
      <strong className="guide-title">
        <CustomIcon size={17} /> 自訂模型端點
      </strong>
      <p>可串接本機 Ollama（如 <code>http://localhost:11434/v1</code>）或任意相容 OpenAI 格式的自建 / 外部服務。</p>
      <p>輸入端點與金鑰後，需先點擊「Health Check」測試連線，通過後方可選擇可用模型。</p>
    </div>
  );
}

export default function AiSettings() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<AiConfig | null>(null);
  const [authStatus, setAuthStatus] = useState<Record<string, { logged_in: boolean; email?: string }>>({});

  const refreshSettings = () => {
    getAiSettings()
      .then((r) => {
        setCurrent(r.current);
        if (r.auth_status) setAuthStatus(r.auth_status);
      })
      .catch(() => {
        setCurrent(null);
        setAuthStatus({});
      });
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  // 判斷各大方案是否有登入或是否為有效自訂設定：
  const hasAnyAuth = Object.values(authStatus).some((s) => s?.logged_in);
  const isCustomConfigured = current?.kind === 'custom' && Boolean(current.endpoint && current.model_name);
  const isCurrentActiveLoggedIn = Boolean(current?.kind && authStatus[current.kind]?.logged_in);

  // 若各大方案皆未登入且未設定自訂端點，或是目前選定的訂閱方案尚未登入，顯示為尚未設定（紅燈）
  const isConfigured = Boolean(
    current && (isCustomConfigured || (hasAnyAuth && isCurrentActiveLoggedIn))
  );

  return (
    <>
      <button className="ai-gear" onClick={() => setOpen(true)} title="AI 模型設定">
        <span className={`ai-dot ${isConfigured ? 'on' : 'off'}`} />
        ⚙ AI 模型：{isConfigured && current ? current.name : '尚未設定'}
      </button>
      {open && (
        <Panel
          onClose={(saved) => {
            setOpen(false);
            if (saved) setCurrent(saved);
            refreshSettings();
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
  const [disconnecting, setDisconnecting] = useState(false);
  const [callbackInput, setCallbackInput] = useState('');
  const [submittingCallback, setSubmittingCallback] = useState(false);
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

      // 只有當該訂閱制已經登入授權，才執行 Health Check 載入模型；否則保持未通過狀態
      if (validProvider !== 'custom' && data.auth_status?.[validProvider]?.logged_in) {
        checkEndpointHealth('http://localhost:8317/v1', '', validProvider);
      } else {
        setHealthPassed(false);
        setLiveModels([]);
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
    setHealthPassed(false);
    setLiveModels([]);

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

    // 只有在已登入狀態下才自動查詢模型
    if (key !== 'custom' && authStatus[key]?.logged_in) {
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
        // 最多輪詢 60 次（每 2 秒一次，共 120 秒 / 2 分鐘），給予充裕時間進行 2FA 驗證與貼上跳轉網址
        if (attempts > 60) {
          clearInterval(pollTimerRef.current);
          setConnecting(false);
        }
      }, 2000);
    } catch (e: any) {
      setResult({ ok: false, message: `連結失敗：${e.message || e}`, sample: '' });
      setConnecting(false);
    }
  };

  // 點擊「斷開帳號連結」按鈕
  const handleDisconnect = async () => {
    if (selectedProvider === 'custom') return;
    setDisconnecting(true);
    setResult(null);
    try {
      const res = await cliProxyDisconnect(selectedProvider);
      if (res.ok) {
        if (res.auth_status) setAuthStatus(res.auth_status);
        setHealthPassed(false);
        setHealthMessage(null);
        setLiveModels([]);
        setResult({ ok: true, message: '已成功斷開帳號連結', sample: '' });
      }
    } catch (e: any) {
      setResult({ ok: false, message: `斷開失敗：${e.message || e}`, sample: '' });
    } finally {
      setDisconnecting(false);
    }
  };

  // 手動送出跳轉回呼網址（若瀏覽器未自動跳轉）
  const handleManualCallback = async () => {
    if (!callbackInput.trim()) return;
    setSubmittingCallback(true);
    setResult(null);
    try {
      const res = await sendCliProxyCallback(callbackInput.trim());
      if (res.ok) {
        setConnecting(false);
        setCallbackInput('');
        if (res.auth_status) setAuthStatus(res.auth_status);
        checkEndpointHealth('http://localhost:8317/v1', '', selectedProvider);
      }
    } catch (e: any) {
      setResult({ ok: false, message: `回呼轉發失敗：${e.message || e}`, sample: '' });
    } finally {
      setSubmittingCallback(false);
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
        <p className="ai-hint">支援各大訂閱制方案直連與自訂端點。</p>

        {/* 頂部四按鈕選項 */}
        <div className="preset-row">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              className={`preset-btn ${selectedProvider === p.key ? 'on' : ''}`}
              onClick={() => pickProvider(p.key)}
            >
              <div className="preset-icon">{p.renderIcon(22)}</div>
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
            {isLoggedIn ? (
              <button
                type="button"
                className="ai-btn disconnect-btn"
                disabled={disconnecting}
                onClick={handleDisconnect}
              >
                {disconnecting ? '斷開中…' : '斷開帳號連結'}
              </button>
            ) : (
              <button
                type="button"
                className="ai-btn connect-btn"
                disabled={connecting}
                onClick={handleConnect}
              >
                {connecting ? '⏳ 開啟登入頁面並等待授權…' : '🔗 連結帳號（前往登入）'}
              </button>
            )}

            {connecting && (
              <div className="callback-helper">
                <div className="helper-title">💡 若授權完成後瀏覽器未自動返回：</div>
                <div className="helper-desc">
                  請複製瀏覽器網址列的授權跳轉網址（例如 <code>http://localhost:51121/oauth-callback?...</code>）貼在下方完成連結：
                </div>
                <div className="helper-input-row">
                  <input
                    type="text"
                    placeholder="貼上網址列的完整跳轉網址…"
                    value={callbackInput}
                    onChange={(e) => setCallbackInput(e.target.value)}
                    className="callback-input"
                  />
                  <button
                    type="button"
                    className="ai-btn primary"
                    disabled={submittingCallback || !callbackInput.trim()}
                    onClick={handleManualCallback}
                  >
                    {submittingCallback ? '交握中…' : '確認完成'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 欄位設定 */}
        <div className="ai-fields">
          {/* 端點欄位 */}
          {!isCustom ? (
            <div className="endpoint-banner">
              <span className="endpoint-icon">⚡</span>
              <span>已自動指定 CLIProxyAPI 的本機端點（<code>http://localhost:8317/v1</code>）</span>
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
