// reminders.js — 發送提醒（LINE 或終端機）

const { sendLineMessage } = require('./line');

// ───────────────────────────────────────────
// 主要發送函式
// ───────────────────────────────────────────
async function sendReminder(reminder, task) {
  const channel = process.env.REMINDER_CHANNEL || 'console';

  // 把 tools JSON 字串轉成可讀文字
  let toolsText = '—';
  try {
    const toolsArr = JSON.parse(reminder.tools || '[]');
    if (toolsArr.length > 0) toolsText = toolsArr.join('、');
  } catch {
    if (reminder.tools) toolsText = reminder.tools;
  }

  // 組成提醒訊息（LINE 和終端機用同一份）
  const message = [
    '【任務提醒】',
    `任務：${task.title}`,
    `現在要做：${reminder.step || '—'}`,
    `提醒內容：${reminder.message}`,
    `建議工具：${toolsText}`,
    `完成標準：${reminder.completion_criteria || '—'}`
  ].join('\n');

  if (channel === 'line') {
    const userId = process.env.LINE_USER_ID;
    await sendLineMessage(userId, message);
    console.log(`[LINE 已傳送] ${task.title} — ${new Date().toLocaleString('zh-TW')}`);
  } else {
    // console 模式：直接印在終端機
    console.log('\n' + '━'.repeat(50));
    console.log(message);
    console.log(`（傳送時間：${new Date().toLocaleString('zh-TW')}）`);
    console.log('━'.repeat(50) + '\n');
  }
}

module.exports = { sendReminder };
