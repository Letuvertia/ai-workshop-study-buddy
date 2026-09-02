// =============================================
// taskChat.ts — 對話式任務規劃與即時修改服務
//
// 完整複刻 Charm Crush (OpenCode) 業界頂級 Context Management 架構：
// 1. 動態 Context 視窗閾值監控 (Adaptive Context Window Threshold)
//    - > 200k tokens 採用 20,000 token 安全緩衝
//    - <= 200k tokens 採用 20% 安全緩衝
// 2. 結構化滾動自動摘要 (Structured Auto-Summarization via summary.md 規格)
// 3. 任務清單注入 (Task Steps as Todos Injection)
// 4. 指針切片與角色重寫 (Session Slicing & Role Rewriting to 'user')
// 5. 工具與對話輸出首尾截斷 (Head-Tail Truncation with line count)
// 6. 提示詞快取與工作階段親和性 Header (x-session-id, x-session-affinity)
// 7. 即時修改資料庫並無縫更新 TaskDetail
// =============================================
import db from '../db/index';
import { getAiSettings } from './aiSettings';
import { callOpenAICompatibleWithUsage, sessionHeaders } from './aiClient';
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

// ── Crush 常數定義 (crush/internal/agent/agent.go) ─────────────────────────
export const LARGE_CONTEXT_WINDOW_THRESHOLD = 200_000;
export const LARGE_CONTEXT_WINDOW_BUFFER = 20_000;
export const SMALL_CONTEXT_WINDOW_RATIO = 0.2;

// ── Crush 模型 Context Window 判定 (crush/internal/agent/agent.go) ──────────
export function getModelContextWindow(modelName: string): number {
  const m = (modelName || '').toLowerCase();
  if (
    m.includes('claude-3-5') ||
    m.includes('claude-3-7') ||
    m.includes('claude-3-opus') ||
    m.includes('claude-3-sonnet')
  ) {
    return 200_000;
  }
  if (m.includes('gpt-4o') || m.includes('o1') || m.includes('o3') || m.includes('gpt-4-turbo')) {
    return 128_000;
  }
  if (m.includes('gemini-1.5') || m.includes('gemini-2.0') || m.includes('gemini-2.5')) {
    return 1_000_000;
  }
  if (m.includes('deepseek')) {
    return 64_000;
  }
  if (m.includes('llama') || m.includes('qwen') || m.includes('mistral') || m.includes('gemma')) {
    return 32_768;
  }
  return 32_768; // 預設保守估計
}

// ── Crush 工具與大輸出首尾保留截斷 (crush/internal/agent/tools/bash.go:427) ──
export function truncateOutput(content: string, maxOutputLength = 6000): string {
  if (content.length <= maxOutputLength) {
    return content;
  }

  const halfLength = Math.floor(maxOutputLength / 2);
  const start = content.slice(0, halfLength);
  const end = content.slice(content.length - halfLength);

  const startNewlines = (start.match(/\n/g) || []).length;
  const endNewlines = (end.match(/\n/g) || []).length;
  const totalNewlines = (content.match(/\n/g) || []).length;
  const truncatedLinesCount = Math.max(totalNewlines - startNewlines - endNewlines, 0);

  return `${start}\n\n... [${truncatedLinesCount} lines truncated] ...\n\n${end}`;
}

// ── Crush 規格摘要系統提示詞 (crush/internal/agent/templates/summary.md) ──────
export const SUMMARY_SYSTEM_PROMPT = `You are summarizing a conversation to preserve context for continuing work later.

**Critical**: This summary will be the ONLY context available when the conversation resumes. Assume all previous messages will be lost. Be thorough.

**Required sections**:

## Current State
- What task is being worked on (exact student goal)
- Current progress and what has been completed
- What is being worked on right now (in-progress work)
- What remains to be done (specific next steps, not vague)

## Steps & Changes
- Steps that were created, modified, or completed
- Important deadline, time, and scheduling constraints
- Key steps not yet touched but will need changes

## Strategy & Student Context
- Learning habits, study pace, or constraints mentioned by the student
- Tools, materials, or frameworks being used
- What worked well and what failed or was delayed
- Tone and preferences of the student

## Exact Next Steps
Be specific. Don't write "study for test" - write actionable items:
1. Complete step #1 by reviewing chapters 1-3
2. Practice with past midterm exams
3. Review incorrect questions and formulas

**Tone**: Write as if briefing a study coach/tutor taking over mid-task. Include everything they'd need to continue without asking questions. No emojis ever.

**Length**: No limit. Err on the side of too much detail rather than too little. Critical context is worth the tokens.`;

// ── Crush 任務清單提示詞建構 (crush/internal/agent/agent.go:2241) ───────────
export function buildSummaryPrompt(steps: Step[]): string {
  let text = 'Provide a detailed summary of our conversation above.';
  if (steps && steps.length > 0) {
    text += '\n\n## Current Step List\n\n';
    for (const s of steps) {
      text += `- [${s.status}] #${s.order_num} ${s.title} (預估: ${s.estimated_time || '未指定'})\n`;
    }
    text += '\nInclude these tasks and their statuses in your summary. Instruct the resuming assistant to continue tracking progress on these tasks.';
  }
  return text;
}

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

// 輔助函式：取得任務的完整歷史訊息（前端 UI 呈現完整紀錄用）
export function getTaskMessages(taskId: number): TaskMessage[] {
  return db
    .prepare('SELECT * FROM task_messages WHERE task_id = ? ORDER BY id ASC')
    .all(taskId) as TaskMessage[];
}

// ── Crush 指針切片與角色重寫 (crush/internal/agent/agent.go:1689-1708) ────────
// 當 Session 存在 SummaryMessageID 時，丟棄摘要前的所有舊訊息，並將摘要訊息角色重寫為 'user'
export function getSessionMessages(taskId: number): TaskMessage[] {
  const msgs = db
    .prepare('SELECT * FROM task_messages WHERE task_id = ? ORDER BY id ASC')
    .all(taskId) as TaskMessage[];

  const task = db
    .prepare('SELECT summary_message_id FROM tasks WHERE id = ?')
    .get(taskId) as { summary_message_id: number | null } | undefined;

  if (task && task.summary_message_id) {
    const summaryIdx = msgs.findIndex((m) => m.id === task.summary_message_id);
    if (summaryIdx !== -1) {
      // 切片：只保留從摘要訊息開始（包含摘要自身）的後續對話
      const sliced = msgs.slice(summaryIdx);
      if (sliced.length > 0) {
        // Crush 關鍵機制：將 Assistant 摘要轉寫為 User 角色，作為新上下文的基底！
        sliced[0] = {
          ...sliced[0],
          role: 'user',
        };
      }
      return sliced;
    }
  }

  return msgs;
}

// ── Crush 執行結構化摘要 (crush/internal/agent/agent.go:1329-1463) ───────────
export async function executeSummarize(taskId: number): Promise<TaskMessage> {
  const currentTask = getTaskDetail(taskId);
  if (!currentTask) throw new Error(`找不到任務 ID ${taskId}`);

  const allMsgs = db
    .prepare('SELECT * FROM task_messages WHERE task_id = ? ORDER BY id ASC')
    .all(taskId) as TaskMessage[];

  if (allMsgs.length === 0) {
    throw new Error('尚無對話紀錄可進行摘要');
  }

  const cfg = getAiSettings();
  const summaryPromptText = buildSummaryPrompt(currentTask.steps);

  // 組裝歷史訊息給摘要模型（含 System Prompt）
  const summaryInputMsgs: AiMessage[] = [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    ...allMsgs.map((m) => ({
      role: (m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user') as
        | 'system'
        | 'assistant'
        | 'user',
      content: truncateOutput(m.content, 4000),
    })),
    { role: 'user', content: summaryPromptText },
  ];

  console.log(`📝 [Crush Context] 開始執行任務 #${taskId} 的結構化滾動摘要...`);
  const result = await callOpenAICompatibleWithUsage(cfg, summaryInputMsgs, {
    timeoutMs: 90_000,
    headers: sessionHeaders(taskId),
  });

  const summaryContent = result.content.trim();
  const completionTokens =
    result.usage?.completion_tokens || Math.ceil(summaryContent.length / 3.5);

  // 寫入摘要訊息至 task_messages (is_summary_message = 1)
  const insertRes = db
    .prepare(`
      INSERT INTO task_messages (task_id, role, content, action_data, is_summary_message)
      VALUES (?, 'assistant', ?, NULL, 1)
    `)
    .run(taskId, summaryContent);

  const summaryMessageId = insertRes.lastInsertRowid as number;

  // 重設 Session 狀態指針與 Token 記數（完全比照 Crush 做法）
  db.prepare(`
    UPDATE tasks
    SET summary_message_id = ?,
        completion_tokens = ?,
        prompt_tokens = 0
    WHERE id = ?
  `).run(summaryMessageId, completionTokens, taskId);

  console.log(`✅ [Crush Context] 摘要完成！SummaryMessageID: ${summaryMessageId}, 重設 Token: ${completionTokens}`);

  return {
    id: summaryMessageId,
    task_id: taskId,
    role: 'assistant',
    content: summaryContent,
    action_data: null,
    is_summary_message: 1,
    created_at: formatLocal(new Date()),
  };
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
      "message": "該開始進行步驟 1 囉！"
    }
  ]
}
\`\`\`
請確保輸出的 JSON 格式絕對合法。`;
  }

  // 現有任務模式：AI 隨時可根據學生對話修改任務屬性、步驟與提醒
  const { task, steps, reminders } = currentTask;
  const currentTaskStateJson = JSON.stringify(
    {
      id: task.id,
      name: task.name,
      goal: task.goal_description,
      deadline: task.deadline,
      available_time: task.available_time,
      task_type: task.task_type,
      status: task.status,
      steps: steps.map((s) => ({
        id: s.id,
        order: s.order_num,
        title: s.title,
        description: s.description,
        estimated_time: s.estimated_time,
        tool_suggestion: s.tool_suggestion,
        completion_criteria: s.completion_criteria,
        status: s.status,
      })),
      reminders: reminders.map((r) => ({
        id: r.id,
        remind_at: r.remind_at,
        message: r.message,
        enabled: Boolean(r.enabled),
        status: r.status,
      })),
    },
    null,
    2
  );

  return `你是一個專業、親切的任務規劃教練（數位學伴）。
目前台灣本地時間是：${nowStr}。

你目前正在陪伴學生進行任務「${task.name}」的跟進與持續規劃。
目前資料庫中此任務的最新即時狀態如下：
\`\`\`json
${currentTaskStateJson}
\`\`\`

【你的職責與強大能力】
學生會在對話中向你回報進度、要求修改任務名稱或截止時間、要求增刪或調整步驟、或是要求打勾完成某個步驟。
你擁有「直接操作資料庫」的能力！請在你的自然語言回覆後方，附上對應的 \`\`\`action ... \`\`\` 區塊，後端會精確執行你的指令並即時同步給學生。

【可用的 Action 類型】
1. 標記步驟完成/待處理：
\`\`\`action
{
  "action": "set_step_status",
  "step_id": 步驟ID,
  "status": "completed" 或 "pending"
}
\`\`\`

2. 修改任務基本資訊（截止日、可用時間、目標）：
\`\`\`action
{
  "action": "update_task",
  "deadline": "2026-09-15T23:59:00",
  "available_time": "每天1.5小時"
}
\`\`\`

3. 新增單一步驟：
\`\`\`action
{
  "action": "add_step",
  "title": "新步驟標題",
  "description": "步驟內容",
  "estimated_time": "40分鐘",
  "tool_suggestion": "Google Docs",
  "completion_criteria": "完成初稿"
}
\`\`\`

4. 編輯既有步驟：
\`\`\`action
{
  "action": "update_step",
  "step_id": 步驟ID,
  "title": "修改後的標題",
  "estimated_time": "1小時"
}
\`\`\`

5. 刪除步驟：
\`\`\`action
{
  "action": "delete_step",
  "step_id": 步驟ID
}
\`\`\`

6. 全面重新規劃所有步驟（replan）：
\`\`\`action
{
  "action": "replan_steps",
  "steps": [
    {
      "title": "重整後步驟1",
      "description": "...",
      "estimated_time": "30分鐘",
      "tool_suggestion": "...",
      "completion_criteria": "..."
    }
  ]
}
\`\`\`

7. 新增或更新提醒：
\`\`\`action
{
  "action": "add_reminder",
  "remind_at": "2026-09-10T09:00:00",
  "message": "提醒：明天就要交報告囉！"
}
\`\`\`

【回覆準則】
1. 請以正向、鼓勵且具體的口吻與學生交談。
2. 若學生表示「步驟1做完了」，除了讚賞他的努力，請務必在結尾附上 set_step_status action 將該步驟標記為 completed！
3. 若學生僅是詢問問題或閒聊，不需修改任務時，則不必輸出 action 區塊。
4. 所有時間字串務必遵循台灣本地無時區格式（YYYY-MM-DDTHH:MM:SS）。`;
}

// 執行 Action 寫入 SQLite
function executeAction(actionObj: any, currentTaskId: number | null): number | null {
  if (!actionObj || typeof actionObj !== 'object') return currentTaskId;

  const actionType = actionObj.action;

  if (actionType === 'create_task') {
    const taskName = actionObj.name || '新任務規劃';
    const goalDesc = actionObj.goal_description || taskName;
    const deadline =
      actionObj.deadline || formatLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const availableTime = actionObj.available_time || '每天 1-2 小時';
    const taskType: TaskType = actionObj.task_type || '學習';
    const toolsStr = JSON.stringify(actionObj.tools || []);

    const insertTask = db.prepare(`
      INSERT INTO tasks (
        name, goal_description, deadline, available_time,
        task_type, tools, need_line, status, ai_goal, ai_tools
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)
    `);

    const taskRes = insertTask.run(
      taskName,
      goalDesc,
      deadline,
      availableTime,
      taskType,
      toolsStr,
      goalDesc,
      toolsStr
    );

    const newTaskId = taskRes.lastInsertRowid as number;
    currentTaskId = newTaskId;

    const stepIds: number[] = [];
    if (Array.isArray(actionObj.steps)) {
      const insertStep = db.prepare(`
        INSERT INTO steps (
          task_id, order_num, title, description, estimated_time,
          tool_suggestion, completion_criteria, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `);

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

    if (Array.isArray(actionObj.reminders)) {
      const insertReminder = db.prepare(`
        INSERT INTO reminders (
          task_id, step_id, remind_at, message, status, enabled
        ) VALUES (?, ?, ?, ?, 'pending', 1)
      `);

      actionObj.reminders.forEach((rem: any) => {
        const stepId =
          typeof rem.step_index === 'number' &&
          rem.step_index >= 0 &&
          rem.step_index < stepIds.length
            ? stepIds[rem.step_index]
            : null;
        insertReminder.run(
          newTaskId,
          stepId,
          rem.remind_at || formatLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)),
          rem.message || `【數位學伴提醒】${taskName} 進度提醒`
        );
      });
    }

    return newTaskId;
  }

  if (!currentTaskId) return null;

  if (actionType === 'update_task') {
    const fields: string[] = [];
    const values: unknown[] = [];
    const taskName = actionObj.name || actionObj.title;
    if (taskName) { fields.push('name = ?'); values.push(taskName); }
    const goal = actionObj.goal_description || actionObj.goal;
    if (goal) { fields.push('goal_description = ?'); values.push(goal); }
    if (actionObj.deadline) { fields.push('deadline = ?'); values.push(actionObj.deadline); }
    if (actionObj.available_time) { fields.push('available_time = ?'); values.push(actionObj.available_time); }
    if (actionObj.task_type) { fields.push('task_type = ?'); values.push(actionObj.task_type); }
    if (actionObj.status) { fields.push('status = ?'); values.push(actionObj.status); }

    if (fields.length > 0) {
      values.push(currentTaskId);
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  } else if (actionType === 'set_step_status') {
    if (actionObj.step_id && actionObj.status) {
      db.prepare('UPDATE steps SET status = ? WHERE id = ? AND task_id = ?').run(
        actionObj.status,
        actionObj.step_id,
        currentTaskId
      );

      const allSteps = db
        .prepare('SELECT status FROM steps WHERE task_id = ?')
        .all(currentTaskId) as { status: string }[];
      if (allSteps.length > 0) {
        const allCompleted = allSteps.every((s) => s.status === 'completed');
        const anyCompleted = allSteps.some((s) => s.status === 'completed');
        const nextTaskStatus = allCompleted
          ? 'completed'
          : anyCompleted
          ? 'in_progress'
          : 'pending';
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(nextTaskStatus, currentTaskId);
      }
    }
  } else if (actionType === 'add_step') {
    const maxOrder = db
      .prepare('SELECT MAX(order_num) as m FROM steps WHERE task_id = ?')
      .get(currentTaskId) as { m: number | null };
    const nextOrder = (maxOrder?.m || 0) + 1;

    db.prepare(`
      INSERT INTO steps (
        task_id, order_num, title, description, estimated_time,
        tool_suggestion, completion_criteria, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      currentTaskId,
      nextOrder,
      actionObj.title || `步驟 ${nextOrder}`,
      actionObj.description || '',
      actionObj.estimated_time || '',
      actionObj.tool_suggestion || '',
      actionObj.completion_criteria || ''
    );
  } else if (actionType === 'update_step') {
    if (actionObj.step_id) {
      const fields: string[] = [];
      const values: unknown[] = [];
      if (actionObj.title) { fields.push('title = ?'); values.push(actionObj.title); }
      if (actionObj.description !== undefined) { fields.push('description = ?'); values.push(actionObj.description); }
      if (actionObj.estimated_time !== undefined) { fields.push('estimated_time = ?'); values.push(actionObj.estimated_time); }
      if (actionObj.tool_suggestion !== undefined) { fields.push('tool_suggestion = ?'); values.push(actionObj.tool_suggestion); }
      if (actionObj.completion_criteria !== undefined) { fields.push('completion_criteria = ?'); values.push(actionObj.completion_criteria); }
      if (actionObj.status) { fields.push('status = ?'); values.push(actionObj.status); }

      if (fields.length > 0) {
        values.push(actionObj.step_id, currentTaskId);
        db.prepare(`UPDATE steps SET ${fields.join(', ')} WHERE id = ? AND task_id = ?`).run(...values);
      }
    }
  } else if (actionType === 'delete_step') {
    if (actionObj.step_id) {
      db.prepare('DELETE FROM steps WHERE id = ? AND task_id = ?').run(actionObj.step_id, currentTaskId);
    }
  } else if (actionType === 'replan_steps') {
    db.prepare('DELETE FROM steps WHERE task_id = ?').run(currentTaskId);
    db.prepare('DELETE FROM reminders WHERE task_id = ?').run(currentTaskId);

    const stepIds: number[] = [];
    if (Array.isArray(actionObj.steps)) {
      const insertStep = db.prepare(`
        INSERT INTO steps (
          task_id, order_num, title, description, estimated_time,
          tool_suggestion, completion_criteria, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `);
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

  // 1. 取得既有任務狀態
  let currentTask: TaskDetail | null = null;
  if (taskId) {
    currentTask = getTaskDetail(taskId);
    if (!currentTask) {
      throw new Error(`找不到任務 ID ${taskId}`);
    }
  }

  // 2. Crush 機制：Token 消耗與動態閾值檢查 (Adaptive Context Window Threshold)
  if (taskId && currentTask) {
    const cw = getModelContextWindow(cfg.model_name);
    const currentTokens =
      (currentTask.task.prompt_tokens || 0) + (currentTask.task.completion_tokens || 0);
    const remaining = cw - currentTokens;
    const threshold =
      cw > LARGE_CONTEXT_WINDOW_THRESHOLD
        ? LARGE_CONTEXT_WINDOW_BUFFER
        : Math.floor(cw * SMALL_CONTEXT_WINDOW_RATIO);

    // 取得歷史訊息筆數
    const totalMsgs = db
      .prepare('SELECT COUNT(*) as c FROM task_messages WHERE task_id = ?')
      .get(taskId) as { c: number };

    if (remaining <= threshold && totalMsgs.c >= 4) {
      console.log(
        `⚡ [Crush Context] 達到滾動壓縮閾值（剩餘 Token ${remaining} <= 門檻 ${threshold}），自動啟動結構化摘要！`
      );
      try {
        await executeSummarize(taskId);
        // 重新載入任務最新資料
        currentTask = getTaskDetail(taskId);
      } catch (err) {
        console.error('自動摘要失敗，繼續進行對話：', err);
      }
    }
  }

  // 3. Crush 指針切片：若有 SummaryMessageID 則切片並改為 User 角色
  let sessionMessages: TaskMessage[] = [];
  if (taskId) {
    sessionMessages = getSessionMessages(taskId);
  }

  // 4. 組裝 System Prompt 與對話歷程
  const systemPrompt = buildSystemPrompt(currentTask);
  const aiMessages: AiMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const m of sessionMessages) {
    aiMessages.push({
      role: (m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user') as
        | 'system'
        | 'assistant'
        | 'user',
      content: truncateOutput(m.content, 6000),
    });
  }

  // Crush 輸出防護：加入截斷後的本次使用者訊息
  const sanitizedUserText = truncateOutput(messageText, 8000);
  aiMessages.push({ role: 'user', content: sanitizedUserText });

  // 5. 呼叫 AI 模型（附帶 Crush Session Affinity Header）
  const headers = sessionHeaders(taskId || 'new');
  console.log(`💬 發送任務對話請求（task_id: ${taskId || '新建'}，模型: ${cfg.model_name}）`);

  const responseResult = await callOpenAICompatibleWithUsage(cfg, aiMessages, {
    timeoutMs: 90_000,
    headers,
  });

  const rawReply = responseResult.content;

  // 6. 解析 Action 區塊（支援多個 ```action ... ``` 或 ```json ... ``` 區塊）
  let actionsToExecute: any[] = [];
  const actionDataList: string[] = [];

  const actionBlockRegex = /```(?:action|json)\s*([\s\S]*?)\s*```/g;
  let match: RegExpExecArray | null;
  while ((match = actionBlockRegex.exec(rawReply)) !== null) {
    const rawBlock = match[1].trim();
    actionDataList.push(rawBlock);
    try {
      const parsed = JSON.parse(rawBlock);
      if (Array.isArray(parsed)) {
        actionsToExecute.push(...parsed);
      } else if (Array.isArray(parsed.actions)) {
        actionsToExecute.push(...parsed.actions);
      } else {
        actionsToExecute.push(parsed);
      }
    } catch (e) {
      console.warn('解析 action JSON 失敗：', e);
    }
  }

  // 將所有 action / json 區塊從對話回覆文字中徹底移除（含未閉合的尾部區塊）
  let cleanReply = rawReply
    .replace(/```(?:action|json)\s*[\s\S]*?```/g, '')
    .replace(/```(?:action|json)[\s\S]*$/gi, '')
    .trim();

  const actionDataStr = actionDataList.length > 0 ? JSON.stringify(actionsToExecute) : null;

  if (!cleanReply) {
    cleanReply = '好的，我已經為你更新了任務計畫！';
  }

  // 7. 在 SQLite transaction 中執行動作並更新 Token 統計
  let finalTaskId: number | null = taskId || null;

  const runUpdates = db.transaction(() => {
    for (const act of actionsToExecute) {
      finalTaskId = executeAction(act, finalTaskId);
    }

    if (!finalTaskId) {
      const defaultTaskRes = db
        .prepare(`
          INSERT INTO tasks (
            name, goal_description, deadline, available_time,
            task_type, tools, need_line, status, ai_goal, ai_tools
          ) VALUES (?, ?, ?, '每天 1 小時', '學習', '[]', 0, 'pending', ?, '[]')
        `)
        .run(
          sanitizedUserText.slice(0, 20) || '新任務規劃',
          sanitizedUserText,
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

    // Crush 機制：累加或記錄 Token 統計
    const addedPromptTokens =
      responseResult.usage?.prompt_tokens || Math.ceil((systemPrompt.length + messageText.length) / 3.5);
    const addedCompletionTokens =
      responseResult.usage?.completion_tokens || Math.ceil(cleanReply.length / 3.5);

    db.prepare(`
      UPDATE tasks
      SET prompt_tokens = COALESCE(prompt_tokens, 0) + ?,
          completion_tokens = COALESCE(completion_tokens, 0) + ?
      WHERE id = ?
    `).run(addedPromptTokens, addedCompletionTokens, finalTaskId);
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
