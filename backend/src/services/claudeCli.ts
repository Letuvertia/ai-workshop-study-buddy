// =============================================
// claudeCli.ts — 訂閱制 Claude（本機 `claude` CLI）服務層
// 移植自 skill-ai-model-settings 的 ai_service_claude_cli.py / vite-plugin-ai.js
//
// 用途：讓「訂閱制 Claude」按鈕吃使用者本機已登入的 Claude Code 訂閱額度，
//       不需要另外申請 API Key。跨平台（macOS／Windows／Linux）尋找 claude 執行檔，
//       並用 stdin 餵入內容（避免命令列長度限制與編碼問題，見 references/design-notes.md 雷 3/5/8）。
// =============================================
import { spawn, execFile } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AiMessage, ClaudeAccountStatus } from '../types/index';

// 雷 4/6：GUI 啟動的程序常常拿不到使用者 shell 的 PATH，
// 所以 PATH 找不到時，再嘗試常見安裝路徑（含 Windows npm 全域安裝、原生安裝器路徑）。
function findClaude(): string {
  const home = os.homedir();
  const appdata = process.env.APPDATA || '';
  const localappdata = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(home, '.npm-global', 'bin', 'claude'),
    appdata ? path.join(appdata, 'npm', 'claude.cmd') : '',
    appdata ? path.join(appdata, 'npm', 'claude.exe') : '',
    localappdata ? path.join(localappdata, 'Programs', 'claude', 'claude.exe') : '',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'claude'; // 交給系統 PATH 做最後嘗試
}

// 雷 6：Windows 的 .cmd/.bat 需透過 cmd.exe 執行才能正確解析
function claudeCommandArgs(claude: string, args: string[]): { cmd: string; args: string[] } {
  if (claude.toLowerCase().endsWith('.cmd') || claude.toLowerCase().endsWith('.bat')) {
    return { cmd: 'cmd', args: ['/c', claude, ...args] };
  }
  return { cmd: claude, args };
}

// ── 底層執行器：spawn claude、餵 stdin、解析輸出（callClaudeCli／圖片辨識共用）──
// 雷 3/5/8：內容全部經 stdin 餵入（命令列只留短旗標）、編碼鎖 UTF-8、
// 在中性暫存目錄執行（避免專案根目錄的 CLAUDE.md／Skill 汙染輸入）。
function runClaudeCli(extraArgs: string[], stdinText: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const claude = findClaude();
    const args = ['-p', '--output-format', 'json', ...extraArgs];
    const { cmd, args: finalArgs } = claudeCommandArgs(claude, args);

    const child = spawn(cmd, finalArgs, { cwd: os.tmpdir() });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`claude CLI 逾時（超過 ${timeout / 1000} 秒）`));
    }, timeout);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`無法執行 claude CLI：${e.message}。請確認已安裝 Claude Code。`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const msg = (err || out || '').trim();
        if (/login|auth|unauthorized|401/i.test(msg)) {
          return reject(new Error('claude CLI 尚未登入。請點選「立即登入 Claude」或在終端機執行 `claude auth login` 後再試。'));
        }
        return reject(new Error(`claude CLI 錯誤：${msg.slice(0, 300) || '未知錯誤'}`));
      }
      let text = out.trim();
      try {
        const data = JSON.parse(out);
        if (data && typeof data === 'object') {
          if (data.is_error) {
            return reject(new Error(`claude 回報錯誤：${String(data.result || '').slice(0, 200)}`));
          }
          text = data.result || '';
        }
      } catch {
        /* 非 JSON，原樣使用 */
      }
      if (!text.trim()) {
        return reject(new Error('claude 回傳空白（可能未登入或輸入過長）。請確認已 `claude auth login`。'));
      }
      resolve(text.trim());
    });
    child.stdin.end(stdinText, 'utf8');
  });
}

function modelArgs(modelName?: string): string[] {
  const mn = (modelName || '').trim().toLowerCase();
  if (mn && !['claude', 'default', 'subscription', 'claude-cli'].includes(mn)) {
    return ['--model', mn];
  }
  return [];
}

// ── 實際產生回應（吃訂閱額度） ─────────────────────────────────────────────
export function callClaudeCli(
  messages: AiMessage[],
  modelName?: string,
  timeout = 180_000
): Promise<string> {
  const sys = messages
    .filter((m) => m.role === 'system')
    .map((m) => (m.content || '').trim())
    .filter(Boolean);
  const usr = messages
    .filter((m) => m.role !== 'system')
    .map((m) => (m.content || '').trim())
    .filter(Boolean);
  const blocks: string[] = [];
  if (sys.length) {
    blocks.push(sys.join('\n\n'));
    blocks.push('────────── 以下為輸入內容 ──────────');
  }
  blocks.push(usr.join('\n\n'));
  return runClaudeCli(modelArgs(modelName), blocks.join('\n\n'), timeout);
}

// ── 圖片辨識（課表上傳用）──────────────────────────────────────────────────
// Claude 本身完全可以看圖，但這裡是「headless、沒有終端機互動」的呼叫方式：
// Claude Code 平時要讀檔案（含圖片）前，會停下來跳出「是否允許使用 Read 工具」的
// 權限詢問；headless 模式沒有人可以按確認，就會卡住直到逾時。
// 解法：把圖片存成暫存檔，在提示詞裡告訴 Claude 檔案路徑，並加上官方提供的
// `--permission-mode bypassPermissions` 旗標，讓它不用等確認就能直接讀檔。
// 因為只讀我們自己剛存的這一張圖，範圍很小，在單人本機使用情境下風險可控。
export async function callClaudeCliVision(
  promptText: string,
  imageBase64: string,
  mimeType: string,
  modelName?: string,
  timeout = 120_000
): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const tmpFile = path.join(os.tmpdir(), `schedule-${crypto.randomUUID()}.${ext}`);
  writeFileSync(tmpFile, Buffer.from(imageBase64, 'base64'));

  const stdinText = `${promptText}\n\n圖片檔案路徑：${tmpFile}\n請讀取這個路徑的圖片檔案，依照上面的指示分析並回覆。`;

  try {
    return await runClaudeCli(['--permission-mode', 'bypassPermissions', ...modelArgs(modelName)], stdinText, timeout);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* 暫存檔案清不掉也無妨，之後系統會自己清 */ }
  }
}

// ── 偵測登入帳號（前端顯示「會用哪個帳號的額度」） ────────────────────────
export function getClaudeAccount(): Promise<ClaudeAccountStatus> {
  return new Promise((resolve) => {
    const claude = findClaude();
    execFile(
      claude,
      ['auth', 'status'],
      { timeout: 8000, encoding: 'utf8', cwd: os.tmpdir() },
      (e, stdout) => {
        if (e && ((e as NodeJS.ErrnoException).code === 'ENOENT' || /not found|ENOENT/i.test(e.message))) {
          return resolve({ ok: false, logged_in: false, message: '找不到 claude CLI，請先安裝 Claude Code。' });
        }
        let data: any = null;
        try {
          data = JSON.parse((stdout || '').trim());
        } catch {
          /* ignore */
        }
        if (data && typeof data === 'object') {
          return resolve({
            ok: true,
            logged_in: !!data.loggedIn,
            email: data.email || '',
            subscription: data.subscriptionType || '',
            path: claude,
          });
        }
        // 有裝、但 status 無法解析（多半是未登入）
        return resolve({ ok: true, logged_in: false, path: claude, message: '已安裝但尚未登入。' });
      }
    );
  });
}

// ── 一鍵登入：依作業系統開終端機跑 `claude auth login`（互動 OAuth） ─────────
export function claudeLogin(): Promise<{ ok: boolean; started: boolean; message: string }> {
  const claude = findClaude();
  try {
    if (process.platform === 'darwin') {
      spawn('osascript', [
        '-e',
        `tell application "Terminal"\nactivate\ndo script "${claude} auth login"\nend tell`,
      ]);
    } else if (process.platform === 'win32') {
      spawn(claude, ['auth', 'login'], { detached: true, shell: true });
    } else {
      spawn('x-terminal-emulator', ['-e', `${claude} auth login`]);
    }
    return Promise.resolve({
      ok: true,
      started: true,
      message: '已開啟登入視窗，完成 Claude 登入後會自動偵測。',
    });
  } catch (e) {
    return Promise.resolve({
      ok: false,
      started: false,
      message: `開啟登入視窗失敗：${e instanceof Error ? e.message : e}。請手動執行：claude auth login`,
    });
  }
}
