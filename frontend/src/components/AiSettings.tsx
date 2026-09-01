import { useEffect, useState } from 'react';
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
} from '../api/aiSettings.js';
import { AiConfig, AiKind, TestConnectionResult } from '../types/index.js';
import './AiSettings.css';

const KIND_LABEL: Record<AiKind, string> = {
  subscription: '訂閱制 Claude',
  external: '外部雲端模型',
  local: '自建／本地模型',
};

const KIND_EMOJI: Record<AiKind, string> = {
  subscription: '➕',
  external: '🟢',
  local: '🖥️',
};

function Guide({ kind }: { kind: AiKind }) {
  if (kind === 'external') {
    return (
      <>
        <strong>🟢 外部雲端模型（Google Gemini）— 你只需要做一件事：貼上 API Key</strong>
        <ol>
          <li>
            前往{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              Google AI Studio 金鑰頁面
            </a>
            （用 Google 帳號登入）
          </li>
          <li>點「Create API key」，複製金鑰（格式 <code>AIza...</code>）</li>
          <li>貼到下方高亮的「API Key」欄，按「儲存設定」即可</li>
        </ol>
        「API 端點」「模型名稱」已自動填好，不用改。
        <div className="warn-strong">⚠ 外部雲端服務，請勿用於機敏資料。</div>
      </>
    );
  }
  if (kind === 'local') {
    return (
      <>
        <strong>🖥️ 自建／本地模型 — 機敏資料請用這個</strong>
        <ul>
          <li>
            本機{' '}
            <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">
              Ollama
            </a>
            ：端點 <code>http://localhost:11434/v1</code>，執行 <code>ollama pull gemma3:12b</code> 下載模型
          </li>
          <li>自架／通道（如 ngrok）：把端點改成你的伺服器網址（保留結尾 <code>/v1</code>）、模型改成該伺服器代號</li>
        </ul>
        「API Key」留空即可。資料不出本機／自建環境，適用機敏資料。
      </>
    );
  }
  return (
    <>
      <strong>➕ 訂閱制 Claude（透過 CLIProxyAPI 本地轉發，免 API Key、吃 Claude 訂閱額度）</strong>
      <ol>
        <li>
          後端已整合{' '}
          <a href="https://github.com/router-for-me/CLIProxyAPI" target="_blank" rel="noopener noreferrer">
            CLIProxyAPI
          </a>
          ，啟動後端時會自動於本機 <code>http://localhost:8317/v1</code> 建立標準 OpenAI 相容代理。
        </li>
        <li>端點已填 <code>http://localhost:8317/v1</code>、模型已預設 <code>claude-3-7-sonnet</code></li>
        <li>初次使用請在終端機執行 <code>npm run cliproxy:login</code> 登入 Claude 帳號</li>
        <li>API Key 留空，按「儲存設定」，再用「測試連線」確認</li>
      </ol>
      <div className="warn-strong">⚠ 回應由 Anthropic 雲端產生，請勿用於機敏資料。</div>
    </>
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
  const [presets, setPresets] = useState<Record<AiKind, AiConfig> | null>(null);
  const [form, setForm] = useState<AiConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestConnectionResult | null>(null);

  useEffect(() => {
    getAiSettings().then((r) => {
      setPresets(r.presets);
      setForm(r.current);
    });
  }, []);

  const isClaude = form?.kind === 'subscription';

  if (!form || !presets) {
    return (
      <div className="ai-overlay" onClick={() => onClose()}>
        <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
          <p className="ai-hint">載入設定中…</p>
        </div>
      </div>
    );
  }

  const pickPreset = (key: AiKind) => {
    setForm({ ...presets[key] });
    setResult(null);
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    const r = await testAiConnection(form).catch((e) => ({ ok: false, message: String(e.message || e), sample: '' }));
    setResult(r);
    setTesting(false);
  };

  const save = async () => {
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

  return (
    <div className="ai-overlay" onClick={() => onClose()}>
      <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ai-panel-head">
          <h3>AI 模型設定</h3>
          <button className="ai-x" onClick={() => onClose()}>✕</button>
        </div>
        <p className="ai-hint">選一種模型來源，點一下就幫你設好。多數情況你只要貼一個 API Key、或完全不用填。</p>

        <div className="preset-row">
          {(Object.keys(presets) as AiKind[]).map((key) => (
            <button
              key={key}
              className={`preset-btn ${form.kind === key ? 'on' : ''}`}
              onClick={() => pickPreset(key)}
            >
              <div className="preset-emoji">{KIND_EMOJI[key]}</div>
              <div className="preset-name">{KIND_LABEL[key]}</div>
            </button>
          ))}
        </div>

        <div className="provider-guide">
          <Guide kind={form.kind} />
        </div>

        {isClaude && (
          <div className="claude-status">
            <span className="ok-text">
              ✓ CLIProxyAPI 運行於 <code>http://localhost:8317/v1</code>。初次使用若需登入 Claude 授權，請在終端機執行 <code>npm run cliproxy:login</code>。
            </span>
          </div>
        )}

        <div className="ai-fields">
          <label>端點 <span className="locked">已鎖定</span></label>
          <input value={form.endpoint} readOnly className="field-locked" />

          <label>模型名稱</label>
          <input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} />

          <label>
            API Key {isClaude || form.is_local ? <span className="muted">（此模式免填）</span> : <span className="hl">需要</span>}
          </label>
          <input
            type="password"
            placeholder={isClaude || form.is_local ? '免填' : '貼上你的 API Key'}
            className={!isClaude && !form.is_local ? 'field-highlight' : ''}
            value={form.api_key}
            disabled={isClaude}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          />
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
        <p className="ai-foot muted">設定會存在後端，重啟系統後仍會生效。</p>
      </div>
    </div>
  );
}
