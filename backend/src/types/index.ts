// =============================================
// 共用型別定義（前後端共用的資料結構）
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

// 任務（主表）
export interface Task {
  id: number;
  name: string;
  goal_description: string;  // 使用者填寫的「我想完成什麼」
  deadline: string;          // ISO 8601 格式
  available_time: string;    // 文字描述，如「每天 2 小時」
  task_type: TaskType;
  tools: string;             // JSON 字串，存在 SQLite 裡
  need_line: boolean;
  status: TaskStatus;
  ai_goal: string;           // AI 產生的任務目標
  ai_tools: string;          // AI 建議的工具，JSON 字串
  created_at: string;
}

// 任務步驟
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

// 提醒
export interface Reminder {
  id: number;
  task_id: number;
  step_id: number | null;
  remind_at: string;         // ISO 8601 格式
  message: string;           // LINE 訊息內容
  status: ReminderStatus;
  enabled: number;           // SQLite 沒有 boolean，用 0/1
  snooze_count: number;
}

// AI 規劃結果（從 LLM 回傳）
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
  remind_at: string;   // ISO 8601
  step_index: number;  // 對應 steps 陣列的 index
  message: string;
}

// POST /api/tasks/plan 的 request body
export interface GeneratePlanRequest {
  name: string;
  goal_description: string;
  deadline: string;
  available_time: string;
  task_type: TaskType;
  tools: string[];
  need_line: boolean;
}

// POST /api/tasks 的 request body（確認建立）
export interface CreateTaskRequest {
  form_data: GeneratePlanRequest;
  plan: AIPlan;
}

// GET /api/tasks/:id 的回應
export interface TaskDetail {
  task: Task;
  steps: Step[];
  reminders: Reminder[];
}

// LINE 狀態（記錄最近一則提醒，用於解析回覆）
export interface LineState {
  user_id: string;
  last_reminder_id: number;
  updated_at: string;
}

// =============================================
// AI 模型設定（三按鈕：訂閱制 Claude／外部雲端／自建本地）
// =============================================
export type AiKind = 'claude' | 'openai' | 'google' | 'subscription' | 'external' | 'local';

export interface AiConfig {
  kind: AiKind;
  name: string;
  endpoint: string;      // 預設為 "http://localhost:8317/v1"
  model_name: string;
  api_key: string;
  is_local: boolean;
}

// LLM 對話訊息（給 OpenAI 相容 API 或 claude -p 用）
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  sample: string;
}

export interface ProviderAuthStatus {
  logged_in: boolean;
  email?: string;
  type?: string;
}

export type CliProxyAuthMap = Record<'claude' | 'openai' | 'google', ProviderAuthStatus>;

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
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  teacher: string;
  location: string;
}

// AI 辨識完、還沒存進資料庫前的暫時資料（沒有 id）
export type RecognizedCourse = Omit<Course, 'id'>;
