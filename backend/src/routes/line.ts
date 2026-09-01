import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { sendLineMessage, getLastReminder } from '../services/lineService';
import { handleLineReply } from '../services/scheduler';

const router = Router();

// =============================================
// POST /webhook
// LINE 傳來的事件（使用者傳訊息給 Bot）
// =============================================
router.post('/', async (req: Request, res: Response) => {
  // 1. 驗證 LINE 簽章（確認這個請求真的來自 LINE）
  //    HMAC 一定要算在「原始 bytes」（index.ts 的 verify 掛勾存進 req.rawBody）上，
  //    不能用 JSON.stringify(req.body) 重組——欄位順序／空白不同就會驗不過。
  const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
  const signature = req.headers['x-line-signature'] as string | undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (channelSecret) {
    if (!signature || !rawBody) {
      console.warn('⚠️  缺少 LINE 簽章或原始 body，拒絕請求');
      return res.status(401).json({ error: '缺少簽章' });
    }
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(rawBody)
      .digest('base64');

    if (hash !== signature) {
      console.warn('⚠️  LINE 簽章驗證失敗');
      return res.status(401).json({ error: '簽章驗證失敗' });
    }
  }

  // 2. 處理事件
  const events = req.body.events || [];

  for (const event of events) {
    try {
      await processEvent(event);
    } catch (err) {
      console.error('處理 LINE 事件時發生錯誤：', err);
    }
  }

  // LINE 要求一定要回 200 OK
  return res.status(200).json({ status: 'ok' });
});

// =============================================
// 處理各種 LINE 事件
// =============================================
async function processEvent(event: LineEvent): Promise<void> {
  const userId = process.env.LINE_USER_ID || '';

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text;
    const sourceUserId = event.source.userId;

    console.log(`📩 收到 LINE 訊息：${text}（來自 ${sourceUserId}）`);

    // 取得這個使用者最後一則提醒
    const lastReminderId = getLastReminder(sourceUserId);

    if (!lastReminderId) {
      // 沒有待處理的提醒
      await sendLineMessage(
        userId || sourceUserId,
        '你好！請到數位學伴網頁建立任務，我會在提醒時間傳送提醒給你。\n\n收到提醒後，你可以回覆：\n完成 / 延後30分鐘 / 查看下一步'
      );
      return;
    }

    // 根據使用者回覆處理
    const reply = await handleLineReply(sourceUserId, text, lastReminderId);
    await sendLineMessage(userId || sourceUserId, reply);

  } else if (event.type === 'follow') {
    // 使用者加入 Bot 為好友
    console.log(`👋 新用戶加入：${event.source.userId}`);
    await sendLineMessage(
      userId || event.source.userId,
      '歡迎使用數位學伴任務規劃系統！\n\n請到網頁建立你的第一個任務，我會在適當的時間提醒你。\n\n收到提醒後，你可以回覆：\n✅ 完成\n⏰ 延後30分鐘\n👀 查看下一步'
    );
  }
}

// LINE 事件的型別定義
interface LineEvent {
  type: string;
  source: { userId: string; type: string };
  message: { type: string; text: string };
}

export default router;
