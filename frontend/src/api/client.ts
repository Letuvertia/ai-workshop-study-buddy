import {
  AIPlan,
  Task,
  TaskDetail,
  TaskFormData,
  Reminder,
  Step,
} from '../types/index.js';

// 後端 API 的基礎 URL（開發時透過 Vite proxy 轉發）
const BASE = '/api';

// =============================================
// 通用 fetch 函式（含錯誤處理）
// =============================================
async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data as T;
}

// =============================================
// 任務 API
// =============================================

// 請 LLM 產生任務規劃（不寫資料庫）
export async function generatePlan(formData: TaskFormData): Promise<AIPlan> {
  const result = await request<{ plan: AIPlan }>('/tasks/plan', {
    method: 'POST',
    body: JSON.stringify(formData),
  });
  return result.plan;
}

// 確認後建立任務（寫入資料庫）
export async function createTask(
  formData: TaskFormData,
  plan: AIPlan
): Promise<TaskDetail> {
  return request<TaskDetail>('/tasks', {
    method: 'POST',
    body: JSON.stringify({ form_data: formData, plan }),
  });
}

// 取得所有任務
export async function getTasks(): Promise<Task[]> {
  const result = await request<{ tasks: Task[] }>('/tasks');
  return result.tasks;
}

// 取得單一任務詳細資訊
export async function getTask(id: number): Promise<TaskDetail> {
  return request<TaskDetail>(`/tasks/${id}`);
}

// 編輯任務基本資料（名稱、目標、截止時間、可用時間）
export async function updateTask(
  id: number,
  data: Partial<Pick<Task, 'name' | 'goal_description' | 'deadline' | 'available_time' | 'task_type' | 'ai_goal'>>
): Promise<TaskDetail> {
  return request<TaskDetail>(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// 更新任務狀態
export async function updateTaskStatus(
  id: number,
  status: string
): Promise<void> {
  await request(`/tasks/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// 刪除任務
export async function deleteTask(id: number): Promise<void> {
  await request(`/tasks/${id}`, { method: 'DELETE' });
}

// =============================================
// 步驟 API
// =============================================

export async function updateStep(
  id: number,
  data: Partial<Step>
): Promise<void> {
  await request(`/tasks/steps/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// =============================================
// 提醒 API
// =============================================

export async function updateReminder(
  id: number,
  data: Partial<Reminder>
): Promise<void> {
  await request(`/tasks/reminders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
