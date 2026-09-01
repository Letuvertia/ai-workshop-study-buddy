// db.js — 資料庫初始化（SQLite）
// 第一次執行時會自動建立資料表，不需要手動設定

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/app.db');
const dbDir = path.dirname(dbPath);

// 確保 data/ 資料夾存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// WAL 模式讓讀寫更穩定
db.pragma('journal_mode = WAL');

// 建立資料表（如果還不存在）
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    goal           TEXT    NOT NULL DEFAULT '',
    content        TEXT    NOT NULL DEFAULT '',
    deadline       TEXT,
    available_time TEXT    DEFAULT '',
    tools          TEXT    DEFAULT '',
    steps          TEXT    DEFAULT '[]',
    suggested_tools TEXT   DEFAULT '[]',
    status         TEXT    NOT NULL DEFAULT 'active',
    created_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id             INTEGER NOT NULL,
    remind_at           TEXT    NOT NULL,
    step                TEXT    DEFAULT '',
    message             TEXT    NOT NULL DEFAULT '',
    tools               TEXT    DEFAULT '[]',
    completion_criteria TEXT    DEFAULT '',
    status              TEXT    NOT NULL DEFAULT 'pending',
    sent_at             TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
`);

console.log(`✅ 資料庫已連線：${dbPath}`);

module.exports = db;
