// =============================================
// 前端型別定義（與後端 types/index.ts 保持一致）
// =============================================

export type TaskType =
  | '學習'
  | '寫作'
  | '研究'
  | '簡報'
  | '程式'
  | '行政'
  | '規劃'
  | '複習'
  | '其他';

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type StepStatus = 'pending' | 'completed';
export type ReminderStatus = 'pending' | 'sent' | 'completed' | 'snoozed';

export interface Task {
  id: number;
  name: string;
  goal_description: string;
  deadline: string;
  available_time: string;
  task_type: TaskType;
  tools: string;          // JSON 字串
  need_line: boolean | number;
  status: TaskStatus;
  ai_goal: string;
  ai_tools: string;       // JSON 字串
  created_at: string;
  // 列表頁用的額外欄位
  step_count?: number;
  completed_steps?: number;
  next_reminder?: string;
}

export interface Step {
  id: number;
  task_id: number;
  order_num: number;
  title: string;
  description: string;
  estimated_time: string;
  tool_suggestion: string;
  completion_criteria: string;
  status: StepStatus;
}

export interface Reminder {
  id: number;
  task_id: number;
  step_id: number | null;
  remind_at: string;
  message: string;
  status: ReminderStatus;
  enabled: number;        // 0 或 1
  snooze_count: number;
}

export interface AIPlan {
  goal: string;
  suggested_tools: string[];
  steps: AIPlanStep[];
  reminders: AIPlanReminder[];
}

export interface AIPlanStep {
  title: string;
  description: string;
  estimated_time: string;
  tool_suggestion: string;
  completion_criteria: string;
}

export interface AIPlanReminder {
  remind_at: string;
  step_index: number;
  message: string;
}

export interface TaskFormData {
  name: string;
  goal_description: string;
  deadline: string;
  available_time: string;
  task_type: TaskType;
  tools: string[];
  need_line: boolean;
}

export interface TaskDetail {
  task: Task;
  steps: Step[];
  reminders: Reminder[];
}

// 頁面導覽狀態
export type AppView = 'overview' | 'create' | 'confirm' | 'detail' | 'schedule';

// =============================================
// AI 模型設定（三按鈕：訂閱制 Claude／外部雲端／自建本地）
// =============================================
export type AiKind = 'subscription' | 'external' | 'local';

export interface AiConfig {
  kind: AiKind;
  name: string;
  endpoint: string;
  model_name: string;
  api_key: string;
  is_local: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  sample: string;
}

export interface ClaudeAccountStatus {
  ok: boolean;
  logged_in: boolean;
  email?: string;
  subscription?: string;
  path?: string;
  message?: string;
}

// =============================================
// 課表（學生上傳課表圖片 → AI 辨識 → 課程清單）
// =============================================
export type Weekday = '一' | '二' | '三' | '四' | '五' | '六' | '日';

export interface Course {
  id: number;
  name: string;
  day_of_week: Weekday;
  start_time: string;
  end_time: string;
  teacher: string;
  location: string;
}

export type RecognizedCourse = Omit<Course, 'id'>;
