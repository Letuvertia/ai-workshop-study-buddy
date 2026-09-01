// =============================================
// schedule.ts — 課表圖片辨識
//
// 課表圖片常見的版面（依使用者提供的三張參考圖歸納）：
//   - 直欄是星期一～六／日，橫列是時段（常標「節次 + 時間」，例如「3 10:20-11:10」「A 18:25-19:15」）
//   - 一門課通常會「跨好幾列」（連續時段），儲存格內容可能只有課名，也可能是
//     「課號 / 課名 / 教師 / 教室 / 修別」四行一起
//   - 有些格式沒有課號、只有課名(教師) 教室
// 因為版面差異大，用固定座標規則解析不划算，改用 AI 視覺模型直接讀圖辨識，
// 並要求它輸出結構化 JSON，是最泛用的做法。
// =============================================
import { getAiSettings } from './aiSettings';
import { callVisionModel } from './aiClient';
import type { RecognizedCourse, Weekday } from '../types/index';

const VALID_WEEKDAYS: Weekday[] = ['一', '二', '三', '四', '五', '六', '日'];

function buildPrompt(): string {
  return `你是一個課表辨識助手。這張圖片是大學課表（星期為欄、時段為列的表格）。

請仔細看圖，把表格裡「每一門課」都抓出來，注意同一門課通常會橫跨好幾個連續時段（同一欄、上下相連的儲存格顯示同一門課名稱），請把它合併成「一筆」資料，開始時間取它佔用的第一個時段的開始時間，結束時間取它佔用的最後一個時段的結束時間。

請務必只回覆一個 JSON 陣列，不要有任何說明文字、markdown 語法或程式碼區塊符號。陣列裡每個項目的格式：

{
  "name": "課程名稱（不含課號，若原表格有課號可略過）",
  "day_of_week": "一｜二｜三｜四｜五｜六｜日 其中一個字",
  "start_time": "HH:MM（24小時制，例如 10:20）",
  "end_time": "HH:MM（24小時制，例如 11:10）",
  "teacher": "授課教師姓名，看不出來就填空字串",
  "location": "教室代號，看不出來就填空字串"
}

注意事項：
1. 表格最左欄如果有寫時段對應的時間（例如「3 10:20-11:10」），請以那個時間為準；如果只有節次編號沒有時間，依常見大學課表推算（每節約 50 分鐘）。
2. 空白儲存格（沒有課）不用輸出。
3. 同一門課如果一週出現在兩個不同的星期欄位（例如「星期一、三都有」），請分別輸出兩筆，day_of_week 各自對應。
4. 看不清楚或無法確定的欄位，寧可填空字串，不要瞎猜課名。`;
}

// 從模型回覆中盡力抽出 JSON 陣列（模型有時會加 ```json 圍欄或前後贅字）
function extractJsonArray(text: string): unknown[] {
  if (!text) return [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const s = raw.indexOf('[');
  const e = raw.lastIndexOf(']');
  if (s === -1 || e === -1 || e < s) return [];
  try {
    const parsed = JSON.parse(raw.slice(s, e + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTime(t: unknown): string {
  const s = String(t ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function sanitizeCourse(raw: any): RecognizedCourse | null {
  const name = String(raw?.name ?? '').trim();
  const day = String(raw?.day_of_week ?? '').trim() as Weekday;
  const start_time = normalizeTime(raw?.start_time);
  const end_time = normalizeTime(raw?.end_time);
  if (!name || !VALID_WEEKDAYS.includes(day) || !start_time || !end_time) return null;
  return {
    name,
    day_of_week: day,
    start_time,
    end_time,
    teacher: String(raw?.teacher ?? '').trim(),
    location: String(raw?.location ?? '').trim(),
  };
}

export async function recognizeSchedule(imageBase64: string, mimeType: string): Promise<RecognizedCourse[]> {
  const cfg = getAiSettings();
  const raw = await callVisionModel(cfg, buildPrompt(), imageBase64, mimeType, 90_000);
  const items = extractJsonArray(raw);
  const courses = items.map(sanitizeCourse).filter((c): c is RecognizedCourse => c !== null);
  if (courses.length === 0) {
    throw new Error('沒有辨識出任何課程。請確認圖片清晰、完整包含課表表格，或换一張再試。');
  }
  return courses;
}
