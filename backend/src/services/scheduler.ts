import cron from 'node-cron';
import db from '../db/index';
import { Reminder } from '../types/index';
import { localNowMinute } from '../utils/time';

// =============================================
// 每分鐘執行一次：檢查是否有到期的提醒
// =============================================
export function startScheduler(): void {
  // '* * * * *' 表示每分鐘執行一次。
  // SCHEDULER_CRON 是給 npm run check 用的測試旋鈕（改成每幾秒跳一次，讓驗證不用等一分鐘），
  // 正常執行不要設定它。
  const cronExpr = process.env.SCHEDULER_CRON || '* * * * *';
  cron.schedule(cronExpr, async () => {
    await checkAndSendReminders();
  });

  console.log(`⏰ 提醒排程已啟動（${cronExpr === '* * * * *' ? '每分鐘檢查一次' : `測試模式：${cronExpr}`}）`);
}

export async function checkAndSendReminders(): Promise<void> {
  // remind_at 存的是「本地時間」，所以「現在」也必須用本地時間比對。
  // ⚠️ 不可改回 new Date().toISOString()——那是 UTC，會讓提醒晚 8 小時（時間政策不變量）。
  const now = localNowMinute(); // YYYY-MM-DD HH:MM（本地）

  // 找出所有「已啟用、未送出、時間已到」的提醒
  const dueReminders = db
    .prepare(`
      SELECT r.*, t.name as task_name
      FROM reminders r
      JOIN tasks t ON r.task_id = t.id
      WHERE r.enabled = 1
        AND r.status = 'pending'
        AND strftime('%Y-%m-%d %H:%M', r.remind_at) <= ?
    `)
    .all(now) as (Reminder & { task_name: string })[];

  if (dueReminders.length === 0) return;

  console.log(`⏰ 找到 ${dueReminders.length} 則到期提醒`);

  for (const reminder of dueReminders) {
    try {
      // 標記為已送出/到期
      db.prepare(`UPDATE reminders SET status = 'sent' WHERE id = ?`).run(reminder.id);
      console.log(`✅ 提醒 #${reminder.id} 已觸發（任務：${reminder.task_name}）`);
    } catch (error) {
      console.error(`❌ 處理提醒 #${reminder.id} 時發生錯誤：`, error);
    }
  }
}
