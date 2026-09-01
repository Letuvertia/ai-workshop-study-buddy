import { AIPlan, GeneratePlanRequest } from '../types/index';
import { getAiSettings } from './aiSettings';
import { callOpenAICompatible } from './aiClient';
import { formatLocal } from '../utils/time';

// =============================================
// 建立發給 LLM 的提示詞
// =============================================
function buildPrompt(req: GeneratePlanRequest): string {
  const deadlineDate = new Date(req.deadline);
  const now = new Date();
  const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return `你是一個專業的任務規劃助手。請根據以下任務資訊，產生一份詳細的執行計畫。

【任務資訊】
任務名稱：${req.name}
我想完成什麼：${req.goal_description}
截止時間：${req.deadline}（距今約 ${daysLeft} 天）
目前可用時間：${req.available_time}
任務類型：${req.task_type}
可使用工具：${req.tools.join('、')}
是否需要 LINE 提醒：${req.need_line ? '是' : '否'}

【回覆要求】
請務必以純 JSON 格式回覆，不要有任何說明文字、markdown 語法或程式碼區塊符號。
回覆的 JSON 結構如下：

{
  "goal": "清楚描述這個任務要達成什麼目標（1～2句話）",
  "suggested_tools": ["從使用者提供的工具中挑選最適合的，也可加入建議工具"],
  "steps": [
    {
      "title": "步驟標題（簡短清楚）",
      "description": "這個步驟要做什麼、怎麼做（2～3句話）",
      "estimated_time": "建議花費時間，例如：30分鐘",
      "tool_suggestion": "這個步驟建議使用的工具",
      "completion_criteria": "怎樣算是完成了這個步驟（具體可驗證的標準）"
    }
  ],
  "reminders": [
    {
      "remind_at": "ISO 8601 格式，例如：${getExampleReminderTime()}",
      "step_index": 0,
      "message": "【任務提醒】\\n任務：${req.name}\\n現在要做：（步驟標題）\\n建議工具：（工具）\\n完成標準：（完成標準）\\n\\n你可以回覆：\\n完成 / 延後30分鐘 / 查看下一步"
    }
  ]
}

注意事項：
1. 步驟數量建議 3～7 個，根據任務複雜度決定
2. 提醒時間要合理分散，考慮截止時間和可用時間
3. 每個步驟都要有對應的提醒（如果使用者需要 LINE 提醒）
4. 提醒訊息要具體，包含任務名稱、步驟、工具和完成標準
5. 所有時間格式必須是 ISO 8601（例如：2024-01-15T09:00:00）`;
}

function getExampleReminderTime(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  // 給 LLM 的範例必須是「本地時間」格式（toISOString 是 UTC，會誤導模型產生差 8 小時的提醒）
  return formatLocal(tomorrow);
}

// =============================================
// 呼叫 LLM API 並解析回傳的 JSON
// =============================================
export async function generatePlan(req: GeneratePlanRequest): Promise<AIPlan> {
  const prompt = buildPrompt(req);
  const cfg = getAiSettings();

  try {
    console.log(`📡 呼叫 AI 模型（${cfg.kind}）：${cfg.endpoint}`);
    const rawContent = await callOpenAICompatible(
      cfg,
      [
        {
          role: 'system',
          content: '你是專業的任務規劃助手，只回覆純 JSON，不加任何說明或 markdown。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      60_000
    );
    console.log('📥 LLM 原始回覆：', rawContent.slice(0, 200), '...');

    // 從回覆中擷取 JSON（有些模型會加上 markdown 語法）
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 回覆中找不到有效的 JSON');
    }

    const plan: AIPlan = JSON.parse(jsonMatch[0]);

    // 基本驗證
    if (!plan.goal || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error('LLM 回傳的規劃格式不正確');
    }

    // 確保 reminders 存在
    if (!Array.isArray(plan.reminders)) {
      plan.reminders = [];
    }

    // 確保 suggested_tools 存在
    if (!Array.isArray(plan.suggested_tools)) {
      plan.suggested_tools = req.tools;
    }

    console.log(`✅ AI 規劃完成：${plan.steps.length} 個步驟，${plan.reminders.length} 則提醒`);
    return plan;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (cfg.is_local && /ECONNREFUSED|fetch failed/i.test(msg)) {
      throw new Error(`無法連線到本機 LLM API（${cfg.endpoint}）。\n請確認 Ollama 或 LM Studio 正在執行。`);
    }
    throw error instanceof Error ? error : new Error(msg);
  }
}
