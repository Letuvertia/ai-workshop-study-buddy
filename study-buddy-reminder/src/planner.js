// planner.js — 任務規劃主入口
// 根據 USE_LLM 環境變數決定用 LLM 還是固定規則

const { generatePlanFromLLM } = require('./llm');

// ───────────────────────────────────────────
// 主入口：根據設定選擇規劃方式
// ───────────────────────────────────────────
async function generatePlan(formData) {
  const useLLM = process.env.USE_LLM !== 'false'; // 預設 true

  if (useLLM) {
    console.log('🤖 使用 LLM 產生規劃...');
    return await generatePlanFromLLM(formData);
  } else {
    console.log('📏 使用固定規則產生提醒...');
    return generateRulePlan(formData);
  }
}

// ───────────────────────────────────────────
// 固定規則規劃（不需要 LLM）
// USE_LLM=false 時使用
// ───────────────────────────────────────────
function generateRulePlan(formData) {
  const now = new Date();
  const deadline = formData.deadline ? new Date(formData.deadline) : null;
  const count = Math.max(1, parseInt(formData.reminderCount) || 3);
  const toolList = formData.tools ? formData.tools.split(/[,，、]/).map(t => t.trim()).filter(Boolean) : [];
  const reminders = [];

  if (deadline && deadline > now) {
    // 從「現在 + 5 分鐘」到「截止前 30 分鐘」之間，等距產生 count 則提醒
    const start = new Date(now.getTime() + 5 * 60 * 1000);
    const end   = new Date(deadline.getTime() - 30 * 60 * 1000);

    if (end > start) {
      const totalMs = end.getTime() - start.getTime();
      const stepMs  = count <= 1 ? 0 : totalMs / (count - 1);

      for (let i = 0; i < count; i++) {
        const t = new Date(start.getTime() + stepMs * i);
        const isLast  = i === count - 1;
        const pct     = Math.round((i / Math.max(count - 1, 1)) * 100);
        const stepLabel = isLast ? '最終確認與提交'
          : pct < 33 ? '開始執行'
          : pct < 66 ? '持續推進'
          : '衝刺完成';

        reminders.push({
          remindAt: t.toISOString(),
          step: stepLabel,
          message: isLast
            ? `任務「${formData.taskName}」即將截止！請做最後確認。`
            : `任務「${formData.taskName}」進行中（第 ${i + 1}/${count} 則提醒）。`,
          tools: toolList,
          completionCriteria: isLast ? '完成並提交' : '確認目前進度並繼續'
        });
      }
    } else {
      // 截止時間太近，全部擠在截止前
      for (let i = 0; i < count; i++) {
        const t = new Date(deadline.getTime() - (count - i) * 10 * 60 * 1000);
        reminders.push({
          remindAt: t.toISOString(),
          step: '完成衝刺',
          message: `任務「${formData.taskName}」第 ${i + 1}/${count} 則提醒`,
          tools: toolList,
          completionCriteria: '完成任務'
        });
      }
    }
  } else {
    // 沒有截止時間：從現在起每隔 1 天建立 count 則測試提醒
    for (let i = 0; i < count; i++) {
      const t = new Date(now.getTime() + (i === 0 ? 5 : i * 24 * 60) * 60 * 1000);
      reminders.push({
        remindAt: t.toISOString(),
        step: i === 0 ? '開始執行' : `第 ${i + 1} 次練習`,
        message: i === 0
          ? `這是「${formData.taskName}」的第 1 則提醒，開始執行吧！`
          : `「${formData.taskName}」第 ${i + 1}/${count} 次提醒`,
        tools: toolList,
        completionCriteria: '完成當次練習'
      });
    }
  }

  return {
    taskTitle: formData.taskName,
    goal: formData.taskContent
      ? `完成：${formData.taskContent}`
      : `完成任務：${formData.taskName}`,
    suggestedTools: formData.tools
      ? formData.tools.split(/[,，、]/).map(t => t.trim()).filter(Boolean)
      : [],
    steps: [
      {
        title: '執行任務',
        description: formData.taskContent || formData.taskName,
        estimatedMinutes: 60,
        completionCriteria: '完成任務目標'
      }
    ],
    reminders
  };
}

module.exports = { generatePlan };
