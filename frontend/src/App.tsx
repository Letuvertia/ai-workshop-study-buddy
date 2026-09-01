import { useState } from 'react';
import TaskForm from './components/TaskForm.js';
import PlanConfirmation from './components/PlanConfirmation.js';
import TaskOverview from './components/TaskOverview.js';
import TaskDetail from './components/TaskDetail.js';
import AiSettings from './components/AiSettings.js';
import ScheduleUpload from './components/ScheduleUpload.js';
import { generatePlan, createTask } from './api/client.js';
import { AIPlan, AppView, TaskFormData } from './types/index.js';
import './styles.css';

export default function App() {
  const [view, setView] = useState<AppView>('overview');
  const [formData, setFormData] = useState<TaskFormData | null>(null);
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ─── Step 1：使用者送出表單，呼叫 AI 產生規劃 ───
  async function handleFormSubmit(data: TaskFormData) {
    setFormData(data);
    setLoading(true);
    setError('');
    try {
      const plan = await generatePlan(data);
      setAiPlan(plan);
      setView('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : '產生規劃失敗，請確認 LLM API 是否正在運行');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2：使用者確認規劃，寫入資料庫 ───
  async function handleConfirm(plan: AIPlan) {
    if (!formData) return;
    setLoading(true);
    setError('');
    try {
      await createTask(formData, plan);
      setRefreshTrigger(n => n + 1);
      setView('overview');
      setFormData(null);
      setAiPlan(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立任務失敗');
    } finally {
      setLoading(false);
    }
  }

  function handleViewDetail(id: number) {
    setSelectedTaskId(id);
    setView('detail');
  }

  return (
    <div className="app">
      <AiSettings />

      {/* 頂部導覽列 */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo" onClick={() => setView('overview')} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">📚</span>
            <span className="logo-text">數位學伴</span>
            <span className="logo-sub">任務規劃系統</span>
          </div>
          <nav className="nav">
            <button
              className={`nav-btn ${view === 'overview' ? 'nav-active' : ''}`}
              onClick={() => setView('overview')}
            >
              📋 任務總覽
            </button>
            <button
              className={`nav-btn ${view === 'create' ? 'nav-active' : ''}`}
              onClick={() => { setView('create'); setError(''); }}
            >
              ＋ 建立任務
            </button>
            <button
              className={`nav-btn ${view === 'schedule' ? 'nav-active' : ''}`}
              onClick={() => { setView('schedule'); setError(''); }}
            >
              📅 我的課表
            </button>
          </nav>
        </div>
      </header>

      {/* 主要內容 */}
      <main className="app-main">
        {/* 錯誤訊息 */}
        {error && (
          <div className="error-banner">
            <span>❌ {error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* 任務總覽 */}
        {view === 'overview' && (
          <TaskOverview
            onViewDetail={handleViewDetail}
            onCreateNew={() => { setView('create'); setError(''); }}
            refreshTrigger={refreshTrigger}
          />
        )}

        {/* 建立任務表單 */}
        {view === 'create' && (
          <TaskForm onSubmit={handleFormSubmit} loading={loading} />
        )}

        {/* AI 規劃確認 */}
        {view === 'confirm' && formData && aiPlan && (
          <PlanConfirmation
            formData={formData}
            plan={aiPlan}
            onConfirm={handleConfirm}
            onBack={() => setView('create')}
            loading={loading}
          />
        )}

        {/* 任務詳情 */}
        {view === 'detail' && selectedTaskId !== null && (
          <TaskDetail
            taskId={selectedTaskId}
            onBack={() => setView('overview')}
          />
        )}

        {/* 我的課表 */}
        {view === 'schedule' && <ScheduleUpload />}
      </main>

      {/* 頁腳 */}
      <footer className="app-footer">
        <p>數位學伴 v1.0 · React + Node.js + SQLite + LINE</p>
      </footer>
    </div>
  );
}
