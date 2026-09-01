import cron from 'node-cron';
import db from '../db/index';
import { sendLineMessage, setLastReminder } from './lineService';
import { Reminder, Task, Step } from '../types/index';
import { formatLocal, localNowMinute } from '../utils/time';

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
  // ⚠️ 不可改回 new Date().toISOString()——那是 UTC，會讓提醒晚 8 小時（2026-07-07 的致命 bug）。
  const now = localNowMinute(); // YYYY-MM-DD HH:MM（本地）

  // 找出所有「已啟用、未送出、時間已到」的提醒
  const dueReminders = db
    .prepare(`
      SELECT r.*, t.name as task_name, t.need_line
      FROM reminders r
      JOIN tasks t ON r.task_id = t.id
      WHERE r.enabled = 1
        AND r.status = 'pending'
        AND strftime('%Y-%m-%d %H:%M', r.remind_at) <= ?
    `)
    .all(now) as (Reminder & { task_name: string; need_line: number })[];

  if (dueReminders.length === 0) return;

  console.log(`⏰ 找到 ${dueReminders.length} 則到期提醒`);

  const userId = process.env.LINE_USER_ID || '';

  for (const reminder of dueReminders) {
    try {
      // 標記為已送出
      db.prepare(`UPDATE reminders SET status = 'sent' WHERE id = ?`).run(reminder.id);

      // 如果任務需要 LINE 提醒，才發送
      if (reminder.need_line && userId) {
        await sendLineMessage(userId, reminder.message);
        setLastReminder(userId, reminder.id);
      }

      console.log(`✅ 提醒 #${reminder.id} 已處理（任務：${reminder.task_name}）`);
    } catch (error) {
      console.error(`❌ 處理提醒 #${reminder.id} 時發生錯誤：`, error);
    }
  }
}

// =============================================
// 處理使用者的 LINE 回覆
// =============================================
export async function handleLineReply(
  userId: string,
  replyText: string,
  reminderId: number
): Promise<string> {
  const reminder = db
    .prepare('SELECT * FROM reminders WHERE id = ?')
    .get(reminderId) as Reminder | undefined;

  if (!reminder) {
    return '找不到對應的提醒記錄，請直接到網頁查看任務。';
  }

  const trimmed = replyText.trim();

  // 完成
  if (trimmed === '完成' || trimmed === '✅完成') {
    db.prepare(`UPDATE reminders SET status = 'completed' WHERE id = ?`).run(reminderId);

    // 如果有對應的步驟，也標記步驟完成
    if (reminder.step_id) {
      db.prepare(`UPDATE steps SET status = 'completed' WHERE id = ?`).run(reminder.step_id);
    }

    return '🎉 太棒了！已標記完成。繼續加油！';
  }

  // 延後 30 分鐘
  if (trimmed === '延後30分鐘' || trimmed === '延後' || trimmed === '⏰延後30分鐘') {
    const newTime = new Date(reminder.remind_at); // 無時區字串 → Node 解讀為本地時間，正確
    newTime.setMinutes(newTime.getMinutes() + 30);
    // ⚠️ 寫回也必須是本地時間格式；toISOString() 會轉成 UTC、讓提醒提早 8 小時
    const newTimeStr = formatLocal(newTime);

    db.prepare(`
      UPDATE reminders
      SET remind_at = ?, status = 'pending', snooze_count = snooze_count + 1
      WHERE id = ?
    `).run(newTimeStr, reminderId);

    return `⏰ 好的，已延後 30 分鐘。新的提醒時間：${newTime.toLocaleString('zh-TW')}`;
  }

  // 查看下一步
  if (trimmed === '查看下一步' || trimmed === '下一步' || trimmed === '👀查看下一步') {
    // 找出目前任務的下一個未完成步驟
    const nextStep = db
      .prepare(`
        SELECT * FROM steps
        WHERE task_id = ?
          AND status = 'pending'
        ORDER BY order_num ASC
        LIMIT 1
      `)
      .get(reminder.task_id) as Step | undefined;

    if (!nextStep) {
      return '🎊 所有步驟都完成了！你做到了！';
    }

    return `📋 下一步：\n${nextStep.title}\n\n${nextStep.description}\n\n⏱ 預計時間：${nextStep.estimated_time}\n🔧 建議工具：${nextStep.tool_suggestion}\n✅ 完成標準：${nextStep.completion_criteria}`;
  }

  // 其他回覆
  return `收到你的訊息「${trimmed}」。\n\n可以回覆：\n完成 / 延後30分鐘 / 查看下一步`;
}
