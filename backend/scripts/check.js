#!/usr/bin/env node
// =============================================
// check.js — 數位學伴後端的一鍵驗證（冒煙測試）
//
// 用法：在 backend/ 資料夾執行  npm run check
//
// 【制度規定】任何人（包括 AI 模型）改動 backend 程式後，必須跑這支腳本
// 並看到「✅ 全部通過」才能宣稱完成。詳見 數位學伴/AGENTS.md。
//
// 它做的事（全程用暫存資料庫，不會碰真正的 data/app.db，也不會真的發 LINE）：
//   1. TypeScript 型別檢查（tsc --noEmit）
//   2. 啟動一個測試伺服器（port 3100）→ 檢查 /health
//   3. 模擬 LINE Webhook：正確簽章要回 200、錯誤簽章要回 401
//      （守護 2026-07-07 修掉的「body 被讀兩次、webhook 一律 500」事故）
//   4. 建立一個「提醒時間 = 現在」的任務，等排程器下一次跳動（測試模式每 5 秒跳一次），
//      確認提醒真的被送出（status 變成 sent）
//      （守護 2026-07-07 修掉的「UTC 比對本地時間、提醒晚 8 小時」事故）
//   5. 清掉暫存資料庫
// =============================================
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const TMP_DB = path.join(BACKEND, 'data', 'check-tmp.db');
const SECRET = 'check-secret';

let serverProc = null;
let failed = false;

function ok(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); failed = true; }
function step(msg) { console.log(`\n▶ ${msg}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanup() {
  if (serverProc && !serverProc.killed) serverProc.kill('SIGKILL');
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(TMP_DB + suffix); } catch { /* 不存在就算了 */ }
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(1));

function localNowMinute(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

async function main() {
  // ── 1. 型別檢查 ──────────────────────────────
  step('1/4 TypeScript 型別檢查（tsc --noEmit）');
  if (process.env.CHECK_SKIP_TSC === '1') {
    // 給執行時間受限的環境（如 AI 沙盒，單一指令有秒數上限）分段驗證用：
    // 先自己跑過 tsc --noEmit，再帶這個旗標跑其餘三關。正式驗收一律跑完整版。
    ok('略過（CHECK_SKIP_TSC=1）——請確認已另外跑過 tsc --noEmit');
  } else {
    const tsc = spawnSync(process.execPath, [path.join(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], {
      cwd: BACKEND, encoding: 'utf8',
    });
    if (tsc.status === 0) ok('型別檢查通過');
    else { fail(`型別檢查失敗：\n${(tsc.stdout || '') + (tsc.stderr || '')}`); return; }
  }

  // ── 2. 啟動測試伺服器 ────────────────────────
  step(`2/4 啟動測試伺服器（port ${PORT}、暫存資料庫）`);
  cleanup(); // 清掉上次殘留的暫存 db
  serverProc = spawn(
    process.execPath,
    [path.join(BACKEND, 'node_modules', 'ts-node-dev', 'lib', 'bin.js'), '--transpile-only', 'src/index.ts'],
    {
      cwd: BACKEND,
      env: {
        ...process.env,
        PORT: String(PORT),
        DATABASE_URL: TMP_DB,
        // 空字串會蓋過 .env（dotenv 不覆寫既有環境變數）→ 測試中不真的發 LINE
        LINE_CHANNEL_ACCESS_TOKEN: '',
        LINE_USER_ID: '',
        LINE_CHANNEL_SECRET: SECRET, // 但簽章驗證要真的測
        SCHEDULER_CRON: '*/5 * * * * *', // 測試模式：排程器每 5 秒跳一次，不用等一分鐘
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let serverLog = '';
  serverProc.stdout.on('data', (d) => (serverLog += d));
  serverProc.stderr.on('data', (d) => (serverLog += d));

  let health = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) { health = await r.json(); break; }
    } catch { /* 還沒起來，再等 */ }
  }
  if (health && health.status === 'ok') ok(`伺服器啟動成功（AI 來源：${health.env.ai_source}）`);
  else { fail(`伺服器 30 秒內沒有啟動。伺服器輸出：\n${serverLog.slice(-2000)}`); return; }

  // ── 3. LINE Webhook 簽章與解析 ───────────────
  step('3/4 模擬 LINE Webhook（正確簽章→200、錯誤簽章→401）');
  const eventBody = JSON.stringify({
    events: [{ type: 'message', source: { userId: 'U-check', type: 'user' }, message: { type: 'text', text: '完成' } }],
  });
  const goodSig = crypto.createHmac('SHA256', SECRET).update(eventBody).digest('base64');

  const rGood = await fetch(`${BASE}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-line-signature': goodSig },
    body: eventBody,
  });
  if (rGood.status === 200) ok('正確簽章的 webhook 回 200（body 解析與簽章驗證都正常）');
  else fail(`正確簽章的 webhook 回 ${rGood.status}（預期 200）——回覆功能壞了`);

  const rBad = await fetch(`${BASE}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-line-signature': 'invalid-signature' },
    body: eventBody,
  });
  if (rBad.status === 401) ok('錯誤簽章的 webhook 回 401（不會被假冒）');
  else fail(`錯誤簽章的 webhook 回 ${rBad.status}（預期 401）`);

  // ── 4. 排程器時間邏輯（端到端） ──────────────
  step('4/4 排程器：建立「提醒時間＝現在」的任務，等下一次排程跳動（最多 20 秒）…');
  const createResp = await fetch(`${BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      form_data: {
        name: '排程檢查用任務', goal_description: '驗證排程器', deadline: localNowMinute(60),
        available_time: '10分鐘', task_type: '其他', tools: [], need_line: false,
      },
      plan: {
        goal: '驗證排程器會在正確的本地時間送出提醒',
        suggested_tools: [],
        steps: [{ title: '檢查步驟', description: '自動測試', estimated_time: '1分鐘', tool_suggestion: '無', completion_criteria: '提醒送出' }],
        reminders: [{ remind_at: localNowMinute(0), step_index: 0, message: '排程檢查提醒' }],
      },
    }),
  });
  if (createResp.status !== 201) { fail(`建立測試任務失敗（HTTP ${createResp.status}）`); return; }
  const detail = await createResp.json();
  const taskId = detail.task.id;
  ok(`測試任務已建立（#${taskId}），提醒時間＝現在的這一分鐘`);

  let sent = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const r = await fetch(`${BASE}/api/tasks/${taskId}`);
    const d = await r.json();
    if (d.reminders && d.reminders[0] && d.reminders[0].status === 'sent') { sent = true; break; }
  }
  if (sent) ok('提醒在到期後一分鐘內被送出（本地時間比對正確）');
  else fail('提醒逾時未送出——排程器的時間比對可能又壞了（檢查是否有人把本地時間改回 UTC）');

  // ── 結果 ─────────────────────────────────────
  console.log('');
  if (failed) {
    console.error('❌ 驗證未通過。請修正上面列出的問題後重跑 npm run check。');
  } else {
    console.log('✅ 全部通過。可以宣稱「已完成」了。');
    console.log('   （此測試未涵蓋：真實 LINE 推播、AI 模型呼叫、課表圖片辨識——這三項需人工實測）');
  }
  // 一定要用 process.exit：測試伺服器還是活著的子程序，不主動退出的話腳本會掛住不結束
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  fail(`腳本本身出錯：${e.message}`);
  process.exit(1);
});
