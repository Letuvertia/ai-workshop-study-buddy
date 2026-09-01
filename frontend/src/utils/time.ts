// =============================================
// time.ts — 前端時間格式的唯一守門員（政策與 backend/src/utils/time.ts 相同）
//
// 全系統的時間一律是「本地時間、無時區資訊」字串：YYYY-MM-DDTHH:MM[:SS]。
// 【禁止】對這些時間用 Date.prototype.toISOString()——它一定轉成 UTC，
// 在台灣會差 8 小時（顯示早 8 小時、存檔又再早 8 小時，2026-07-07 修掉的 bug 家族）。
//
// datetime-local 輸入框的 value 本來就是本地無時區的 YYYY-MM-DDTHH:MM，
// 跟資料庫格式幾乎一樣——直接用字串，不需要經過 Date 轉換。
// =============================================

/** 解析本地無時區字串成 Date。容忍舊資料的空格分隔（Safari 不吃空格格式）。 */
export function parseLocal(s: string): Date {
  return new Date(s.trim().replace(' ', 'T'));
}

/** 把 Date 格式化成 YYYY-MM-DDTHH:MM:SS（資料庫統一格式） */
export function formatLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** 資料庫字串 → datetime-local 輸入框的 value（YYYY-MM-DDTHH:MM，本地） */
export function toInputValue(s: string): string {
  if (!s) return '';
  return s.trim().replace(' ', 'T').slice(0, 16);
}

/** datetime-local 輸入框的 value → 資料庫格式（補上秒數即可，不經過 Date） */
export function fromInputValue(v: string): string {
  return v.length === 16 ? `${v}:00` : v;
}

/** 顯示用：2026/07/15 19:00 */
export function formatDisplay(s: string): string {
  try {
    const d = parseLocal(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return s;
  }
}
