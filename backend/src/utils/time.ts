// =============================================
// time.ts — 時間格式的唯一守門員
//
// 【本專案的時間政策，所有 AI 與人類開發者必須遵守】
// 資料庫（reminders.remind_at、tasks.deadline）一律存「本地時間、無時區資訊」
// 的字串：YYYY-MM-DDTHH:MM 或 YYYY-MM-DDTHH:MM:SS。
//
// 為什麼：使用者（學生）填的、LLM 產生的、前端 datetime-local 給的，全部都是
// 台灣本地時間。只要有任何一處改用 UTC（例如 new Date().toISOString()），
// 比對就會差 8 小時——2026-07-07 修掉的致命 bug 就是排程器拿 UTC 的「現在」
// 去比對本地時間的提醒，導致排程提醒晚 8 小時才觸發。
//
// 規則：
// 1. 任何要跟 remind_at / deadline 比對或寫入的「現在時間」，一律用本檔案的函式。
// 2. 禁止對這些欄位使用 Date.prototype.toISOString()（它一定回傳 UTC）。
// 3. 若未來要支援多時區，必須整體遷移（欄位加時區、全部改存 UTC），不可局部混用。
// =============================================

/** 把 Date 格式化成本地時間字串 YYYY-MM-DDTHH:MM:SS（資料庫統一格式） */
export function formatLocal(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** 本地時間的「現在」，精確到分鐘：YYYY-MM-DD HH:MM（給 SQLite strftime 比對用） */
export function localNowMinute(): string {
  return formatLocal(new Date()).slice(0, 16).replace('T', ' ');
}
