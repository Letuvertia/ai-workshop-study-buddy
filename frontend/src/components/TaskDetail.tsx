import { useEffect, useState } from 'react';
import { TaskDetail as TaskDetailType, Step, Reminder } from '../types/index.js';
import { getTask, updateStep, updateReminder, updateTask } from '../api/client.js';
import { parseLocal, formatLocal, formatDisplay, toInputValue, fromInputValue } from '../utils/time.js';

interface Props {
  taskId: number;
  onBack: () => void;
}

export default function TaskDetail({ taskId, onBack }: Props) {
  const [detail, setDetail] = useState<TaskDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 編輯任務基本資料
  const [editingTask, setEditingTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState({ name: '', ai_goal: '', deadline: '', available_time: '' });

  // 編輯某一則提醒的時間（記住正在編輯的提醒 id 與草稿值）
  const [editingReminderId, setEditingReminderId] = useState<number | null>(null);
  const [reminderDraft, setReminderDraft] = useState('');

  useEffect(() => {
    loadDetail();
  }, [taskId]);

  async function loadDetail() {
    setLoading(true);
    setError('');
    try {
      const data = await getTask(taskId);
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  async function toggleStepDone(step: Step) {
    const newStatus = step.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateStep(step.id, { status: newStatus });
      setDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map(s =>
            s.id === step.id ? { ...s, status: newStatus } : s
          ),
        };
      });
    } catch (e) {
      alert(`更新失敗：${e instanceof Error ? e.message : ''}`);
    }
  }

  async function toggleReminderEnabled(reminder: Reminder) {
    const newEnabled = reminder.enabled ? 0 : 1;
    try {
      await updateReminder(reminder.id, { enabled: newEnabled as 0 | 1 });
      setDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          reminders: prev.reminders.map(r =>
            r.id === reminder.id ? { ...r, enabled: newEnabled } : r
          ),
        };
      });
    } catch (e) {
      alert(`更新失敗：${e instanceof Error ? e.message : ''}`);
    }
  }

  async function snoozeReminder(reminder: Reminder) {
    // ⚠️ 一律用 utils/time 的本地時間格式；toISOString 會轉 UTC、差 8 小時
    const newTime = parseLocal(reminder.remind_at);
    newTime.setMinutes(newTime.getMinutes() + 30);
    const newTimeStr = formatLocal(newTime);
    try {
      await updateReminder(reminder.id, { remind_at: newTimeStr, status: 'pending' });
      setDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          reminders: prev.reminders.map(r =>
            r.id === reminder.id ? { ...r, remind_at: newTimeStr, status: 'pending' } : r
          ),
        };
      });
    } catch (e) {
      alert(`延後失敗：${e instanceof Error ? e.message : ''}`);
    }
  }

  // 開始／儲存「編輯提醒時間」
  function startEditReminder(reminder: Reminder) {
    setEditingReminderId(reminder.id);
    setReminderDraft(toInputValue(reminder.remind_at));
  }

  async function saveReminderTime(reminder: Reminder) {
    if (!reminderDraft) return;
    const newTimeStr = fromInputValue(reminderDraft);
    try {
      // 改了時間就把狀態拉回「待傳送」，讓排程器重新在新時間發送
      await updateReminder(reminder.id, { remind_at: newTimeStr, status: 'pending' });
      setDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          reminders: prev.reminders.map(r =>
            r.id === reminder.id ? { ...r, remind_at: newTimeStr, status: 'pending' } : r
          ),
        };
      });
      setEditingReminderId(null);
    } catch (e) {
      alert(`更新失敗：${e instanceof Error ? e.message : ''}`);
    }
  }

  // 開始／儲存「編輯任務」
  function startEditTask() {
    if (!detail) return;
    setTaskDraft({
      name: detail.task.name,
      ai_goal: detail.task.ai_goal || detail.task.goal_description,
      deadline: toInputValue(detail.task.deadline),
      available_time: detail.task.available_time,
    });
    setEditingTask(true);
  }

  async function saveTask() {
    if (!detail || !taskDraft.name.trim()) return;
    try {
      const updated = await updateTask(detail.task.id, {
        name: taskDraft.name.trim(),
        ai_goal: taskDraft.ai_goal,
        deadline: fromInputValue(taskDraft.deadline),
        available_time: taskDraft.available_time,
      });
      setDetail(updated);
      setEditingTask(false);
    } catch (e) {
      alert(`儲存失敗：${e instanceof Error ? e.message : ''}`);
    }
  }

  const STATUS_REMINDER: Record<string, string> = {
    pending: '待傳送',
    sent: '已傳送',
    completed: '已完成',
    snoozed: '已延後',
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>載入任務詳情...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="error-container">
        <p>❌ {error || '找不到任務'}</p>
        <button className="btn-secondary" onClick={onBack}>返回</button>
      </div>
    );
  }

  const { task, steps, reminders } = detail;
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const progress = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  // 解析 tools JSON
  let tools: string[] = [];
  try { tools = JSON.parse(task.tools); } catch { /* ignore */ }

  let aiTools: string[] = [];
  try { aiTools = JSON.parse(task.ai_tools); } catch { /* ignore */ }

  return (
    <div className="task-detail">
      {/* 頁首 */}
      <div className="detail-header">
        <button className="btn-back" onClick={onBack}>← 返回總覽</button>
        <div>
          <h2>{task.name}</h2>
          <p className="task-type-label">{task.task_type}</p>
        </div>
      </div>

      {/* 任務資訊 */}
      <div className="card info-card">
        {!editingTask ? (
          <>
            <div style={{ textAlign: 'right', marginBottom: '0.5rem' }}>
              <button className="btn-small" onClick={startEditTask}>✏️ 編輯任務</button>
            </div>
            <div className="info-grid">
              <div>
                <p className="info-label">🎯 任務目標</p>
                <p>{task.ai_goal || task.goal_description}</p>
              </div>
              <div>
                <p className="info-label">📅 截止時間</p>
                <p>{formatDisplay(task.deadline)}</p>
              </div>
              <div>
                <p className="info-label">⏰ 可用時間</p>
                <p>{task.available_time}</p>
              </div>
              <div>
                <p className="info-label">🔧 建議工具</p>
                <p>{aiTools.length > 0 ? aiTools.join('、') : tools.join('、') || '—'}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="step-body">
            <div className="field">
              <label>任務名稱</label>
              <input
                type="text"
                value={taskDraft.name}
                onChange={e => setTaskDraft(d => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>🎯 任務目標</label>
              <textarea
                value={taskDraft.ai_goal}
                onChange={e => setTaskDraft(d => ({ ...d, ai_goal: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="field-row-3">
              <div className="field">
                <label>📅 截止時間</label>
                <input
                  type="datetime-local"
                  value={taskDraft.deadline}
                  onChange={e => setTaskDraft(d => ({ ...d, deadline: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>⏰ 可用時間</label>
                <input
                  type="text"
                  value={taskDraft.available_time}
                  onChange={e => setTaskDraft(d => ({ ...d, available_time: e.target.value }))}
                  placeholder="例：每天 2 小時"
                />
              </div>
            </div>
            <div className="btn-group">
              <button className="btn-secondary" onClick={() => setEditingTask(false)}>取消</button>
              <button className="btn-primary" onClick={saveTask}>💾 儲存</button>
            </div>
          </div>
        )}

        {/* 進度條 */}
        <div className="progress-section" style={{ marginTop: '1rem' }}>
          <div className="progress-label">
            <span>整體進度</span>
            <span className="progress-pct">{progress}%（{completedCount}/{steps.length} 步驟）</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* 任務步驟 */}
      <div className="section">
        <h3>📝 任務步驟</h3>
        {steps.map(step => (
          <div key={step.id} className={`card step-detail-card ${step.status === 'completed' ? 'step-done' : ''}`}>
            <div className="step-detail-header">
              <button
                className={`step-checkbox ${step.status === 'completed' ? 'checked' : ''}`}
                onClick={() => toggleStepDone(step)}
                title={step.status === 'completed' ? '標記為未完成' : '標記為完成'}
              >
                {step.status === 'completed' ? '✓' : ''}
              </button>
              <div>
                <span className="step-order">步驟 {step.order_num}</span>
                <span className="step-detail-title">{step.title}</span>
              </div>
            </div>

            <div className="step-detail-body">
              {step.description && (
                <p className="step-desc">{step.description}</p>
              )}
              <div className="step-meta">
                <span>⏱ {step.estimated_time}</span>
                <span>🔧 {step.tool_suggestion}</span>
                <span>✅ {step.completion_criteria}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 提醒列表 */}
      {reminders.length > 0 && (
        <div className="section">
          <h3>🔔 提醒清單</h3>
          {reminders.map(reminder => (
            <div
              key={reminder.id}
              className={`card reminder-detail-card ${!reminder.enabled ? 'reminder-disabled' : ''}`}
            >
              <div className="reminder-detail-header">
                <div>
                  {editingReminderId === reminder.id ? (
                    <input
                      type="datetime-local"
                      value={reminderDraft}
                      onChange={e => setReminderDraft(e.target.value)}
                    />
                  ) : (
                    <span className="reminder-time">{formatDisplay(reminder.remind_at)}</span>
                  )}
                  <span className={`reminder-status reminder-${reminder.status}`}>
                    {STATUS_REMINDER[reminder.status]}
                  </span>
                </div>
                <div className="reminder-detail-actions">
                  {editingReminderId === reminder.id ? (
                    <>
                      <button className="btn-small" onClick={() => setEditingReminderId(null)}>
                        取消
                      </button>
                      <button className="btn-small btn-small-on" onClick={() => saveReminderTime(reminder)}>
                        💾 儲存時間
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-small"
                        onClick={() => startEditReminder(reminder)}
                        title="直接改提醒時間"
                      >
                        ✏️ 改時間
                      </button>
                      {reminder.status === 'sent' || reminder.status === 'pending' ? (
                        <button
                          className="btn-small"
                          onClick={() => snoozeReminder(reminder)}
                          title="延後 30 分鐘"
                        >
                          ⏰ 延後30分
                        </button>
                      ) : null}
                      <button
                        className={`btn-small ${reminder.enabled ? 'btn-small-on' : 'btn-small-off'}`}
                        onClick={() => toggleReminderEnabled(reminder)}
                      >
                        {reminder.enabled ? '✓ 啟用' : '停用'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <pre className="reminder-message">{reminder.message}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
