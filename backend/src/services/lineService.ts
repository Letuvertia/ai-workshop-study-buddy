import axios from 'axios';
import db from '../db/index';

const LINE_API = 'https://api.line.me/v2/bot/message/push';

// =============================================
// 傳送 LINE Push Message
// =============================================
export async function sendLineMessage(userId: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn('⚠️  LINE_CHANNEL_ACCESS_TOKEN 未設定，跳過 LINE 提醒');
    return;
  }
  if (!userId) {
    console.warn('⚠️  LINE_USER_ID 未設定，跳過 LINE 提醒');
    return;
  }

  try {
    await axios.post(
      LINE_API,
      {
        to: userId,
        messages: [{ type: 'text', text }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      }
    );
    console.log(`✅ LINE 訊息已傳送給 ${userId}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ LINE API 錯誤：', error.response?.data || error.message);
    } else {
      throw error;
    }
  }
}

// =============================================
// 記錄最後送出的提醒（用於解析使用者回覆）
// =============================================
export function setLastReminder(userId: string, reminderId: number): void {
  const stmt = db.prepare(`
    INSERT INTO line_state (user_id, last_reminder_id, updated_at)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(user_id) DO UPDATE SET
      last_reminder_id = excluded.last_reminder_id,
      updated_at = excluded.updated_at
  `);
  stmt.run(userId, reminderId);
}

// =============================================
// 取得使用者最後一則待處理提醒
// =============================================
export function getLastReminder(userId: string): number | null {
  const row = db.prepare('SELECT last_reminder_id FROM line_state WHERE user_id = ?').get(userId) as
    | { last_reminder_id: number }
    | undefined;
  return row?.last_reminder_id ?? null;
}
