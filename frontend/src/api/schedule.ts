// =============================================
// api/schedule.ts — 課表上傳、AI 辨識、課程清單 CRUD 的前端呼叫封裝
// =============================================
import { Course, RecognizedCourse } from '../types/index.js';

const BASE = '/api/schedule';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`伺服器回應異常（HTTP ${res.status}）。請確認後端是最新版本並已重新啟動。`);
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

// 把圖片檔轉成 base64（不含 data: 開頭）
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 上傳課表圖片，請 AI 辨識（尚未存入資料庫）
export async function recognizeSchedule(file: File): Promise<RecognizedCourse[]> {
  const image_base64 = await fileToBase64(file);
  const result = await request<{ courses: RecognizedCourse[] }>('/recognize', {
    method: 'POST',
    body: JSON.stringify({ image_base64, mime_type: file.type || 'image/jpeg' }),
  });
  return result.courses;
}

// 取得目前已儲存的課程清單
export async function getCourses(): Promise<Course[]> {
  const result = await request<{ courses: Course[] }>('/courses');
  return result.courses;
}

// 確認/修改後整批儲存（會取代舊課表）
export async function saveCourses(courses: RecognizedCourse[]): Promise<Course[]> {
  const result = await request<{ ok: boolean; courses: Course[] }>('/courses', {
    method: 'POST',
    body: JSON.stringify({ courses }),
  });
  return result.courses;
}

// 刪除單一課程
export async function deleteCourse(id: number): Promise<void> {
  await request(`/courses/${id}`, { method: 'DELETE' });
}
