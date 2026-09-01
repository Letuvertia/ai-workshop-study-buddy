import { useEffect, useState } from 'react';
import { TaskFormData, TaskType, Course } from '../types/index.js';
import { getCourses } from '../api/schedule.js';
import { formatLocal } from '../utils/time.js';

const TASK_TYPES: TaskType[] = ['學習', '寫作', '研究', '簡報', '程式', '行政', '規劃', '複習', '其他'];

const AVAILABLE_TOOLS = [
  'ChatGPT', 'Codex', 'Google Docs', 'Google Sheets',
  'Canva', 'Notion', 'Obsidian', '手寫筆記', '番茄鐘',
];

interface Props {
  onSubmit: (data: TaskFormData) => void;
  loading: boolean;
}

export default function TaskForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState<TaskFormData>({
    name: '',
    goal_description: '',
    deadline: '',
    available_time: '',
    task_type: '學習',
    tools: [],
    need_line: false,
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');

  useEffect(() => {
    getCourses().then(setCourses).catch(() => {});
  }, []);

  function handleChange(field: keyof TaskFormData, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // 選課程只是「方便帶入任務名稱」，不強制——課外的學習任務可以完全不選
  function handleCourseSelect(id: string) {
    setSelectedCourseId(id);
    if (!id) return;
    const course = courses.find(c => String(c.id) === id);
    if (course) handleChange('name', course.name);
  }

  function toggleTool(tool: string) {
    setForm(prev => ({
      ...prev,
      tools: prev.tools.includes(tool)
        ? prev.tools.filter(t => t !== tool)
        : [...prev.tools, tool],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.goal_description.trim() || !form.deadline) {
      alert('請填寫任務名稱、想完成什麼、以及截止時間');
      return;
    }
    onSubmit(form);
  }

  // 計算截止日期的最小值（現在，本地時間——不能用 toISOString，那是 UTC 會差 8 小時）
  const today = formatLocal(new Date()).slice(0, 16);

  return (
    <form onSubmit={handleSubmit} className="task-form">
      <h2 className="section-title">✏️ 建立新任務</h2>

      {/* 選擇課表課程（選填，不選也可以，例如課外的自我學習任務） */}
      {courses.length > 0 && (
        <div className="field">
          <label>選擇課程 <span className="hint-inline">（選填，會自動帶入任務名稱，仍可修改）</span></label>
          <select value={selectedCourseId} onChange={e => handleCourseSelect(e.target.value)}>
            <option value="">— 不選，自己填任務名稱 —</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>
                星期{c.day_of_week} {c.start_time}-{c.end_time }　{c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 任務名稱 */}
      <div className="field">
        <label>任務名稱 <span className="required">*</span></label>
        <input
          type="text"
          value={form.name}
          onChange={e => handleChange('name', e.target.value)}
          placeholder="例如：完成期末報告、學習 Python 基礎"
          required
        />
      </div>

      {/* 我想完成什麼 */}
      <div className="field">
        <label>我想完成什麼 <span className="required">*</span></label>
        <textarea
          value={form.goal_description}
          onChange={e => handleChange('goal_description', e.target.value)}
          placeholder="詳細描述你想達成的目標，越具體越好。例如：我想完成一份 10 頁的機器學習期末報告，包含文獻回顧和實驗結果分析。"
          rows={4}
          required
        />
      </div>

      {/* 截止時間 */}
      <div className="field">
        <label>截止時間 <span className="required">*</span></label>
        <input
          type="datetime-local"
          value={form.deadline}
          min={today}
          onChange={e => handleChange('deadline', e.target.value)}
          required
        />
      </div>

      {/* 目前可用時間 */}
      <div className="field">
        <label>目前可用時間</label>
        <input
          type="text"
          value={form.available_time}
          onChange={e => handleChange('available_time', e.target.value)}
          placeholder="例如：每天下午 2 小時、週末整天"
        />
      </div>

      {/* 任務類型 */}
      <div className="field">
        <label>任務類型</label>
        <div className="chip-group">
          {TASK_TYPES.map(type => (
            <button
              key={type}
              type="button"
              className={`chip ${form.task_type === type ? 'chip-active' : ''}`}
              onClick={() => handleChange('task_type', type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* 可使用工具 */}
      <div className="field">
        <label>可使用工具（可多選）</label>
        <div className="chip-group">
          {AVAILABLE_TOOLS.map(tool => (
            <button
              key={tool}
              type="button"
              className={`chip ${form.tools.includes(tool) ? 'chip-active' : ''}`}
              onClick={() => toggleTool(tool)}
            >
              {tool}
            </button>
          ))}
        </div>
        {form.tools.length > 0 && (
          <p className="hint">已選擇：{form.tools.join('、')}</p>
        )}
      </div>

      {/* 是否需要 LINE 提醒 */}
      <div className="field field-row">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={form.need_line}
            onChange={e => handleChange('need_line', e.target.checked)}
          />
          <span>啟用 LINE 提醒</span>
          <span className="hint-inline">（需先設定 LINE Bot）</span>
        </label>
      </div>

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? (
          <>⏳ AI 規劃中，請稍候...</>
        ) : (
          <>🤖 產生 AI 規劃</>
        )}
      </button>
    </form>
  );
}
