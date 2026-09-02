# AGENTS.md — Digital Study Buddy System Guide

> **Audience**: AI Coding Agents (Claude Desktop Cowork mode, Claude Code, etc.) assisting students.
> **Context**: This system is used by students across **Windows, macOS, and Linux** during the AI Literacy Workshop. Keep modifications minimal, portable, and stable.

---

## 1. System Overview & Architecture

Digital Study Buddy is an AI-assisted task planning system: students input goals or course schedules, and AI generates actionable breakdown steps and reminders.

```
frontend/ (React + Vite, port 5173 / served from backend in single-server mode)
    │ HTTP (/api)
    ▼
backend/ (Express + TypeScript, port 3000)
    ├─ data/app.db            SQLite (better-sqlite3, WAL mode)
    ├─ data/ai-settings.json  Active AI configuration (configured via web UI)
    ├─ services/scheduler     node-cron scanning due reminders every minute
    ├─ services/aiClient      Unified AI gateway (OpenAI-compatible, Ollama, CLIProxyAPI)
    ├─ scripts/cliproxy-mgr   Automatic CLIProxyAPI supervisor (port 8317)
    └─ routes/tasks           Task CRUD, step planning, and reminder endpoints
```

---

## 2. Non-Negotiable System Invariants

1. **Time Policy (Local Time Strings, No Timezones)**:
   - Database columns (`reminders.remind_at`, `tasks.deadline`) strictly store local ISO strings without timezone offsets (`YYYY-MM-DDTHH:MM[:SS]`).
   - Use `backend/src/utils/time.ts` (backend) and `frontend/src/utils/time.ts` (frontend).
   - **Never call `Date.prototype.toISOString()`** on these timestamps (causes UTC 8-hour shift bugs).
2. **Single AI Gateway**:
   - All AI requests must pass through `backend/src/services/aiClient.ts`.
   - Supports local Ollama, cloud API keys, and local CLIProxyAPI (`http://localhost:8317/v1`) for Claude / OpenAI / Google subscriptions.
3. **Cross-Platform Compatibility**:
   - Target machines include Windows (native / WSL2), macOS, and Linux.
   - Do not introduce OS-specific shell commands, hardcoded POSIX/Windows paths, or native dependency upgrades without testing cross-platform implications.

---

## 3. Development & Verification Workflow

1. **Check Status**: Ensure clean working tree with `git status`.
2. **Backend Verification**:
   - After modifying `backend/`, navigate to `backend/` and run:
     ```bash
     npm run check
     ```
   - Must see `✅ 全部通過` (tsc check, test server boot, task API test, scheduler verification).
3. **Frontend Verification**:
   - After modifying `frontend/`, run `npm run build` in `frontend/` to update `frontend/dist/`.
   - The backend serves `frontend/dist` in single-server mode (`http://localhost:3000`).
4. **Commit Standard**:
   - Commit with concise, descriptive messages explaining what was changed and why.
