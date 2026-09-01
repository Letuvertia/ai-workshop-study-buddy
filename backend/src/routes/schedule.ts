// =============================================
// routes/schedule.ts — 課表上傳、AI 辨識、課程清單 CRUD
// =============================================
import { Router, Request, Response } from 'express';
import db from '../db/index';
import { recognizeSchedule } from '../services/schedule';
import type { RecognizedCourse } from '../types/index';

const router = Router();

// POST /api/schedule/recognize
// body: { image_base64, mime_type } → 呼叫 AI 視覺模型辨識，回傳課程清單（尚未存進資料庫）
router.post('/recognize', async (req: Request, res: Response) => {
  try {
    const { image_base64, mime_type } = req.body as { image_base64?: string; mime_type?: string };
    if (!image_base64) {
      return res.status(400).json({ error: '缺少圖片內容（image_base64）' });
    }
    const courses = await recognizeSchedule(image_base64, mime_type || 'image/jpeg');
    return res.json({ courses });
  } catch (error) {
    console.error('課表辨識失敗：', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : '未知錯誤' });
  }
});

// GET /api/schedule/courses — 取得目前已儲存的課程清單
router.get('/courses', (_req: Request, res: Response) => {
  const courses = db.prepare('SELECT * FROM courses ORDER BY day_of_week ASC, start_time ASC').all();
  return res.json({ courses });
});

// POST /api/schedule/courses
// body: { courses: RecognizedCourse[] } → 使用者確認/修改後整批儲存（取代舊課表）
router.post('/courses', (req: Request, res: Response) => {
  const { courses } = req.body as { courses?: RecognizedCourse[] };
  if (!Array.isArray(courses)) {
    return res.status(400).json({ error: '缺少 courses 陣列' });
  }

  const replaceAll = db.transaction((list: RecognizedCourse[]) => {
    db.prepare('DELETE FROM courses').run();
    const insert = db.prepare(`
      INSERT INTO courses (name, day_of_week, start_time, end_time, teacher, location)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const c of list) {
      if (!c.name || !c.day_of_week || !c.start_time || !c.end_time) continue;
      insert.run(c.name, c.day_of_week, c.start_time, c.end_time, c.teacher || '', c.location || '');
    }
  });

  try {
    replaceAll(courses);
    const saved = db.prepare('SELECT * FROM courses ORDER BY day_of_week ASC, start_time ASC').all();
    return res.json({ ok: true, courses: saved });
  } catch (error) {
    console.error('儲存課表失敗：', error);
    return res.status(500).json({ error: '儲存課表時發生錯誤' });
  }
});

// DELETE /api/schedule/courses/:id — 刪除單一課程
router.delete('/courses/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '無效的課程 ID' });
  db.prepare('DELETE FROM courses WHERE id = ?').run(id);
  return res.json({ success: true });
});

export default router;
