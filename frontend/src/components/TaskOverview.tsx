import { useEffect, useState } from 'react';
import { Task } from '../types/index.js';
import { getTasks, deleteTask, updateTaskStatus } from '../api/client.js';
import { parseLocal } from '../utils/time.js';

interface Props {
  onViewDetail: (id: number) => void;
  onCreateNew: () => void;
  refreshTrigger: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待開始',
  in_progress: '進行中',
  completed: '已完成',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'status-pending',
  in_progress: 'status-progress',
  completed: 'status-done',
};

export default function TaskOverview({ onViewDetail, onCreateNew, refreshTrigger }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTasks();
  }, [refreshTrigger]);

  async function loadTasks() {
    setLoading(true);
    setError('');
    try {
      const data = await getTasks();
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`確定要刪除任務「${name}」嗎？`)) return;
    try {
      await deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert(`刪除失敗：${e instanceof Error ? e.message : '未知錯誤'}`);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    try {
      await updateTaskStatus(id, status);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: status as Task['status'] } : t));
    } catch (e) {
      alert(`更新失敗：${e instanceof Error ? e.message : '未知錯誤'}`);
    }
  }

  function formatDeadline(isoStr: string): string {
    try {
      const d = parseLocal(isoStr);
      const now = new Date();
      const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const dateStr = d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });

      if (diffDays < 0) return `${dateStr}（已逾期 ${Math.abs(diffDays)} 天）`;
      if (diffDays === 0) return `${dateStr}（今天截止！）`;
      if (diffDays === 1) return `${dateStr}（明天截止）`;
      return `${dateStr}（還有 ${diffDays} 天）`;
    } catch {
      return isoStr;
    }
  }

  function formatNextReminder(isoStr?: string): string {
    if (!isoStr) return '無待傳提醒';
    try {
      return parseLocal(isoStr).toLocaleString('zh-TW', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch {
      return isoStr;
    }
  }

  function getTaskTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      '學習': '📚', '寫作': '✍️', '研究': '🔬', '簡報': '📊',
      '程式': '💻', '行政': '📋', '規劃': '🗺️', '複習': '🔄', '其他': '📌',
    };
    return icons[type] || '📌';
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>載入任務中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p>❌ {error}</p>
        <button className="btn-secondary" onClick={loadTasks}>重試</button>
      </div>
    );
  }

  return (
    <div className="task-overview">
      <div className="overview-header">
        <h2 className="section-title">📋 任務總覽</h2>
        <button className="btn-primary" onClick={onCreateNew}>
          ＋ 建立新任務
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <p className="empty-icon">📭</p>
          <p>還沒有任何任務</p>
          <button className="btn-primary" onClick={onCreateNew}>
            建立第一個任務
          </button>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map(task => {
            const progress = task.step_count
              ? Math.round(((task.completed_steps || 0) / task.step_count) * 100)
              : 0;

            return (
              <div key={task.id} className={`card task-card ${task.status === 'completed' ? 'task-completed' : ''}`}>
                {/* 頭部：名稱 + 狀態 */}
                <div className="task-card-header">
                  <div className="task-title-row">
                    <span className="task-type-icon">{getTaskTypeIcon(task.task_type)}</span>
                    <h3 className="task-name">{task.name}</h3>
                    <span className={`status-badge ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                  </div>
                </div>

                {/* 目標 */}
                {task.ai_goal && (
                  <p className="task-goal">🎯 {task.ai_goal}</p>
                )}

                {/* 資訊列 */}
                <div className="task-meta">
                  <span className={`deadline ${parseLocal(task.deadline) < new Date() && task.status !== 'completed' ? 'overdue' : ''}`}>
                    📅 {formatDeadline(task.deadline)}
                  </span>
                  <span className="next-reminder">
                    🔔 {formatNextReminder(task.next_reminder)}
                  </span>
                  {task.need_line ? (
                    <span className="line-badge">LINE ✓</span>
                  ) : null}
                </div>

                {/* 進度條 */}
                {(task.step_count ?? 0) > 0 && (
                  <div className="progress-section">
                    <div className="progress-label">
                      <span>步驟進度</span>
                      <span>{task.completed_steps || 0} / {task.step_count} 步驟</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 操作按鈕 */}
                <div className="task-actions">
                  <button
                    className="btn-outline"
                    onClick={() => onViewDetail(task.id)}
                  >
                    查看詳情
                  </button>

                  <select
                    value={task.status}
                    onChange={e => handleStatusChange(task.id, e.target.value)}
                    className="status-select"
                  >
                    <option value="pending">待開始</option>
                    <option value="in_progress">進行中</option>
                    <option value="completed">已完成</option>
                  </select>

                  <button
                    className="btn-danger"
                    onClick={() => handleDelete(task.id, task.name)}
                  >
                    刪除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
