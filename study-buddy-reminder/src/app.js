// app.js — 主程式，Express 伺服器與所有路由

require('dotenv').config();
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const { generatePlan } = require('./planner');
const { generateChatReply, generatePlanFromChat } = require('./llm');
const { sendLineMessage, verifyLineSignature } = require('./line');
const { startScheduler, checkNow, getLastSentContext } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── 設定 EJS 樣板引擎 ───
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// ─── 中介層 ───
app.use(express.urlencoded({ extended: true })); // 解析 HTML 表單
app.use(express.json());                          // 解析 JSON（LINE webhook 用）

// ─── 暫存規劃（等待使用者確認）───
// 因為是單人工具，用簡單的 Map 存在記憶體即可
// key = uuid, value = { formData, plan }
const pendingPlans = new Map();

// ═══════════════════════════════════════════
// 路由：首頁 — 任務表單
// ═══════════════════════════════════════════
app.get('/', (req, res) => {
  res.render('index', {
    error: req.query.error || null
  });
});

// ═══════════════════════════════════════════
// 路由：送出表單，產生規劃
// ═══════════════════════════════════════════
app.post('/plan', async (req, res) => {
  const formData = {
    taskName:      req.body.taskName?.trim(),
    taskContent:   req.body.taskContent?.trim(),
    taskType:      req.body.taskType || '其他',
    deadline:      req.body.deadline || null,
    availableTime: req.body.availableTime?.trim(),
    tools:         req.body.tools?.trim(),
    reminderCount: parseInt(req.body.reminderCount) || 3,
    needLine:      req.body.needLine === 'on'
  };

  if (!formData.taskName) {
    return res.redirect('/?error=請填寫任務名稱');
  }

  try {
    const plan = await generatePlan(formData);
    const requireConfirmation = process.env.REQUIRE_CONFIRMATION !== 'false';

    if (requireConfirmation) {
      // 暫存規劃，導向確認頁
      const tempId = uuidv4();
      pendingPlans.set(tempId, { formData, plan });

      // 清除超過 30 分鐘的暫存（防止記憶體洩漏）
      setTimeout(() => pendingPlans.delete(tempId), 30 * 60 * 1000);

      return res.redirect(`/confirm/${tempId}`);
    } else {
      // 直接存入資料庫
      const taskId = saveTaskAndReminders(formData, plan);
      return res.redirect(`/tasks/${taskId}?created=1`);
    }
  } catch (err) {
    console.error('產生規劃失敗：', err.message);
    return res.redirect(`/?error=${encodeURIComponent('產生規劃失敗：' + err.message)}`);
  }
});

// ═══════════════════════════════════════════
// 路由：確認頁
// ═══════════════════════════════════════════
app.get('/confirm/:tempId', (req, res) => {
  const pending = pendingPlans.get(req.params.tempId);
  if (!pending) {
    return res.redirect('/?error=確認頁已過期，請重新填寫');
  }

  res.render('confirm', {
    tempId: req.params.tempId,
    formData: pending.formData,
    plan: pending.plan
  });
});

// ═══════════════════════════════════════════
// 路由：確認建立
// ═══════════════════════════════════════════
app.post('/confirm/:tempId', (req, res) => {
  const pending = pendingPlans.get(req.params.tempId);
  if (!pending) {
    return res.redirect('/?error=確認頁已過期，請重新填寫');
  }

  try {
    // 合併使用者在確認頁編輯的內容
    const editedPlan = mergeEditedPlan(pending.plan, req.body);
    const taskId = saveTaskAndReminders(pending.formData, editedPlan);
    pendingPlans.delete(req.params.tempId);
    return res.redirect(`/tasks/${taskId}?created=1`);
  } catch (err) {
    console.error('儲存任務失敗：', err.message);
    return res.redirect(`/confirm/${req.params.tempId}?error=儲存失敗，請再試一次`);
  }
});

// ═══════════════════════════════════════════
// 路由：取消確認
// ═══════════════════════════════════════════
app.get('/confirm/:tempId/cancel', (req, res) => {
  pendingPlans.delete(req.params.tempId);
  res.redirect('/');
});

// ═══════════════════════════════════════════
// 路由：任務總覽
// ═══════════════════════════════════════════
app.get('/tasks', (req, res) => {
  const now = new Date();

  const tasks = db.prepare(`
    SELECT
      t.*,
      COUNT(r.id) AS reminder_count,
      MIN(CASE WHEN r.status = 'pending' THEN r.remind_at END) AS next_reminder
    FROM tasks t
    LEFT JOIN reminders r ON r.task_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `).all();

  // 所有 pending 提醒（含任務名稱），用來計算今日區塊
  const allPending = db.prepare(`
    SELECT r.*, t.title AS task_title, t.id AS task_id
    FROM reminders r
    JOIN tasks t ON r.task_id = t.id
    WHERE r.status = 'pending'
    ORDER BY r.remind_at ASC
  `).all();

  // 今日提醒（在 JS 這邊比較，正確處理 ISO 8601 with timezone）
  const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const todayReminders = allPending.filter(r => {
    try { return new Date(r.remind_at).toLocaleDateString('en-CA') === todayStr; }
    catch { return false; }
  });

  // 今天結束後的提醒（「即將到來」區塊，最多顯示 5 則）
  const upcomingReminders = allPending
    .filter(r => {
      try { return new Date(r.remind_at).toLocaleDateString('en-CA') > todayStr; }
      catch { return false; }
    })
    .slice(0, 5);

  const stats = {
    todayCount:    todayReminders.length,
    activeCount:   tasks.filter(t => t.status === 'active').length,
    nextReminder:  allPending[0] || null,
    overdueCount:  tasks.filter(t =>
      t.deadline && new Date(t.deadline) < now && t.status !== 'completed'
    ).length
  };

  res.render('tasks', {
    tasks,
    todayReminders,
    upcomingReminders,
    stats,
    tested: req.query.tested === '1'
  });
});

// ═══════════════════════════════════════════
// 路由：任務詳情
// ═══════════════════════════════════════════
app.get('/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).send('找不到此任務');

  const reminders = db.prepare(
    'SELECT * FROM reminders WHERE task_id = ? ORDER BY remind_at ASC'
  ).all(req.params.id);

  // 解析 JSON 欄位
  let steps = [];
  let suggestedTools = [];
  try { steps = JSON.parse(task.steps || '[]'); } catch { /* ignore */ }
  try { suggestedTools = JSON.parse(task.suggested_tools || '[]'); } catch { /* ignore */ }

  res.render('task-detail', {
    task,
    steps,
    suggestedTools,
    reminders,
    created: req.query.created === '1'
  });
});

// ═══════════════════════════════════════════
// 路由：編輯任務（顯示表單）
// ═══════════════════════════════════════════
app.get('/tasks/:id/edit', (req, res) => {
  const task = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM reminders WHERE task_id = t.id) AS reminder_count
    FROM tasks t WHERE t.id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).send('找不到此任務');
  res.render('task-edit', { task, error: req.query.error || null });
});

// ═══════════════════════════════════════════
// 路由：儲存任務編輯
// ═══════════════════════════════════════════
app.post('/tasks/:id/edit', (req, res) => {
  const id = req.params.id;
  const { title, goal, content, deadline, available_time, tools, status } = req.body;

  if (!title?.trim()) {
    return res.redirect(`/tasks/${id}/edit?error=任務名稱不能空白`);
  }

  db.prepare(`
    UPDATE tasks
    SET title = ?, goal = ?, content = ?, deadline = ?,
        available_time = ?, tools = ?, status = ?,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    title.trim(),
    goal?.trim() || '',
    content?.trim() || '',
    deadline || null,
    available_time?.trim() || '',
    tools?.trim() || '',
    status || 'active',
    id
  );

  res.redirect(`/tasks/${id}`);
});

// ═══════════════════════════════════════════
// 路由：刪除任務（含所有提醒）
// ═══════════════════════════════════════════
app.post('/tasks/:id/delete', (req, res) => {
  const id = req.params.id;
  // SQLite 的 ON DELETE CASCADE 會自動刪除 reminders
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.redirect('/tasks');
});

// ═══════════════════════════════════════════
// 路由：聊天 API — 學伴對話（單輪）
// POST /chat/message  body: { messages: [{role,content}] }
// ═══════════════════════════════════════════
app.post('/chat/message', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: '缺少 messages' });
  try {
    const reply = await generateChatReply(messages);
    return res.json({ reply });
  } catch (err) {
    console.error('聊天 LLM 錯誤：', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// 路由：聊天 → 產生任務規劃
// POST /chat/generate  body: { messages }
// ═══════════════════════════════════════════
app.post('/chat/generate', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: '缺少 messages' });
  try {
    const result = await generatePlanFromChat(messages);
    const tempId = require('uuid').v4();
    pendingPlans.set(tempId, result);
    setTimeout(() => pendingPlans.delete(tempId), 30 * 60 * 1000);
    return res.json({ tempId });
  } catch (err) {
    console.error('聊天規劃 LLM 錯誤：', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// 路由：手動觸發提醒檢查（方便測試）
// GET /test-reminder
// ═══════════════════════════════════════════
app.get('/test-reminder', async (req, res) => {
  await checkNow();
  // 執行完後導回任務總覽（帶提示訊息）
  res.redirect('/tasks?tested=1');
});

// ═══════════════════════════════════════════
// 路由：編輯提醒（建立後也可修改）
// ═══════════════════════════════════════════
app.post('/reminders/:id/update', (req, res) => {
  const id = parseInt(req.params.id);
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
  if (!reminder) return res.status(404).send('找不到此提醒');

  const { remindAt, step, message, completionCriteria, status } = req.body;

  db.prepare(`
    UPDATE reminders
    SET remind_at = ?, step = ?, message = ?, completion_criteria = ?,
        status = CASE WHEN ? = 'cancel' THEN 'cancelled' ELSE status END
    WHERE id = ?
  `).run(
    remindAt || reminder.remind_at,
    step !== undefined ? step : reminder.step,
    message !== undefined ? message : reminder.message,
    completionCriteria !== undefined ? completionCriteria : reminder.completion_criteria,
    status || '',
    id
  );

  res.redirect(`/tasks/${reminder.task_id}#reminder-${id}`);
});

// ═══════════════════════════════════════════
// 路由：LINE Webhook（ENABLE_LINE_REPLY=true 時啟用）
// ═══════════════════════════════════════════
if (process.env.ENABLE_LINE_REPLY === 'true') {
  app.post('/webhook', async (req, res) => {
    // 先回 200，讓 LINE 知道收到了
    res.status(200).json({ status: 'ok' });

    // 驗證簽章
    const signature = req.headers['x-line-signature'];
    if (!verifyLineSignature(req.body, signature)) {
      console.warn('⚠️ LINE 簽章驗證失敗');
      return;
    }

    for (const event of req.body.events || []) {
      if (event.type !== 'message' || event.message.type !== 'text') continue;

      const text = event.message.text.trim();
      const userId = process.env.LINE_USER_ID;
      const ctx = getLastSentContext();

      console.log(`📩 LINE 回覆：「${text}」`);

      try {
        if (text === '完成' || text === '✅完成') {
          if (ctx) {
            db.prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ?`).run(ctx.reminderId);
            await sendLineMessage(userId, `✅ 已標記「${ctx.taskTitle}」的提醒為完成！繼續加油！`);
          } else {
            await sendLineMessage(userId, '找不到最近的提醒記錄。');
          }

        } else if (text === '延後30分鐘' || text === '⏰延後30分鐘' || text === '延後') {
          if (ctx) {
            const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(ctx.reminderId);
            if (reminder) {
              const newTime = new Date(reminder.remind_at);
              newTime.setMinutes(newTime.getMinutes() + 30);
              db.prepare(`UPDATE reminders SET remind_at = ?, status = 'pending' WHERE id = ?`)
                .run(newTime.toISOString(), ctx.reminderId);
              const timeStr = newTime.toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit' });
              await sendLineMessage(userId, `⏰ 已延後 30 分鐘，新提醒時間：${timeStr}`);
            }
          } else {
            await sendLineMessage(userId, '找不到最近的提醒記錄。');
          }

        } else if (text === '查看下一步' || text === '下一步' || text === '👀查看下一步') {
          if (ctx) {
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(ctx.taskId);
            if (task) {
              let steps = [];
              try { steps = JSON.parse(task.steps || '[]'); } catch { /* ignore */ }

              if (steps.length > 0) {
                const nextStep = steps[0]; // 簡化：顯示第一個步驟
                const reply = `📋 下一步：\n${nextStep.title}\n\n${nextStep.description}\n\n⏱ 預計：${nextStep.estimatedMinutes} 分鐘\n✅ 完成標準：${nextStep.completionCriteria}`;
                await sendLineMessage(userId, reply);
              } else {
                await sendLineMessage(userId, '這個任務沒有設定步驟。');
              }
            }
          } else {
            await sendLineMessage(userId, '找不到最近的提醒記錄。');
          }

        } else {
          await sendLineMessage(userId,
            '收到你的訊息！\n\n可以回覆：\n完成\n延後30分鐘\n查看下一步'
          );
        }
      } catch (err) {
        console.error('處理 LINE 回覆失敗：', err.message);
      }
    }
  });

  console.log('💬 LINE Webhook 已啟用：POST /webhook');
}

// ═══════════════════════════════════════════
// 輔助函式：合併確認頁上使用者編輯的內容
// ═══════════════════════════════════════════
function mergeEditedPlan(originalPlan, body) {
  const plan = JSON.parse(JSON.stringify(originalPlan)); // deep copy

  // 合併步驟編輯
  plan.steps = plan.steps.map((step, i) => ({
    ...step,
    title:             body[`step_title_${i}`]    || step.title,
    description:       body[`step_desc_${i}`]     || step.description,
    estimatedMinutes:  parseInt(body[`step_min_${i}`]) || step.estimatedMinutes,
    completionCriteria: body[`step_criteria_${i}`] || step.completionCriteria,
    toolUsageGuide:    body[`step_guide_${i}`]    || step.toolUsageGuide || ''
  }));

  // 合併提醒編輯，過濾掉被標記停用的
  plan.reminders = plan.reminders
    .map((r, i) => ({
      ...r,
      remindAt:           body[`r_time_${i}`]     || r.remindAt,
      step:               body[`r_step_${i}`]     !== undefined ? body[`r_step_${i}`] : r.step,
      message:            body[`r_msg_${i}`]      || r.message,
      completionCriteria: body[`r_criteria_${i}`] || r.completionCriteria,
      _enabled:           body[`r_enabled_${i}`]  !== '0'
    }))
    .filter(r => r._enabled);

  return plan;
}

// ═══════════════════════════════════════════
// 輔助函式：儲存任務與提醒到 SQLite
// ═══════════════════════════════════════════
function saveTaskAndReminders(formData, plan) {
  const insertAll = db.transaction(() => {
    // 儲存任務
    const taskResult = db.prepare(`
      INSERT INTO tasks (title, goal, content, deadline, available_time, tools, steps, suggested_tools)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plan.taskTitle || formData.taskName,
      plan.goal || '',
      formData.taskContent || '',
      formData.deadline || null,
      formData.availableTime || '',
      formData.tools || '',
      JSON.stringify(plan.steps || []),
      JSON.stringify(plan.suggestedTools || [])
    );

    const taskId = taskResult.lastInsertRowid;

    // 儲存提醒
    const insertReminder = db.prepare(`
      INSERT INTO reminders (task_id, remind_at, step, message, tools, completion_criteria)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const r of plan.reminders || []) {
      insertReminder.run(
        taskId,
        r.remindAt,
        r.step || '',
        r.message || '',
        JSON.stringify(Array.isArray(r.tools) ? r.tools : []),
        r.completionCriteria || ''
      );
    }

    return taskId;
  });

  return insertAll();
}

// ═══════════════════════════════════════════
// 啟動伺服器
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  const useLLM = process.env.USE_LLM !== 'false';
  const channel = process.env.REMINDER_CHANNEL || 'console';
  const requireConfirm = process.env.REQUIRE_CONFIRMATION !== 'false';
  const lineReply = process.env.ENABLE_LINE_REPLY === 'true';

  console.log('');
  console.log('🚀 數位學伴 已啟動！');
  console.log(`   網址：http://localhost:${PORT}`);
  console.log('');
  console.log('⚙️  目前設定：');
  console.log(`   USE_LLM            = ${useLLM ? '✅ 使用 LLM' : '❌ 使用固定規則'}`);
  console.log(`   REMINDER_CHANNEL   = ${channel === 'line' ? '📱 LINE' : '🖥  終端機（console）'}`);
  console.log(`   REQUIRE_CONFIRMATION = ${requireConfirm ? '✅ 需要確認' : '❌ 自動建立'}`);
  console.log(`   ENABLE_LINE_REPLY  = ${lineReply ? '✅ 啟用' : '❌ 停用'}`);
  console.log('');
  console.log('💡 測試提醒：在瀏覽器開啟 http://localhost:3000/test-reminder');
  console.log('');

  startScheduler();
});

module.exports = app;
