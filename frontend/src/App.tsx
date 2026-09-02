import { useState, useEffect } from 'react';
import TaskSidebar from './components/TaskSidebar.js';
import TaskChat from './components/TaskChat.js';
import TaskStepsPanel from './components/TaskStepsPanel.js';
import ScheduleUpload from './components/ScheduleUpload.js';
import AiSettings from './components/AiSettings.js';
import {
  getTasks,
  getTask,
  getTaskMessages,
  sendTaskChat,
  updateStep,
  updateReminder,
  deleteTask,
} from './api/client.js';
import { Task, TaskDetail, TaskMessage, AppView } from './types/index.js';
import './styles.css';

export default function App() {
  const [view, setView] = useState<AppView>('planner');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState('');

  // 載入所有任務清單
  const loadTasks = async () => {
    try {
      const data = await getTasks();
      setTasks(data);
      return data;
    } catch (e: any) {
      console.error('載入任務失敗：', e);
      return [];
    }
  };

  // 載入指定任務的步驟詳情與歷史對話
  const loadTaskData = async (id: number) => {
    try {
      const [detail, msgRes] = await Promise.all([
        getTask(id),
        getTaskMessages(id).catch(() => ({ messages: [] })),
      ]);
      setTaskDetail(detail);
      setMessages(msgRes.messages || []);
    } catch (e: any) {
      setError(e.message || '載入任務詳情失敗');
    }
  };

  // 初次載入
  useEffect(() => {
    loadTasks().then((all) => {
      if (all.length > 0 && selectedTaskId === null) {
        // 預設開啟第一個任務
        setSelectedTaskId(all[0].id);
        loadTaskData(all[0].id);
      }
    });
  }, []);

  // 切換選擇的任務
  const handleSelectTask = (id: number) => {
    setView('planner');
    setSelectedTaskId(id);
    loadTaskData(id);
    setError('');
  };

  // 點擊「新增任務」
  const handleNewTask = () => {
    setView('planner');
    setSelectedTaskId(null);
    setTaskDetail(null);
    setMessages([]);
    setError('');
  };

  // 發送對話訊息
  const handleSendMessage = async (content: string) => {
    setChatLoading(true);
    setError('');

    // 樂觀更新：立刻將使用者的訊息呈現在對話列表
    const optimisticUserMsg: TaskMessage = {
      id: Date.now(),
      task_id: selectedTaskId || 0,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await sendTaskChat(content, selectedTaskId);

      // 如果原本是新對話，切換至剛建立的任務
      if (!selectedTaskId || selectedTaskId !== res.task_id) {
        setSelectedTaskId(res.task_id);
      }

      // 即時將資料庫最新狀態同步至右側看板！
      setTaskDetail(res.task);

      // 同步更新對話紀錄
      const msgRes = await getTaskMessages(res.task_id).catch(() => null);
      if (msgRes && msgRes.messages.length > 0) {
        setMessages(msgRes.messages);
      } else {
        const assistantMsg: TaskMessage = {
          id: Date.now() + 1,
          task_id: res.task_id,
          role: 'assistant',
          content: res.reply,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }

      // 重新載入任務側邊清單以更新進度
      await loadTasks();
    } catch (e: any) {
      console.error('對話規劃失敗：', e);
      setError(e.message || '對話回應失敗，請確認 AI 模型狀態');
    } finally {
      setChatLoading(false);
    }
  };

  // 點擊步驟勾選框：切換步驟完成狀態
  const handleToggleStep = async (stepId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      await updateStep(stepId, { status: nextStatus });
      if (selectedTaskId) {
        const updated = await getTask(selectedTaskId);
        setTaskDetail(updated);
        loadTasks();
      }
    } catch (e: any) {
      setError(e.message || '更新步驟狀態失敗');
    }
  };

  // 切換提醒啟用狀態
  const handleToggleReminder = async (reminderId: number, currentEnabled: number) => {
    try {
      await updateReminder(reminderId, { enabled: currentEnabled ? 0 : 1 });
      if (selectedTaskId) {
        const updated = await getTask(selectedTaskId);
        setTaskDetail(updated);
      }
    } catch (e: any) {
      setError(e.message || '更新提醒失敗');
    }
  };

  // 刪除任務
  const handleDeleteTask = async (id: number) => {
    try {
      await deleteTask(id);
      const remaining = await loadTasks();
      if (selectedTaskId === id) {
        if (remaining.length > 0) {
          handleSelectTask(remaining[0].id);
        } else {
          handleNewTask();
        }
      }
    } catch (e: any) {
      setError(e.message || '刪除任務失敗');
    }
  };

  return (
    <div className="app">
      <AiSettings />

      {/* 頂部導覽列 */}
      <header className="app-header">
        <div className="header-content">
          <div
            className="logo"
            onClick={() => setView('planner')}
            style={{ cursor: 'pointer' }}
          >
            <span className="logo-icon">📚</span>
            <span className="logo-text">數位學伴</span>
            <span className="logo-sub">AI 任務規劃夥伴</span>
          </div>

          <nav className="nav">
            <button
              className={`nav-btn ${view === 'planner' ? 'nav-active' : ''}`}
              onClick={() => setView('planner')}
            >
              💬 任務規劃對話
            </button>
            <button
              className={`nav-btn ${view === 'schedule' ? 'nav-active' : ''}`}
              onClick={() => setView('schedule')}
            >
              📅 我的課表
            </button>
          </nav>
        </div>
      </header>

      {/* 主要內容區 */}
      <main className="app-main">
        {/* 錯誤橫幅 */}
        {error && (
          <div className="error-banner">
            <span>❌ {error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {view === 'planner' && (
          <div className="planner-layout">
            {/* 左側 Sidebar（非透明，左側有留白） */}
            <TaskSidebar
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
              onNewTask={handleNewTask}
              onDeleteTask={handleDeleteTask}
              onOpenSchedule={() => setView('schedule')}
            />

            {/* 中間雙欄 Workspace */}
            <div className="planner-workspace">
              {/* 左欄：對話框 */}
              <TaskChat
                taskId={selectedTaskId}
                taskName={taskDetail?.task?.name}
                messages={messages}
                onSendMessage={handleSendMessage}
                loading={chatLoading}
              />

              {/* 右欄：任務步驟與進度 */}
              <TaskStepsPanel
                taskDetail={taskDetail}
                onToggleStep={handleToggleStep}
                onToggleReminder={handleToggleReminder}
              />
            </div>
          </div>
        )}

        {/* 課表檢視 */}
        {view === 'schedule' && (
          <div className="schedule-view-wrapper">
            <div className="schedule-view-header">
              <button className="back-btn" onClick={() => setView('planner')}>
                ← 返回任務規劃對話
              </button>
            </div>
            <ScheduleUpload />
          </div>
        )}
      </main>
    </div>
  );
}
