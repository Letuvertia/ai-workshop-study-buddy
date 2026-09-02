import { TaskDetail } from '../types/index.js';
import { formatDisplay, parseLocal } from '../utils/time.js';
import './TaskStepsPanel.css';

interface TaskStepsPanelProps {
  taskDetail: TaskDetail | null;
  onToggleStep: (stepId: number, currentStatus: string) => Promise<void>;
  onToggleReminder: (reminderId: number, currentEnabled: number) => Promise<void>;
}

export default function TaskStepsPanel({
  taskDetail,
  onToggleStep,
  onToggleReminder,
}: TaskStepsPanelProps) {
  if (!taskDetail) {
    return (
      <div className="task-steps-panel empty-panel">
        <div className="empty-panel-inner">
          <div className="empty-icon">📝</div>
          <h3>任務步驟與進度看板</h3>
          <p>
            在左側對話框輸入你想達成的目標，
            <br />
            AI 會立即在右側為你生成清晰的執行步驟、工具建議與提醒通知！
          </p>
          <div className="empty-features">
            <div className="feature-item">
              <span className="feat-icon">🎯</span>
              <span className="feat-text">結構化拆解：將大目標化為具體可驗證的行動步驟</span>
            </div>
            <div className="feature-item">
              <span className="feat-icon">💬</span>
              <span className="feat-text">持續對話修改：隨時吩咐 AI 增減步驟、調整期限或勾選完成</span>
            </div>
            <div className="feature-item">
              <span className="feat-icon">⏰</span>
              <span className="feat-text">排程定時提醒：自動計算最適提醒時間，不怕錯過 Deadline</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { task, steps, reminders } = taskDetail;
  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // 計算距今剩餘天數
  const getDaysLeft = (deadlineStr: string) => {
    try {
      const target = parseLocal(deadlineStr);
      const now = new Date();
      const diffMs = target.getTime() - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (days < 0) return '已逾期';
      if (days === 0) return '今天截止';
      return `剩餘 ${days} 天`;
    } catch {
      return '';
    }
  };

  const daysLeft = getDaysLeft(task.deadline);

  return (
    <div className="task-steps-panel">
      {/* 任務摘要 Header */}
      <div className="panel-header">
        <div className="panel-title-row">
          <h2 className="panel-task-name">{task.name}</h2>
          <div className="panel-status-group">
            {daysLeft && <span className="days-badge">{daysLeft}</span>}
            <span
              className={`panel-status-badge ${
                task.status === 'completed'
                  ? 'completed'
                  : task.status === 'in_progress'
                  ? 'in_progress'
                  : 'pending'
              }`}
            >
              {task.status === 'completed'
                ? '✓ 已完成'
                : task.status === 'in_progress'
                ? '進行中'
                : '待處理'}
            </span>
          </div>
        </div>

        {task.goal_description && (
          <p className="panel-task-goal">{task.goal_description}</p>
        )}

        {/* 任務 Meta 資訊 */}
        <div className="panel-meta-grid">
          <div className="meta-block">
            <span className="meta-label">📅 截止時間</span>
            <span className="meta-val">{formatDisplay(task.deadline)}</span>
          </div>
          <div className="meta-block">
            <span className="meta-label">⏳ 可用時間</span>
            <span className="meta-val">{task.available_time || '未指定'}</span>
          </div>
          <div className="meta-block">
            <span className="meta-label">🏷️ 任務類型</span>
            <span className="meta-val">{task.task_type || '學習'}</span>
          </div>
        </div>

        {/* 進度條 */}
        <div className="panel-progress-box">
          <div className="progress-label-row">
            <span className="progress-title">執行進度</span>
            <span className="progress-num">
              {completedSteps} / {totalSteps} 步驟 ({percent}%)
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${percent}%`,
                background: percent === 100 ? '#10b981' : 'var(--primary, #3b82f6)',
              }}
            />
          </div>
        </div>
      </div>

      {/* 步驟清單 */}
      <div className="panel-body">
        <div className="section-title-row">
          <h3>📝 步驟清單 ({totalSteps})</h3>
          <span className="section-tip">點擊方框直接打勾或取消</span>
        </div>

        {steps.length === 0 ? (
          <p className="no-steps-text">尚無步驟，可在左側對話請 AI 拆解步驟！</p>
        ) : (
          <div className="steps-list">
            {steps.map((step) => {
              const isDone = step.status === 'completed';
              return (
                <div key={step.id} className={`step-card ${isDone ? 'step-done' : ''}`}>
                  <label className="step-checkbox-wrapper">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => onToggleStep(step.id, step.status)}
                    />
                    <span className="step-custom-checkbox" />
                  </label>

                  <div className="step-main">
                    <div className="step-header">
                      <span className="step-num">#{step.order_num}</span>
                      <h4 className="step-title">{step.title}</h4>
                    </div>

                    {step.description && (
                      <p className="step-desc">{step.description}</p>
                    )}

                    <div className="step-tags">
                      {step.estimated_time && (
                        <span className="step-tag time-tag">
                          ⏱️ {step.estimated_time}
                        </span>
                      )}
                      {step.tool_suggestion && (
                        <span className="step-tag tool-tag">
                          🛠️ {step.tool_suggestion}
                        </span>
                      )}
                      {step.completion_criteria && (
                        <span className="step-tag crit-tag" title={step.completion_criteria}>
                          🎯 {step.completion_criteria}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 提醒通知清單 */}
        {reminders.length > 0 && (
          <div className="reminders-section">
            <div className="section-title-row">
              <h3>⏰ 排程提醒 ({reminders.length})</h3>
            </div>
            <div className="reminders-list">
              {reminders.map((r) => {
                const isEnabled = Boolean(r.enabled);
                return (
                  <div
                    key={r.id}
                    className={`reminder-card ${isEnabled ? '' : 'reminder-disabled'}`}
                  >
                    <div className="reminder-info">
                      <span className="reminder-time">
                        🕒 {formatDisplay(r.remind_at)}
                      </span>
                      <span className="reminder-msg">{r.message}</span>
                    </div>
                    <button
                      className={`reminder-toggle-btn ${isEnabled ? 'enabled' : 'disabled'}`}
                      onClick={() => onToggleReminder(r.id, r.enabled)}
                      title={isEnabled ? '點擊停用提醒' : '點擊啟用提醒'}
                    >
                      {isEnabled ? '已啟用' : '已停用'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
