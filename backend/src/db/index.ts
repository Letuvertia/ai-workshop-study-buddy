import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 確保資料夾存在（預設 ./data/app.db）
const dbPath = path.resolve(process.env.DATABASE_URL || './data/app.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 建立並開啟資料庫
const db = new Database(dbPath);

// 啟用 WAL 模式提升效能
db.pragma('journal_mode = WAL');

// =============================================
// 建立資料表（如果不存在）
// =============================================
db.exec(`
  -- 任務主表
  CREATE TABLE IF NOT EXISTS tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    goal_description TEXT   NOT NULL,
    deadline        TEXT    NOT NULL,
    available_time  TEXT    NOT NULL,
    task_type       TEXT    NOT NULL,
    tools           TEXT    NOT NULL DEFAULT '[]',
    need_line       INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'pending',
    ai_goal         TEXT    NOT NULL DEFAULT '',
    ai_tools        TEXT    NOT NULL DEFAULT '[]',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- 任務步驟
  CREATE TABLE IF NOT EXISTS steps (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id             INTEGER NOT NULL,
    order_num           INTEGER NOT NULL,
    title               TEXT    NOT NULL,
    description         TEXT    NOT NULL DEFAULT '',
    estimated_time      TEXT    NOT NULL DEFAULT '',
    tool_suggestion     TEXT    NOT NULL DEFAULT '',
    completion_criteria TEXT    NOT NULL DEFAULT '',
    status              TEXT    NOT NULL DEFAULT 'pending',
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  -- 提醒表
  CREATE TABLE IF NOT EXISTS reminders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id      INTEGER NOT NULL,
    step_id      INTEGER,
    remind_at    TEXT    NOT NULL,
    message      TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending',
    enabled      INTEGER NOT NULL DEFAULT 1,
    snooze_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE SET NULL
  );

  -- 課表（學生上傳課表圖片，AI 辨識後可修改再存進這裡）
  CREATE TABLE IF NOT EXISTS courses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    day_of_week  TEXT    NOT NULL,
    start_time   TEXT    NOT NULL,
    end_time     TEXT    NOT NULL,
    teacher      TEXT    NOT NULL DEFAULT '',
    location     TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- 任務對話紀錄（每個任務為一個獨立 session）
  CREATE TABLE IF NOT EXISTS task_messages (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id            INTEGER NOT NULL,
    role               TEXT    NOT NULL,
    content            TEXT    NOT NULL,
    action_data        TEXT,
    is_summary_message INTEGER DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
`);

// Crush 架構：Context 滾動壓縮與 Token 追蹤欄位安全遷移
try { db.exec('ALTER TABLE tasks ADD COLUMN summary_message_id INTEGER REFERENCES task_messages(id);'); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN prompt_tokens INTEGER DEFAULT 0;'); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN completion_tokens INTEGER DEFAULT 0;'); } catch {}
try { db.exec('ALTER TABLE task_messages ADD COLUMN is_summary_message INTEGER DEFAULT 0;'); } catch {}

console.log(`✅ 資料庫已連線：${dbPath}`);

export default db;
