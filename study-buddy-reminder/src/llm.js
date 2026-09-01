// llm.js — 呼叫本機 LLM API 產生任務規劃
// 支援 Ollama (/api/chat) 和 OpenAI 相容格式 (/v1/chat/completions)

const axios = require('axios');

// ───────────────────────────────────────────
// 根據 URL 格式自動選擇呼叫方式
// ───────────────────────────────────────────
async function callLLM(userMessage) {
  const url = process.env.LOCAL_LLM_API_URL || 'http://localhost:11434/api/chat';
  const model = process.env.LOCAL_LLM_MODEL || 'llama3';

  const isOllamaFormat = url.includes('/api/chat') || url.includes('/api/generate');

  let responseText = '';

  if (isOllamaFormat) {
    // Ollama 格式
    const res = await axios.post(url, {
      model,
      messages: [{ role: 'user', content: userMessage }],
      stream: false
    }, { timeout: 120000 });

    responseText = res.data.message?.content || res.data.response || '';
  } else {
    // OpenAI 相容格式（LM Studio 等）
    const res = await axios.post(url, {
      model,
      messages: [
        { role: 'system', content: '你是任務規劃助手，只回傳純 JSON，不加說明文字。' },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7
    }, { timeout: 120000 });

    responseText = res.data.choices?.[0]?.message?.content || '';
  }

  return responseText;
}

// ───────────────────────────────────────────
// 組成提示詞並呼叫 LLM
// ───────────────────────────────────────────
async function generatePlanFromLLM(formData) {
  const deadline = formData.deadline ? new Date(formData.deadline) : null;
  const now = new Date();
  const daysLeft = deadline
    ? Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))
    : null;

  // 產生一個「明天早上 9 點」的範例時間，給 LLM 參考格式
  const exampleDate = new Date();
  exampleDate.setDate(exampleDate.getDate() + 1);
  exampleDate.setHours(9, 0, 0, 0);
  const exampleIso = exampleDate.toISOString().replace('Z', '+08:00').slice(0, 22) + ':00';

  const prompt = `你是任務規劃助手。請根據以下任務資訊，產生詳細的執行計畫。

【任務資訊】
任務名稱：${formData.taskName}
任務類型：${formData.taskType || '未指定'}
任務內容：${formData.taskContent || '（未填寫）'}
截止時間：${formData.deadline || '未設定'}${daysLeft !== null ? `（距今 ${daysLeft} 天）` : ''}
目前可用時間：${formData.availableTime || '未指定'}
可使用工具：${formData.tools || '未指定'}
希望提醒幾次：${formData.reminderCount || 3} 次

【回覆規則】
只回傳 JSON，不要加任何說明、markdown、或程式碼符號。

【JSON 格式】
{
  "taskTitle": "${formData.taskName}",
  "goal": "這個任務要達成什麼（1～2句話）",
  "suggestedTools": ["工具1", "工具2"],
  "steps": [
    {
      "title": "步驟名稱",
      "description": "這個步驟要做什麼（具體說明）",
      "estimatedMinutes": 30,
      "completionCriteria": "怎樣算完成這個步驟",
      "toolUsageGuide": "具體說明怎麼用工具，例如：用 Perplexity 搜尋「課程主題 + 英文名稱」，找 3～5 篇參考資料；建議關鍵字使用中英對照，例如『強化學習 Reinforcement Learning』"
    }
  ],
  "reminders": [
    {
      "remindAt": "${exampleIso}",
      "step": "目前要做的步驟名稱",
      "message": "這則提醒的說明文字（具體告訴我現在要做什麼、從哪裡開始）",
      "tools": ["建議工具"],
      "completionCriteria": "這個階段的完成標準"
    }
  ]
}

【提醒數量 — 這是最重要的硬性規定】
你必須在 reminders 陣列中產生「恰好 ${formData.reminderCount || 3}」則提醒。
數量必須完全符合，不能多也不能少。
如果是語言學習、每日閱讀等持續性習慣，請把這 ${formData.reminderCount || 3} 則提醒
均勻分散在整個學習週期（從今天到截止日之間），每次間隔大致相等，
讓使用者建立規律習慣，而不是集中在截止前才提醒。

【注意事項】
- remindAt 必須是 ISO 8601 格式（例如：${exampleIso}）
- toolUsageGuide 必填，要具體說明怎麼操作工具（不能只寫「使用 X 工具」），包含建議的搜尋關鍵字、操作步驟、注意事項
- 所有文字請使用繁體中文

【提醒時間設定原則 — 請嚴格遵守】
根據「目前可用時間」把提醒安排在使用者真正有空的時段：
- 提到「早上」→ 設在 07:00–09:00
- 提到「下午」→ 設在 13:00–15:00
- 提到「晚上」→ 設在 19:00–21:00
- 提到「每天學習」→ 提醒應每天或每幾天出現一次，均勻分佈
- 提到「每週」→ 分散在不同天，不同一天密集
- 無特別時段 → 預設 09:00 或 20:00
- 絕對不要設在深夜（23:00 以後）或清晨（06:00 以前）`;

  console.log('📡 呼叫 LLM API...');
  const raw = await callLLM(prompt);
  console.log('📥 LLM 回覆（前 300 字）：', raw.slice(0, 300));

  // 從回覆中擷取 JSON（以防 LLM 加了多餘文字）
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('LLM 沒有回傳有效的 JSON。請確認模型是否正在執行，或嘗試換一個模型。');
  }

  const plan = JSON.parse(match[0]);

  // 基本驗證
  if (!plan.goal) plan.goal = `完成：${formData.taskContent || formData.taskName}`;
  if (!Array.isArray(plan.steps)) plan.steps = [];
  if (!Array.isArray(plan.reminders)) plan.reminders = [];
  if (!Array.isArray(plan.suggestedTools)) plan.suggestedTools = [];

  return plan;
}

// ─────────────────────────────────────────────────────────
// 通用多輪對話呼叫（支援 Ollama 和 OpenAI 相容格式）
// messages: [{role: 'system'|'user'|'assistant', content: '...'}]
// ─────────────────────────────────────────────────────────
async function callLLMChat(messages) {
  const url   = process.env.LOCAL_LLM_API_URL || 'http://localhost:11434/api/chat';
  const model = process.env.LOCAL_LLM_MODEL   || 'llama3';
  const isOllama = url.includes('/api/chat') || url.includes('/api/generate');

  if (isOllama) {
    const res = await axios.post(url, { model, messages, stream: false }, { timeout: 60000 });
    return res.data.message?.content || '';
  } else {
    const res = await axios.post(url, { model, messages, temperature: 0.8 }, { timeout: 60000 });
    return res.data.choices?.[0]?.message?.content || '';
  }
}

// ─────────────────────────────────────────────────────────
// 學伴聊天：根據對話歷史回覆一則訊息
// messages: [{role:'user'|'assistant', content:'...'}]
// ─────────────────────────────────────────────────────────
const CHAT_SYSTEM = `你是「數位學伴」，一位親切、有洞察力的個人學習助理。
你的目標是透過自然對話，幫使用者釐清他們想完成的任務或學習目標。
請循序了解：
1. 他們想學什麼或完成什麼（越具體越好）
2. 為什麼想做這件事（了解動機）
3. 截止時間（如果有的話）
4. 目前每天/每週可以投入多少時間、偏好什麼時段
5. 習慣用哪些工具

規則：
- 一次只問一個問題，不要長篇大論
- 每次回覆 2-3 句話即可
- 語氣友善、輕鬆，像在和朋友聊天
- 累積足夠資訊（通常 3-5 輪）後，主動說：「我覺得我已經了解你的需求了！請按下方的「產生任務規劃」按鈕，我來幫你安排。」
- 所有回覆請使用繁體中文`;

async function generateChatReply(messages) {
  const fullMessages = [
    { role: 'system', content: CHAT_SYSTEM },
    ...messages
  ];
  return await callLLMChat(fullMessages);
}

// ─────────────────────────────────────────────────────────
// 從對話歷史萃取任務資訊並產生完整規劃
// ─────────────────────────────────────────────────────────
async function generatePlanFromChat(messages) {
  const conversationText = messages
    .map(m => `${m.role === 'user' ? '使用者' : '學伴'}：${m.content}`)
    .join('\n');

  // Step 1：萃取結構化表單資料
  const extractPrompt = `根據以下對話記錄，提取使用者的任務資訊。只回傳純 JSON，不加說明。

對話記錄：
${conversationText}

回傳格式：
{
  "taskName": "任務名稱",
  "taskContent": "詳細描述",
  "taskType": "學習/研究/寫作/程式/其他",
  "deadline": "YYYY-MM-DDTHH:MM 格式，若無截止時間則為 null",
  "availableTime": "可用時間描述",
  "tools": "提到的工具，逗號分隔",
  "reminderCount": 3
}`;

  const raw = await callLLM(extractPrompt);
  const match = raw.match(/\{[\s\S]*?\}/);

  let formData;
  try {
    formData = match ? JSON.parse(match[0]) : {};
  } catch {
    formData = {};
  }

  // 補預設值
  formData.taskName      = formData.taskName      || '從對話產生的任務';
  formData.taskContent   = formData.taskContent   || conversationText.slice(0, 300);
  formData.taskType      = formData.taskType      || '其他';
  formData.reminderCount = formData.reminderCount || 3;
  formData.needLine      = false;

  // Step 2：用相同的規劃函式產生完整計畫
  const plan = await generatePlanFromLLM(formData);

  return { formData, plan };
}

module.exports = { generatePlanFromLLM, generateChatReply, generatePlanFromChat };
