// =============================================
// taskChat.ts — 對話式任務規劃與即時修改服務
//
// 每個任務都是一個 session，使用者能透過自然語言對話：
// 1. 建立全新任務與步驟拆解
// 2. 更新步驟狀態（完成、進行中）
// 3. 增刪修改步驟與提醒
// 4. 即時同步資料庫並由後端回傳最新 TaskDetail
// =============================================
import db from '../db/index';
import { getAiSettings } from './aiSettings';
import { callOpenAICompatible } from './aiClient';
import { formatLocal } from '../utils/time';
import {
  Task,
  Step,
  Reminder,
  TaskDetail,
  TaskMessage,
  TaskChatResponse,
  AiMessage,
  TaskType,
} from '../types/index';

// 輔助函式：取得單一任務完整資訊
export function getTaskDetail(id: number): TaskDetail | null {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  if (!task) return null;

  const steps = db
    .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY order_num ASC')
    .all(id) as Step[];

  const reminders = db
    .prepare('SELECT * FROM reminders WHERE task_id = ? ORDER BY remind_at ASC')
    .all(id) as Reminder[];

  return { task, steps, reminders };
}

// 輔助函式：取得任務的歷史訊息
export function getTaskMessages(taskId: number): TaskMessage[] {
  return db
    .prepare('SELECT * FROM task_messages WHERE task_id = ? ORDER BY id ASC')
    .all(taskId) as TaskMessage[];
}

// 建立 System Prompt
function buildSystemPrompt(currentTask: TaskDetail | null): string {
  const now = new Date();
  const nowStr = formatLocal(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = formatLocal(tomorrow);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = formatLocal(nextWeek);

  if (!currentTask) {
    return `你是一個專業、親切的任務規劃教練（數位學伴）。
目前台灣本地時間是：${nowStr}。

【角色與目標】
學生會用自然對話告訴你他想完成的目標、作業、考試或計畫。
你的職責是陪伴他釐清目標，並主動幫他拆解出結構化、可執行的步驟與提醒。

【重要行為守則】
1. 當使用者提出想完成的事情時，請「立即為他建立任務」，在回覆文字的最後附上 \`\`\`action ... \`\`\` 區塊執行 create_task。
2. 若使用者未明確指定截止時間，預設推算為一週後（例如：${nextWeekStr}）；可用時間若未說明可預設為「每天晚上1-2小時」。
3. 在你的回覆文字中，以熱情友善的語氣向學生說明規劃重點，並告訴他：「我已經為你建立了這份計畫！你隨時可以在對話中告訴我任何想要修改或調整的地方。」
4. 所有的日期時間（deadline、remind_at）必須是台灣本地無時區格式（YYYY-MM-DDTHH:MM:SS），絕對不要加上 Z 或 UTC 偏移量！

【建立任務 Action 格式範例】
\`\`\`action
{
  "action": "create_task",
  "name": "任務名稱（簡短精確）",
  "goal_description": "清楚具體的完成目標說明",
  "deadline": "${nextWeekStr}",
  "available_time": "每天晚上2小時",
  "task_type": "學習",
  "tools": ["Notion", "ChatGPT"],
  "steps": [
    {
      "title": "步驟 1 標題",
      "description": "具體執行內容說明",
      "estimated_time": "30分鐘",
      "tool_suggestion": "使用的工具",
      "completion_criteria": "如何判定完成"
    },
    {
      "title": "步驟 2 標題",
      "description": "具體執行內容說明",
      "estimated_time": "45分鐘",
      "tool_suggestion": "使用的工具",
      "completion_criteria": "如何判定完成"
    }
  ],
  "reminders": [
    {
      "remind_at": "${tomorrowStr}",
      "step_index": 0,
      "message": "【數位學伴提醒】記得開始執行：步驟 1 標題！"
    }
  ]
}
\`\`\`
注意：\`\`\`action 區塊中的內容必須是合法 JSON，且不要在 JSON 內部加註解。`;
  }

  const taskSummary = {
    id: currentTask.task.id,
    name: currentTask.task.name,
    goal_description: currentTask.task.goal_description,
    deadline: currentTask.task.deadline,
    available_time: currentTask.task.available_time,
    task_type: currentTask.task.task_type,
    status: currentTask.task.status,
    steps: currentTask.steps.map((s) => ({
      id: s.id,
      order_num: s.order_num,
      title: s.title,
      description: s.description,
      estimated_time: s.estimated_time,
      tool_suggestion: s.tool_suggestion,
      completion_criteria: s.completion_criteria,
      status: s.status,
    })),
    reminders: currentTask.reminders.map((r) => ({
      id: r.id,
      step_id: r.step_id,
      remind_at: r.remind_at,
      message: r.message,
      enabled: Boolean(r.enabled),
    })),
  };

  return `你是一個專業、親切的任務規劃夥伴（數位學伴）。
目前台灣本地時間是：${nowStr}。

【目前正在進行的任務資料（即時資料庫狀態）】
\`\`\`json
${JSON.stringify(taskSummary, null, 2)}
\`\`\`

【角色與職責】
使用者正在與你就這個任務進行對話。他可能回報進度、調整截止日、增減步驟或調整提醒。

【資料庫修改權力（Action 機制）】
當對話需要修改任務內容或步驟進度時，請在回覆文字的最後面附帶一個 \`\`\`action ... \`\`\` JSON 區塊。後端會自動攔截並即時同步修改資料庫！
支援的操作包含：

1. 標記步驟狀態：
\`\`\`action
{ "action": "set_step_status", "order_num": 1, "status": "completed" }
\`\`\`
（status 可為 "completed"、"in_progress"、"pending"）

2. 修改任務基本資料：
\`\`\`action
{ "action": "update_task", "deadline": "${nextWeekStr}", "status": "in_progress" }
\`\`\`

3. 新增步驟：
\`\`\`action
{
  "action": "add_step",
  "title": "新步驟標題",
  "description": "內容說明",
  "estimated_time": "1小時",
  "tool_suggestion": "工具",
  "completion_criteria": "完成標準",
  "insert_after_order": 2
}
\`\`\`

4. 修改步驟：
\`\`\`action
{
  "action": "update_step",
  "order_num": 2,
  "title": "修改後的標題",
  "description": "修改後的說明"
}
\`\`\`

5. 刪除步驟：
\`\`\`action
{ "action": "delete_step", "order_num": 2 }
\`\`\`

6. 全面重新規劃所有步驟與提醒：
\`\`\`action
{
  "action": "replan_steps",
  "steps": [ ... ],
  "reminders": [ ... ]
}
\`\`\`

7. 新增提醒：
\`\`\`action
{ "action": "add_reminder", "remind_at": "${tomorrowStr}", "message": "提醒文字" }
\`\`\`

8. 刪除提醒：
\`\`\`action
{ "action": "delete_reminder", "reminder_id": 1 }
\`\`\`

【重要規則】
- 若對話只是純討論或解答問題、不需要更動資料庫，請不要輸出 \`\`\`action 區塊。
- 所有的時間欄位必須是本地無時區格式（YYYY-MM-DDTHH:MM:SS）。
- 回覆文字要友善自然，清楚說明你做了哪些更新。`;
}

// 執行 Action 區塊更動資料庫
function executeAction(actionObj: any, currentTaskId: number | null): number {
  const actionType = actionObj.action || actionObj.type;

  if (actionType === 'create_task') {
    const taskResult = db
      .prepare(`
        INSERT INTO tasks (
          name, goal_description, deadline, available_time,
          task_type, tools, need_line, status, ai_goal, ai_tools
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)
      `)
      .run(
        actionObj.name || '未命名任務',
        actionObj.goal_description || '',
        actionObj.deadline || formatLocal(new Date(Date.now() + 7 * 86400000)),
        actionObj.available_time || '每天 1-2 小時',
        (actionObj.task_type as TaskType) || '學習',
        JSON.stringify(actionObj.tools || []),
        actionObj.goal_description || '',
        JSON.stringify(actionObj.tools || [])
      );

    const newTaskId = taskResult.lastInsertRowid as number;

    // 插入步驟
    const insertStep = db.prepare(`
      INSERT INTO steps (task_id, order_num, title, description, estimated_time, tool_suggestion, completion_criteria)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const stepIds: number[] = [];
    if (Array.isArray(actionObj.steps)) {
      actionObj.steps.forEach((step: any, idx: number) => {
        const stepRes = insertStep.run(
          newTaskId,
          idx + 1,
          step.title || `步驟 ${idx + 1}`,
          step.description || '',
          step.estimated_time || '',
          step.tool_suggestion || '',
          step.completion_criteria || ''
        );
        stepIds.push(stepRes.lastInsertRowid as number);
      });
    }

    // 插入提醒
    const insertReminder = db.prepare(`
      INSERT INTO reminders (task_id, step_id, remind_at, message, status, enabled)
      VALUES (?, ?, ?, ?, 'pending', 1)
    `);

    if (Array.isArray(actionObj.reminders)) {
      actionObj.reminders.forEach((rem: any) => {
        const stepId =
          typeof rem.step_index === 'number' && rem.step_index >= 0 && rem.step_index < stepIds.length
            ? stepIds[rem.step_index]
            : null;
        insertReminder.run(
          newTaskId,
          stepId,
          rem.remind_at || formatLocal(new Date(Date.now() + 86400000)),
          rem.message || `【數位學伴提醒】記得執行任務：${actionObj.name}`
        );
      });
    }

    return newTaskId;
  }

  // 以下操作需要已存在的 taskId
  if (!currentTaskId) {
    throw new Error('無法在未建立任務前執行該操作');
  }

  if (actionType === 'update_task') {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (actionObj.name !== undefined) { fields.push('name = ?'); values.push(actionObj.name); }
    if (actionObj.goal_description !== undefined) { fields.push('goal_description = ?'); values.push(actionObj.goal_description); }
    if (actionObj.deadline !== undefined) { fields.push('deadline = ?'); values.push(actionObj.deadline); }
    if (actionObj.available_time !== undefined) { fields.push('available_time = ?'); values.push(actionObj.available_time); }
    if (actionObj.task_type !== undefined) { fields.push('task_type = ?'); values.push(actionObj.task_type); }
    if (actionObj.status !== undefined) { fields.push('status = ?'); values.push(actionObj.status); }
    if (actionObj.ai_goal !== undefined) { fields.push('ai_goal = ?'); values.push(actionObj.ai_goal); }

    if (fields.length > 0) {
      values.push(currentTaskId);
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  } else if (actionType === 'set_step_status') {
    const status = actionObj.status === 'completed' ? 'completed' : 'pending';
    if (actionObj.step_id) {
      db.prepare('UPDATE steps SET status = ? WHERE id = ? AND task_id = ?').run(status, actionObj.step_id, currentTaskId);
    } else if (actionObj.order_num) {
      db.prepare('UPDATE steps SET status = ? WHERE order_num = ? AND task_id = ?').run(status, actionObj.order_num, currentTaskId);
    }

    // 自動更新任務狀態：全完成為 completed，部分完成為 in_progress
    const counts = db
      .prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM steps WHERE task_id = ?
      `)
      .get(currentTaskId) as { total: number; completed: number };

    if (counts && counts.total > 0) {
      if (counts.completed === counts.total) {
        db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(currentTaskId);
      } else if (counts.completed > 0) {
        db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(currentTaskId);
      }
    }
  } else if (actionType === 'add_step') {
    let newOrder = 1;
    if (typeof actionObj.insert_after_order === 'number') {
      newOrder = actionObj.insert_after_order + 1;
      db.prepare('UPDATE steps SET order_num = order_num + 1 WHERE task_id = ? AND order_num >= ?').run(currentTaskId, newOrder);
    } else {
      const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM steps WHERE task_id = ?').get(currentTaskId) as { m: number | null };
      newOrder = (maxOrder?.m || 0) + 1;
    }

    db.prepare(`
      INSERT INTO steps (task_id, order_num, title, description, estimated_time, tool_suggestion, completion_criteria, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      currentTaskId,
      newOrder,
      actionObj.title || `步驟 ${newOrder}`,
      actionObj.description || '',
      actionObj.estimated_time || '',
      actionObj.tool_suggestion || '',
      actionObj.completion_criteria || ''
    );
  } else if (actionType === 'update_step') {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (actionObj.title !== undefined) { fields.push('title = ?'); values.push(actionObj.title); }
    if (actionObj.description !== undefined) { fields.push('description = ?'); values.push(actionObj.description); }
    if (actionObj.estimated_time !== undefined) { fields.push('estimated_time = ?'); values.push(actionObj.estimated_time); }
    if (actionObj.tool_suggestion !== undefined) { fields.push('tool_suggestion = ?'); values.push(actionObj.tool_suggestion); }
    if (actionObj.completion_criteria !== undefined) { fields.push('completion_criteria = ?'); values.push(actionObj.completion_criteria); }
    if (actionObj.status !== undefined) { fields.push('status = ?'); values.push(actionObj.status); }

    if (fields.length > 0) {
      if (actionObj.step_id) {
        values.push(actionObj.step_id, currentTaskId);
        db.prepare(`UPDATE steps SET ${fields.join(', ')} WHERE id = ? AND task_id = ?`).run(...values);
      } else if (actionObj.order_num) {
        values.push(actionObj.order_num, currentTaskId);
        db.prepare(`UPDATE steps SET ${fields.join(', ')} WHERE order_num = ? AND task_id = ?`).run(...values);
      }
    }
  } else if (actionType === 'delete_step') {
    if (actionObj.step_id) {
      db.prepare('DELETE FROM steps WHERE id = ? AND task_id = ?').run(actionObj.step_id, currentTaskId);
    } else if (actionObj.order_num) {
      db.prepare('DELETE FROM steps WHERE order_num = ? AND task_id = ?').run(actionObj.order_num, currentTaskId);
    }
    // 重新編號 order_num
    const remainingSteps = db.prepare('SELECT id FROM steps WHERE task_id = ? ORDER BY order_num ASC, id ASC').all(currentTaskId) as { id: number }[];
    const updateOrder = db.prepare('UPDATE steps SET order_num = ? WHERE id = ?');
    remainingSteps.forEach((s, idx) => updateOrder.run(idx + 1, s.id));
  } else if (actionType === 'replan_steps') {
    // 刪除所有現有步驟與提醒
    db.prepare('DELETE FROM steps WHERE task_id = ?').run(currentTaskId);
    db.prepare('DELETE FROM reminders WHERE task_id = ?').run(currentTaskId);

    const insertStep = db.prepare(`
      INSERT INTO steps (task_id, order_num, title, description, estimated_time, tool_suggestion, completion_criteria, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const stepIds: number[] = [];
    if (Array.isArray(actionObj.steps)) {
      actionObj.steps.forEach((step: any, idx: number) => {
        const stepRes = insertStep.run(
          currentTaskId,
          idx + 1,
          step.title || `步驟 ${idx + 1}`,
          step.description || '',
          step.estimated_time || '',
          step.tool_suggestion || '',
          step.completion_criteria || ''
        );
        stepIds.push(stepRes.lastInsertRowid as number);
      });
    }

    if (Array.isArray(actionObj.reminders)) {
      const insertReminder = db.prepare(`
        INSERT INTO reminders (task_id, step_id, remind_at, message, status, enabled)
        VALUES (?, ?, ?, ?, 'pending', 1)
      `);
      actionObj.reminders.forEach((rem: any) => {
        const stepId =
          typeof rem.step_index === 'number' && rem.step_index >= 0 && rem.step_index < stepIds.length
            ? stepIds[rem.step_index]
            : null;
        insertReminder.run(
          currentTaskId,
          stepId,
          rem.remind_at || formatLocal(new Date(Date.now() + 86400000)),
          rem.message || '【數位學伴提醒】任務進度提醒'
        );
      });
    }
  } else if (actionType === 'add_reminder') {
    db.prepare(`
      INSERT INTO reminders (task_id, step_id, remind_at, message, status, enabled)
      VALUES (?, ?, ?, ?, 'pending', 1)
    `).run(
      currentTaskId,
      actionObj.step_id || null,
      actionObj.remind_at || formatLocal(new Date(Date.now() + 86400000)),
      actionObj.message || '【數位學伴提醒】'
    );
  } else if (actionType === 'update_reminder') {
    if (actionObj.reminder_id) {
      const fields: string[] = [];
      const values: unknown[] = [];
      if (actionObj.remind_at !== undefined) { fields.push('remind_at = ?'); values.push(actionObj.remind_at); }
      if (actionObj.message !== undefined) { fields.push('message = ?'); values.push(actionObj.message); }
      if (actionObj.enabled !== undefined) { fields.push('enabled = ?'); values.push(actionObj.enabled ? 1 : 0); }
      if (actionObj.status !== undefined) { fields.push('status = ?'); values.push(actionObj.status); }

      if (fields.length > 0) {
        values.push(actionObj.reminder_id, currentTaskId);
        db.prepare(`UPDATE reminders SET ${fields.join(', ')} WHERE id = ? AND task_id = ?`).run(...values);
      }
    }
  } else if (actionType === 'delete_reminder') {
    if (actionObj.reminder_id) {
      db.prepare('DELETE FROM reminders WHERE id = ? AND task_id = ?').run(actionObj.reminder_id, currentTaskId);
    }
  }

  return currentTaskId;
}

// 主要對話處理函式
export async function handleTaskChat(
  messageText: string,
  taskId?: number | null
): Promise<TaskChatResponse> {
  const cfg = getAiSettings();

  // 1. 取得既有任務狀態與歷史對話
  let currentTask: TaskDetail | null = null;
  let historyMessages: TaskMessage[] = [];

  if (taskId) {
    currentTask = getTaskDetail(taskId);
    if (!currentTask) {
      throw new Error(`找不到任務 ID ${taskId}`);
    }
    historyMessages = getTaskMessages(taskId);
  }

  // 2. 組裝 System Prompt 與對話歷程
  const systemPrompt = buildSystemPrompt(currentTask);
  const aiMessages: AiMessage[] = [{ role: 'system', content: systemPrompt }];

  // 放入最近 10 則歷史訊息
  const recentHistory = historyMessages.slice(-10);
  for (const m of recentHistory) {
    aiMessages.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    });
  }

  // 加入本次使用者的問題
  aiMessages.push({ role: 'user', content: messageText });

  // 3. 呼叫 AI 模型
  console.log(`💬 發送任務對話請求（task_id: ${taskId || '新建'}，模型: ${cfg.model_name}）`);
  const rawReply = await callOpenAICompatible(cfg, aiMessages, 90_000);

  // 4. 解析 Action 區塊（支援 ```action ... ``` 或 ```json ... ```）
  let cleanReply = rawReply;
  let actionDataStr: string | null = null;
  let actionsToExecute: any[] = [];

  const actionMatch = rawReply.match(/```(?:action|json)\s*([\s\S]*?)\s*```/);
  if (actionMatch) {
    actionDataStr = actionMatch[1].trim();
    try {
      const parsed = JSON.parse(actionDataStr);
      if (Array.isArray(parsed)) {
        actionsToExecute = parsed;
      } else if (Array.isArray(parsed.actions)) {
        actionsToExecute = parsed.actions;
      } else {
        actionsToExecute = [parsed];
      }
      // 移除回覆中的 action 程式碼區塊，讓使用者看到乾淨的回應
      cleanReply = rawReply.replace(actionMatch[0], '').trim();
    } catch (e) {
      console.warn('解析 action JSON 失敗：', e);
    }
  }

  // 如果清空後回覆變空，提供友善預設文字
  if (!cleanReply) {
    cleanReply = '好的，我已經為你更新了任務計畫！';
  }

  // 5. 在 SQLite transaction 中執行動作
  let finalTaskId: number | null = taskId || null;

  const runUpdates = db.transaction(() => {
    for (const act of actionsToExecute) {
      finalTaskId = executeAction(act, finalTaskId);
    }

    if (!finalTaskId) {
      // 若新對話但 AI 未發出 create_task，建立一個通用任務
      const defaultTaskRes = db
        .prepare(`
          INSERT INTO tasks (
            name, goal_description, deadline, available_time,
            task_type, tools, need_line, status, ai_goal, ai_tools
          ) VALUES (?, ?, ?, '每天 1 小時', '學習', '[]', 0, 'pending', ?, '[]')
        `)
        .run(
          messageText.slice(0, 20) || '新任務規劃',
          messageText,
          formatLocal(new Date(Date.now() + 7 * 86400000)),
          cleanReply.slice(0, 50)
        );
      finalTaskId = defaultTaskRes.lastInsertRowid as number;
    }

    // 儲存對話紀錄
    db.prepare(`
      INSERT INTO task_messages (task_id, role, content, action_data)
      VALUES (?, 'user', ?, NULL)
    `).run(finalTaskId, messageText);

    db.prepare(`
      INSERT INTO task_messages (task_id, role, content, action_data)
      VALUES (?, 'assistant', ?, ?)
    `).run(finalTaskId, cleanReply, actionDataStr);
  });

  runUpdates();

  if (!finalTaskId) {
    throw new Error('任務處理失敗，未能確定任務 ID');
  }

  const updatedDetail = getTaskDetail(finalTaskId);
  if (!updatedDetail) {
    throw new Error('無法取得更新後的任務資訊');
  }

  return {
    task_id: finalTaskId,
    reply: cleanReply,
    task: updatedDetail,
  };
}
