import { useState } from 'react';
import { AIPlan, AIPlanStep, AIPlanReminder, TaskFormData } from '../types/index.js';
import { formatDisplay, toInputValue, fromInputValue } from '../utils/time.js';

interface Props {
  formData: TaskFormData;
  plan: AIPlan;
  onConfirm: (plan: AIPlan) => void;
  onBack: () => void;
  loading: boolean;
}

export default function PlanConfirmation({ formData, plan, onConfirm, onBack, loading }: Props) {
  // 讓使用者可以修改 AI 產生的規劃
  const [editedPlan, setEditedPlan] = useState<AIPlan>({
    ...plan,
    steps: plan.steps.map(s => ({ ...s })),
    reminders: plan.reminders.map(r => ({ ...r })),
  });

  // 更新步驟
  function updateStep(index: number, field: keyof AIPlanStep, value: string) {
    setEditedPlan(prev => {
      const steps = [...prev.steps];
      steps[index] = { ...steps[index], [field]: value };
      return { ...prev, steps };
    });
  }

  // 更新提醒
  function updateReminder(index: number, field: keyof AIPlanReminder, value: string | number) {
    setEditedPlan(prev => {
      const reminders = [...prev.reminders];
      reminders[index] = { ...reminders[index], [field]: value };
      return { ...prev, reminders };
    });
  }

  // 刪除提醒（標記為停用）
  function toggleReminder(index: number) {
    setEditedPlan(prev => {
      const reminders = [...prev.reminders];
      // 用 step_index = -1 來標記停用（送出前過濾掉）
      reminders[index] = {
        ...reminders[index],
        step_index: reminders[index].step_index === -99
          ? plan.reminders[index].step_index  // 恢復原始
          : -99,  // 標記停用
      };
      return { ...prev, reminders };
    });
  }

  function handleConfirm() {
    // 過濾掉停用的提醒
    const finalPlan: AIPlan = {
      ...editedPlan,
      reminders: editedPlan.reminders.filter(r => r.step_index !== -99),
    };
    onConfirm(finalPlan);
  }

  // 時間顯示與輸入框轉換一律用 utils/time（⚠️ 禁止 toISOString，會差 8 小時）

  return (
    <div className="plan-confirmation">
      <h2 className="section-title">🤖 AI 規劃結果</h2>

      {/* 任務摘要 */}
      <div className="card summary-card">
        <h3>📋 任務：{formData.name}</h3>
        <p className="ai-goal">🎯 <strong>目標：</strong>{editedPlan.goal}</p>
        <p>🔧 <strong>建議工具：</strong>{editedPlan.suggested_tools.join('、')}</p>
        <p>📅 <strong>截止：</strong>{formatDisplay(formData.deadline)}</p>
      </div>

      {/* 任務步驟（可編輯） */}
      <div className="section">
        <h3>📝 任務步驟</h3>
        <p className="hint">可以直接修改步驟內容</p>

        {editedPlan.steps.map((step, i) => (
          <div key={i} className="card step-card">
            <div className="step-header">
              <span className="step-num">步驟 {i + 1}</span>
              <input
                type="text"
                value={step.title}
                onChange={e => updateStep(i, 'title', e.target.value)}
                className="step-title-input"
                placeholder="步驟標題"
              />
            </div>

            <div className="step-body">
              <div className="field">
                <label>說明</label>
                <textarea
                  value={step.description}
                  onChange={e => updateStep(i, 'description', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="field-row-3">
                <div className="field">
                  <label>⏱ 預計時間</label>
                  <input
                    type="text"
                    value={step.estimated_time}
                    onChange={e => updateStep(i, 'estimated_time', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>🔧 建議工具</label>
                  <input
                    type="text"
                    value={step.tool_suggestion}
                    onChange={e => updateStep(i, 'tool_suggestion', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>✅ 完成標準</label>
                  <input
                    type="text"
                    value={step.completion_criteria}
                    onChange={e => updateStep(i, 'completion_criteria', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* LINE 提醒（可編輯） */}
      {editedPlan.reminders.length > 0 && (
        <div className="section">
          <h3>📱 LINE 提醒安排</h3>
          <p className="hint">可以修改提醒時間和訊息，或取消某則提醒</p>

          {editedPlan.reminders.map((reminder, i) => {
            const isDisabled = reminder.step_index === -99;
            return (
              <div key={i} className={`card reminder-card ${isDisabled ? 'reminder-disabled' : ''}`}>
                <div className="reminder-header">
                  <span className="reminder-num">提醒 {i + 1}</span>
                  {reminder.step_index >= 0 && reminder.step_index < editedPlan.steps.length && (
                    <span className="reminder-step-tag">
                      → {editedPlan.steps[reminder.step_index]?.title || `步驟 ${reminder.step_index + 1}`}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`btn-toggle ${isDisabled ? 'btn-toggle-off' : 'btn-toggle-on'}`}
                    onClick={() => toggleReminder(i)}
                  >
                    {isDisabled ? '已停用' : '✓ 啟用'}
                  </button>
                </div>

                {!isDisabled && (
                  <div className="step-body">
                    <div className="field">
                      <label>⏰ 提醒時間</label>
                      <input
                        type="datetime-local"
                        value={toInputValue(reminder.remind_at)}
                        onChange={e => {
                          // datetime-local 的值本來就是本地時間，直接存，不要經過 Date/toISOString
                          updateReminder(i, 'remind_at', fromInputValue(e.target.value));
                        }}
                      />
                    </div>
                    <div className="field">
                      <label>📩 LINE 訊息內容</label>
                      <textarea
                        value={reminder.message}
                        onChange={e => updateReminder(i, 'message', e.target.value)}
                        rows={6}
                        className="message-textarea"
                      />
                    </div>
                  </div>
                )}

                {isDisabled && (
                  <p className="disabled-hint">此提醒已停用，不會傳送</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 按鈕 */}
      <div className="btn-group">
        <button type="button" className="btn-secondary" onClick={onBack} disabled={loading}>
          ← 返回修改
        </button>
        <button type="button" className="btn-primary" onClick={handleConfirm} disabled={loading}>
          {loading ? '⏳ 建立中...' : '✅ 確認建立任務'}
        </button>
      </div>
    </div>
  );
}
