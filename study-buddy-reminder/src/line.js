// line.js — LINE Messaging API 相關功能

const axios = require('axios');
const crypto = require('crypto');

// ───────────────────────────────────────────
// 傳送 LINE Push Message
// ───────────────────────────────────────────
async function sendLineMessage(userId, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN 未設定，請在 .env 填入');
  }
  if (!userId) {
    throw new Error('LINE_USER_ID 未設定，請在 .env 填入');
  }

  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: userId,
      messages: [{ type: 'text', text }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      timeout: 10000
    }
  );
}

// ───────────────────────────────────────────
// 驗證 LINE Webhook 簽章
// ───────────────────────────────────────────
function verifyLineSignature(body, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true; // 未設定時跳過驗證（開發用）

  const hash = crypto
    .createHmac('SHA256', secret)
    .update(JSON.stringify(body))
    .digest('base64');

  return hash === signature;
}

module.exports = { sendLineMessage, verifyLineSignature };
