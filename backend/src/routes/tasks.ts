import { Router, Request, Response } from 'express';
import db from '../db/index';
import { generatePlan } from '../services/llm';
import { handleTaskChat, getTaskMessages } from '../services/taskChat';
import {
  Task,
  Step,
  Reminder,
  GeneratePlanRequest,
  CreateTaskRequest,
  TaskDetail,
  AIPlan,
} from '../types/index';

const router = Router();

// =============================================
// POST /api/tasks/chat
// 對話式任務規劃與即時修改（建立或更新任務與步驟）
// =============================================
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, task_id } = req.body as { message?: string; task_id?: number | null };
    if (!message || !message.trim()) {
      return res.status(400).json({ error: '缺少訊息內容 message' });
    }

    const result = await handleTaskChat(message.trim(), task_id);
    return res.json(result);
  } catch (error: any) {
    console.error('任務對話失敗：', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : '未知錯誤',
    });
  }
});

// =============================================
// GET /api/tasks/:id/messages
// 取得指定任務的對話歷史紀錄
// =============================================
router.get('/:id/messages', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '無效的任務 ID' });

  const messages = getTaskMessages(id);
  return res.json({ messages });
});

// =============================================
// POST /api/tasks/plan
// 呼叫 LLM 產生規劃（尚未寫入資料庫）
// =============================================
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const body = req.body as GeneratePlanRequest;

    // 簡單驗證
    if (!body.name || !body.goal_description || !body.deadline) {
      return res.status(400).json({ error: '缺少必填欄位：name, goal_description, deadline' });
    }

    const plan: AIPlan = await generatePlan(body);
    return res.json({ plan });
  } catch (error) {
    console.error('產生規劃失敗：', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : '未知錯誤',
    });
  }
});

// =============================================
// POST /api/tasks
// 確認規劃並寫入資料庫
// =============================================
router.post('/', (req: Request, res: Response) => {
  const { form_data, plan } = req.body as CreateTaskRequest;

  if (!form_data || !plan) {
    return res.status(400).json({ error: '缺少 form_data 或 plan' });
  }

  // 使用 transaction 確保原子性（全部成功或全部失敗）
  const insertAll = db.transaction(() => {
    // 1. 插入任務
    const taskResult = db
      .prepare(`
        INSERT INTO tasks (
          name, goal_description, deadline, available_time,
          task_type, tools, need_line, status, ai_goal, ai_tools
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .run(
        form_data.name,
        form_data.goal_description,
        form_data.deadline,
        form_data.available_time,
        form_data.task_type,
        JSON.stringify(form_data.tools),
        form_data.need_line ? 1 : 0,
        plan.goal,
        JSON.stringify(plan.suggested_tools)
      );

    const taskId = taskResult.lastInsertRowid as number;

    // 2. 插入步驟
    const insertStep = db.prepare(`
      INSERT INTO steps (task_id, order_num, title, description, estimated_time, tool_suggestion, completion_criteria)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const stepIds: number[] = [];
    plan.steps.forEach((step, index) => {
      const stepResult = insertStep.run(
        taskId,
        index + 1,
        step.title,
        step.description,
        step.estimated_time,
        step.tool_suggestion,
        step.completion_criteria
      );
      stepIds.push(stepResult.lastInsertRowid as number);
    });

    // 3. 插入提醒
    const insertReminder = db.prepare(`
      INSERT INTO reminders (task_id, step_id, remind_at, message, status, enabled)
      VALUES (?, ?, ?, ?, 'pending', 1)
    `);

    plan.reminders.forEach((reminder) => {
      const stepId =
        reminder.step_index >= 0 && reminder.step_index < stepIds.length
          ? stepIds[reminder.step_index]
          : null;

      insertReminder.run(taskId, stepId, reminder.remind_at, reminder.message);
    });

    return taskId;
  });

  try {
    const taskId = insertAll();
    const detail = getTaskDetail(taskId as number);
    return res.status(201).json(detail);
  } catch (error) {
    console.error('建立任務失敗：', error);
    return res.status(500).json({ error: '儲存任務時發生錯誤' });
  }
});

// =============================================
// GET /api/tasks
// 取得所有任務列表
// =============================================
router.get('/', (_req: Request, res: Response) => {
  const tasks = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM steps WHERE task_id = t.id) as step_count,
      (SELECT COUNT(*) FROM steps WHERE task_id = t.id AND status = 'completed') as completed_steps,
      (SELECT MIN(remind_at) FROM reminders WHERE task_id = t.id AND status = 'pending' AND enabled = 1) as next_reminder
    FROM tasks t
    ORDER BY t.created_at DESC
  `).all();

  return res.json({ tasks });
});

// =============================================
// GET /api/tasks/:id
// 取得單一任務詳細資訊（含步驟和提醒）
// =============================================
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '無效的任務 ID' });

  const detail = getTaskDetail(id);
  if (!detail) return res.status(404).json({ error: '找不到此任務' });

  return res.json(detail);
});

// =============================================
// PUT /api/tasks/:id
// 編輯任務基本資料（名稱、目標、截止時間、可用時間、類型）
// deadline 必須是本地無時區格式 YYYY-MM-DDTHH:MM[:SS]（見 utils/time.ts 的時間政策）
// =============================================
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '無效的任務 ID' });

  const { name, goal_description, deadline, available_time, task_type, ai_goal } =
    req.body as Partial<Task>;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (goal_description !== undefined) { fields.push('goal_description = ?'); values.push(goal_description); }
  if (deadline !== undefined) { fields.push('deadline = ?'); values.push(deadline); }
  if (available_time !== undefined) { fields.push('available_time = ?'); values.push(available_time); }
  if (task_type !== undefined) { fields.push('task_type = ?'); values.push(task_type); }
  if (ai_goal !== undefined) { fields.push('ai_goal = ?'); values.push(ai_goal); }

  if (fields.length === 0) return res.status(400).json({ error: '沒有要更新的欄位' });

  values.push(id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const detail = getTaskDetail(id);
  if (!detail) return res.status(404).json({ error: '找不到此任務' });
  return res.json(detail);
});

// =============================================
// PUT /api/tasks/:id/status
// 更新任務狀態
// =============================================
router.put('/:id/status', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { status } = req.body as { status: string };

  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    return res.status(400).json({ error: '無效的狀態值' });
  }

  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  return res.json({ success: true });
});

// =============================================
// PUT /api/reminders/:id
// 更新提醒（時間、訊息、是否啟用）
// =============================================
router.put('/reminders/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { remind_at, message, enabled, status } = req.body as Partial<Reminder>;

  if (isNaN(id)) return res.status(400).json({ error: '無效的提醒 ID' });

  const fields: string[] = [];
  const values: unknown[] = [];

  if (remind_at !== undefined) { fields.push('remind_at = ?'); values.push(remind_at); }
  if (message !== undefined) { fields.push('message = ?'); values.push(message); }
  if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }

  if (fields.length === 0) return res.status(400).json({ error: '沒有要更新的欄位' });

  values.push(id);
  db.prepare(`UPDATE reminders SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return res.json({ success: true });
});

// =============================================
// PUT /api/steps/:id
// 更新步驟狀態
// =============================================
router.put('/steps/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { status, title, description, estimated_time, tool_suggestion, completion_criteria } =
    req.body as Partial<Step>;

  if (isNaN(id)) return res.status(400).json({ error: '無效的步驟 ID' });

  const fields: string[] = [];
  const values: unknown[] = [];

  if (status !== undefined) { fields.push('status = ?'); values.push(status); }
  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (estimated_time !== undefined) { fields.push('estimated_time = ?'); values.push(estimated_time); }
  if (tool_suggestion !== undefined) { fields.push('tool_suggestion = ?'); values.push(tool_suggestion); }
  if (completion_criteria !== undefined) { fields.push('completion_criteria = ?'); values.push(completion_criteria); }

  if (fields.length === 0) return res.status(400).json({ error: '沒有要更新的欄位' });

  values.push(id);
  db.prepare(`UPDATE steps SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return res.json({ success: true });
});

// =============================================
// DELETE /api/tasks/:id
// 刪除任務（CASCADE 會同時刪除步驟和提醒）
// =============================================
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '無效的任務 ID' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return res.json({ success: true });
});

// =============================================
// 輔助函式：取得任務完整資訊
// =============================================
function getTaskDetail(id: number): TaskDetail | null {
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

export default router;
