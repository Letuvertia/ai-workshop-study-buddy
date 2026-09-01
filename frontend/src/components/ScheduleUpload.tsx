import { useEffect, useState } from 'react';
import { getCourses, recognizeSchedule, saveCourses, deleteCourse } from '../api/schedule.js';
import { RecognizedCourse, Weekday } from '../types/index.js';

const WEEKDAYS: Weekday[] = ['一', '二', '三', '四', '五', '六', '日'];

// 編輯中的一列課程，可能是已存的（有 id）或剛辨識出來、還沒存的（無 id）
type EditableCourse = RecognizedCourse & { id?: number };

export default function ScheduleUpload() {
  const [courses, setCourses] = useState<EditableCourse[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    getCourses()
      .then((list) => { setCourses(list); setSavedOnce(list.length > 0); })
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setError('');
    if (f) setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleRecognize() {
    if (!file) return;
    setRecognizing(true);
    setError('');
    try {
      const result = await recognizeSchedule(file);
      // 辨識結果附加在既有課程清單後面，讓使用者比對、刪掉重複的
      setCourses((prev) => [...prev, ...result]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '辨識失敗');
    } finally {
      setRecognizing(false);
    }
  }

  function updateRow(index: number, field: keyof EditableCourse, value: string) {
    setCourses((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addRow() {
    setCourses((prev) => [...prev, { name: '', day_of_week: '一', start_time: '', end_time: '', teacher: '', location: '' }]);
  }

  async function removeRow(index: number) {
    const row = courses[index];
    setCourses((prev) => prev.filter((_, i) => i !== index));
    if (row.id) {
      try { await deleteCourse(row.id); } catch { /* 忽略，之後儲存時仍會用整批覆蓋修正 */ }
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const cleaned = courses.filter((c) => c.name && c.day_of_week && c.start_time && c.end_time);
      const saved = await saveCourses(cleaned);
      setCourses(saved);
      setSavedOnce(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="section-title">📅 我的課表</h2>

      <div className="card">
        <p className="hint" style={{ marginBottom: '0.75rem' }}>
          上傳課表截圖或照片，AI 會自動辨識課程名稱、星期、時間。辨識結果可以直接在下方表格修改，確認沒問題後按「儲存課表」。
        </p>
        <div className="field-row" style={{ flexWrap: 'wrap' }}>
          <input type="file" accept="image/*" onChange={handleFileChange} />
          <button type="button" className="btn-primary" disabled={!file || recognizing} onClick={handleRecognize}>
            {recognizing ? '⏳ 辨識中，請稍候...' : '🔍 開始辨識'}
          </button>
        </div>
        {previewUrl && (
          <img src={previewUrl} alt="課表預覽" style={{ maxWidth: '260px', marginTop: '0.75rem', borderRadius: 8, border: '1px solid var(--border)' }} />
        )}
        {error && <p style={{ color: 'var(--danger)', marginTop: '0.75rem' }}>❌ {error}</p>}
      </div>

      <div className="card">
        <div className="field-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <strong>課程清單（{courses.length} 筆）</strong>
          <button type="button" className="btn-secondary" onClick={addRow}>＋ 手動新增一列</button>
        </div>

        {courses.length === 0 ? (
          <p className="hint">還沒有任何課程，上傳課表圖片辨識，或按「手動新增一列」自己輸入。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>課程名稱</th>
                  <th>星期</th>
                  <th>開始</th>
                  <th>結束</th>
                  <th>教師</th>
                  <th>教室</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c, i) => (
                  <tr key={c.id ?? `new-${i}`}>
                    <td><input value={c.name} onChange={(e) => updateRow(i, 'name', e.target.value)} /></td>
                    <td>
                      <select value={c.day_of_week} onChange={(e) => updateRow(i, 'day_of_week', e.target.value)}>
                        {WEEKDAYS.map((d) => <option key={d} value={d}>星期{d}</option>)}
                      </select>
                    </td>
                    <td><input type="time" value={c.start_time} onChange={(e) => updateRow(i, 'start_time', e.target.value)} /></td>
                    <td><input type="time" value={c.end_time} onChange={(e) => updateRow(i, 'end_time', e.target.value)} /></td>
                    <td><input value={c.teacher} onChange={(e) => updateRow(i, 'teacher', e.target.value)} /></td>
                    <td><input value={c.location} onChange={(e) => updateRow(i, 'location', e.target.value)} /></td>
                    <td><button type="button" className="btn-icon" onClick={() => removeRow(i)} title="刪除">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} disabled={saving} onClick={handleSave}>
          {saving ? '儲存中...' : savedOnce ? '💾 更新課表' : '💾 儲存課表'}
        </button>
        <p className="hint" style={{ marginTop: '0.5rem' }}>
          儲存後，建立任務時可以直接從課表選課程，自動帶入任務名稱（也可以不選，不影響其他用途的任務）。
        </p>
      </div>
    </div>
  );
}
