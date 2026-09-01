// scheduler.js — 定時排程，每分鐘檢查是否有到期提醒

const cron = require('node-cron');
const db = require('./db');
const { sendReminder } = require('./reminders');

// 記錄最後一則傳送的提醒（供 LINE 回覆互動使用）
let lastSentContext = null; // { reminderId, taskId, taskTitle }

function getLastSentContext() {
  return lastSentContext;
}

// ───────────────────────────────────────────
// 啟動排程
// ───────────────────────────────────────────
function startScheduler() {
  // '* * * * *' 表示每分鐘執行一次
  cron.schedule('* * * * *', async () => {
    await checkAndSend();
  });

  console.log('⏰ 排程已啟動（每分鐘檢查一次提醒）');
}

// ───────────────────────────────────────────
// 檢查並發送到期提醒
// ───────────────────────────────────────────
async function checkAndSend() {
  const now = new Date();

  // 撈出所有 pending 且時間已到的提醒
  const dueReminders = db.prepare(`
    SELECT r.*, t.title AS task_title
    FROM reminders r
    JOIN tasks t ON r.task_id = t.id
    WHERE r.status = 'pending'
  `).all();

  // 在 JS 這邊比較時間（比在 SQL 比更能正確處理 ISO 8601 with timezone）
  const toSend = dueReminders.filter(r => new Date(r.remind_at) <= now);

  if (toSend.length === 0) return;

  console.log(`⏰ 找到 ${toSend.length} 則到期提醒`);

  for (const reminder of toSend) {
    try {
      const task = { title: reminder.task_title };
      await sendReminder(reminder, task);

      // 更新狀態
      db.prepare(`
        UPDATE reminders
        SET status = 'sent', sent_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(reminder.id);

      // 記錄最後傳送的提醒（供 LINE 回覆用）
      lastSentContext = {
        reminderId: reminder.id,
        taskId: reminder.task_id,
        taskTitle: reminder.task_title
      };

    } catch (err) {
      console.error(`❌ 提醒 #${reminder.id} 發送失敗：`, err.message);
    }
  }
}

// ───────────────────────────────────────────
// 手動觸發（用於測試）
// ───────────────────────────────────────────
async function checkNow() {
  console.log('🔍 手動觸發提醒檢查...');
  await checkAndSend();
}

module.exports = { startScheduler, checkNow, getLastSentContext };
