import { useState, useRef, useEffect } from 'react';
import { TaskMessage } from '../types/index.js';
import './TaskChat.css';

interface TaskChatProps {
  taskId: number | null;
  taskName?: string;
  messages: TaskMessage[];
  onSendMessage: (text: string) => Promise<void>;
  loading: boolean;
}

export default function TaskChat({
  taskId,
  taskName,
  messages,
  onSendMessage,
  loading,
}: TaskChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 自動調整輸入框高度（預設 2 行，超過 2 行自動變大，最多 15 行才出現 scroll）
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const twoLinesHeight = 62;
    const fifteenLinesHeight = 335;
    const scrollHeight = el.scrollHeight;

    if (scrollHeight <= twoLinesHeight) {
      el.style.height = `${twoLinesHeight}px`;
      el.style.overflowY = 'hidden';
    } else if (scrollHeight < fifteenLinesHeight) {
      el.style.height = `${scrollHeight}px`;
      el.style.overflowY = 'hidden';
    } else {
      el.style.height = `${fifteenLinesHeight}px`;
      el.style.overflowY = 'auto';
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    adjustHeight();
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const msg = input.trim();
    setInput('');
    await onSendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const isNewSession = taskId === null && messages.length === 0;

  const quickPrompts = isNewSession
    ? [
        '我想準備下週三的社會學期中考，範圍是 1-4 章，每天晚上有 2 小時。',
        '下週五要繳交一份 2500 字的期末報告，目前只有選題。',
        '這週末想安排 3 小時讀完指定文獻並整理閱讀摘要。',
      ]
    : [
        '步驟 1 我已經完成了，請幫我打勾！',
        '老師把截止日期延後兩天，幫我調整截止日跟後續提醒。',
        '我想在步驟 2 和 3 之間多加一個「整理考古題」的步驟。',
        '幫我把整體規劃重新整理成更緊湊的 3 個步驟。',
      ];

  return (
    <div className="task-chat-panel">
      {/* 對話框頂部 */}
      <div className="chat-header">
        <div className="chat-header-title">
          <span className="chat-header-icon">💬</span>
          <div className="chat-header-text">
            <h3>{taskId ? taskName || '任務對話' : '✨ 規劃新任務'}</h3>
            <span className="chat-sub">
              {taskId
                ? '隨時告訴 AI 你的進度或修改想法，右側即時同步更新'
                : '用自然對話告訴 AI 你的學習目標，AI 將自動拆解步驟'}
            </span>
          </div>
        </div>
      </div>

      {/* 訊息紀錄區塊 */}
      <div className="chat-messages-container">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="welcome-avatar">🤖</div>
            <h4>你好！我是你的任務規劃夥伴</h4>
            <p>
              請告訴我你想完成什麼目標、何時截止、以及每天有多少時間可用。
              <br />
              我會直接幫你產生結構化的執行步驟，並建立專屬提醒！
            </p>

            <div className="quick-prompts-box">
              <span className="quick-title">💡 快速試試這些提示詞：</span>
              <div className="quick-chip-list">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="quick-chip"
                    onClick={() => {
                      setInput(p);
                      textareaRef.current?.focus();
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, idx) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id || idx}
                  className={`chat-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
                >
                  {!isUser && <div className="msg-avatar">🤖</div>}
                  <div className={`chat-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                    <div className="bubble-content">{m.content}</div>
                  </div>
                  {isUser && <div className="msg-avatar user-avatar">👤</div>}
                </div>
              );
            })}

            {/* 現有任務的快捷操作建議 */}
            {!loading && messages.length > 0 && (
              <div className="chat-suggestions-inline">
                <span className="suggestion-label">快捷建議：</span>
                {quickPrompts.slice(0, 3).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => {
                      setInput(p);
                      textareaRef.current?.focus();
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* AI 思考中狀態 */}
        {loading && (
          <div className="chat-message-row assistant-row">
            <div className="msg-avatar">🤖</div>
            <div className="chat-bubble assistant-bubble loading-bubble">
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
              <span className="loading-text">正在規劃並同步更新資料庫…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 輸入區塊 */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="告訴 AI 你想完成什麼，或輸入修改指令…（Enter 送出，Shift+Enter 換行）"
          rows={2}
          disabled={loading}
          className="chat-textarea"
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={loading || !input.trim()}
          title="送出訊息"
        >
          {loading ? '…' : '送出'}
        </button>
      </form>
    </div>
  );
}
