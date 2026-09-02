import { useState } from 'react';
import { Task } from '../types/index.js';
import './TaskSidebar.css';

interface TaskSidebarProps {
  tasks: Task[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
  onNewTask: () => void;
  onDeleteTask: (taskId: number) => void;
  onOpenSchedule: () => void;
}

export default function TaskSidebar({
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewTask,
  onDeleteTask,
  onOpenSchedule,
}: TaskSidebarProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return t.status !== 'completed';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  return (
    <aside className="task-sidebar">
      {/* 頂部按鈕：建立新任務 */}
      <div className="sidebar-top">
        <button
          className={`new-task-btn ${selectedTaskId === null ? 'active' : ''}`}
          onClick={onNewTask}
        >
          <span className="plus-icon">＋</span>
          <span>新增任務規劃</span>
        </button>
      </div>

      {/* 篩選切換籤 */}
      <div className="sidebar-filter">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          全部 ({tasks.length})
        </button>
        <button
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          進行中
        </button>
        <button
          className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          已完成
        </button>
      </div>

      {/* 任務清單 */}
      <div className="sidebar-task-list">
        {filteredTasks.length === 0 ? (
          <div className="sidebar-empty">
            <p>目前沒有任務</p>
            <span>點選上方「新增任務規劃」開始對話！</span>
          </div>
        ) : (
          filteredTasks.map((t) => {
            const isSelected = selectedTaskId === t.id;
            const isDone = t.status === 'completed';
            const progress =
              t.step_count && t.step_count > 0
                ? Math.round(((t.completed_steps || 0) / t.step_count) * 100)
                : 0;

            return (
              <div
                key={t.id}
                className={`task-item ${isSelected ? 'selected' : ''} ${isDone ? 'done' : ''}`}
                onClick={() => onSelectTask(t.id)}
              >
                <div className="task-item-main">
                  <div className="task-item-header">
                    <span
                      className={`status-dot ${isDone ? 'completed' : t.status === 'in_progress' ? 'in_progress' : 'pending'}`}
                      title={isDone ? '已完成' : t.status === 'in_progress' ? '進行中' : '待處理'}
                    />
                    <span className="task-title" title={t.name}>
                      {t.name}
                    </span>
                  </div>

                  <div className="task-item-meta">
                    <span className="task-type-tag">{t.task_type || '學習'}</span>
                    {t.step_count ? (
                      <span className="task-progress-text">
                        {t.completed_steps || 0}/{t.step_count} 步驟 ({progress}%)
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  className="task-delete-btn"
                  title="刪除此任務"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`確定要刪除「${t.name}」嗎？相關步驟與提醒將一併刪除。`)) {
                      onDeleteTask(t.id);
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 側邊欄底部功能：我的課表 */}
      <div className="sidebar-footer">
        <button className="sidebar-tool-btn" onClick={onOpenSchedule}>
          <span className="tool-icon">📅</span>
          <span>我的課表管理</span>
        </button>
      </div>
    </aside>
  );
}
