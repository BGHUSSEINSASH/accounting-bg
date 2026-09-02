import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

const DEFAULT_WORK_START = '09:00';
const DEFAULT_WORK_END = '17:00';

function isValidTime(time: string): boolean {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

async function getWorkHours() {
  const rows = await query("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('work_start_time','work_end_time')") as { setting_key: string; setting_value: string }[];
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.setting_key] = r.setting_value; });
  return { work_start_time: map.work_start_time || DEFAULT_WORK_START, work_end_time: map.work_end_time || DEFAULT_WORK_END };
}

async function isHR(user: AuthRequest['user']): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  const u = await queryOne('SELECT department FROM users WHERE id = ?', [user.id]) as { department: string } | undefined;
  if (!u?.department) return false;
  const dept = u.department.toLowerCase();
  return dept.includes('hr') || dept.includes('موارد') || dept.includes('بشرية') || dept.includes('human');
}

async function notifyAdmins(title: string, message: string, type: string = 'info', referenceType?: string, referenceId?: number): Promise<void> {
  const admins = await query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1") as { id: number }[];
  for (const a of admins) {
    await execute("INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)",
      [a.id, title, message, type, referenceType || null, referenceId || null]);
  }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const current = await getWorkHours();
    let requests: any[];
    if (req.user?.role === 'admin') {
      requests = await query(`SELECT whr.*, u.full_name as requester_name, rv.full_name as reviewer_name FROM work_hours_requests whr LEFT JOIN users u ON u.id = whr.requested_by LEFT JOIN users rv ON rv.id = whr.reviewed_by ORDER BY whr.created_at DESC LIMIT 200`);
    } else {
      requests = await query(`SELECT whr.*, u.full_name as requester_name, rv.full_name as reviewer_name FROM work_hours_requests whr LEFT JOIN users u ON u.id = whr.requested_by LEFT JOIN users rv ON rv.id = whr.reviewed_by WHERE whr.requested_by = ? ORDER BY whr.created_at DESC`, [req.user!.id]);
    }
    const hrUser = await isHR(req.user);
    res.json({ current, requests, can_request: hrUser, can_approve: req.user?.role === 'admin' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/requests', async (req: AuthRequest, res: Response) => {
  try {
    const hrUser = await isHR(req.user);
    if (!hrUser) { res.status(403).json({ error: 'فقط الموارد البشرية يمكنهم تقديم طلب تغيير ساعات العمل' }); return; }
    const { new_start, new_end, reason } = req.body;
    if (!new_start || !new_end) { res.status(400).json({ error: 'يجب تحديد وقت البداية والنهاية' }); return; }
    if (!isValidTime(new_start) || !isValidTime(new_end)) { res.status(400).json({ error: 'صيغة الوقت غير صحيحة يجب أن تكون HH:MM' }); return; }
    if (new_start >= new_end) { res.status(400).json({ error: 'وقت البداية يجب أن يكون قبل وقت النهاية' }); return; }
    const current = await getWorkHours();
    const pending = await queryOne("SELECT id FROM work_hours_requests WHERE requested_by = ? AND status = 'pending'", [req.user!.id]);
    if (pending) { res.status(409).json({ error: 'يوجد طلب لديك معلق بانتظار الموافقة' }); return; }
    const result = await execute(`INSERT INTO work_hours_requests (requested_by, current_start, current_end, new_start, new_end, reason) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user!.id, current.work_start_time, current.work_end_time, new_start, new_end, reason || null]);
    void logActivityAsync(req.user!.id, 'create_work_hours_request', 'work_hours_requests', result.id as number);
    await notifyAdmins('طلب تغيير ساعات العمل', `طلب الموارد البشرية تغيير ساعات العمل إلى ${new_start} - ${new_end}`, 'warning', 'work_hours_request', result.id as number);
    res.status(201).json({ id: result.id, message: 'تم تقديم الطلب بانتظار موافقة المدير' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/requests/:id/approve', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const request = await queryOne("SELECT * FROM work_hours_requests WHERE id = ?", [req.params.id]) as any;
    if (!request) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    if (request.status !== 'pending') { res.status(400).json({ error: 'هذا الطلب معالج مسبقاً' }); return; }
    await withTransaction(async (client) => {
      await client.query("UPDATE work_hours_requests SET status = 'approved', reviewed_by = $1, review_note = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3",
        [req.user!.id, req.body?.note || null, req.params.id]);
      await client.query("INSERT INTO settings (setting_key, setting_value) VALUES ('work_start_time', $1) ON CONFLICT(setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP", [request.new_start]);
      await client.query("INSERT INTO settings (setting_key, setting_value) VALUES ('work_end_time', $1) ON CONFLICT(setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP", [request.new_end]);
    });
    void logActivityAsync(req.user!.id, 'approve_work_hours_request', 'work_hours_requests', Number(req.params.id));
    await execute("INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES (?, ?, ?, 'success', 'work_hours_request', ?)",
      [request.requested_by, 'تم اعتماد ساعات العمل', `تمت الموافقة على طلبك وتحديث ساعات العمل ${request.new_start} - ${request.new_end}`, Number(req.params.id)]);
    res.json({ message: 'تم اعتماد الطلب وتحديث ساعات العمل الرسمية' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/requests/:id/reject', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const request = await queryOne("SELECT * FROM work_hours_requests WHERE id = ?", [req.params.id]) as any;
    if (!request) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    if (request.status !== 'pending') { res.status(400).json({ error: 'هذا الطلب معالج مسبقاً' }); return; }
    await execute("UPDATE work_hours_requests SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [req.user!.id, req.body?.note || null, req.params.id]);
    void logActivityAsync(req.user!.id, 'reject_work_hours_request', 'work_hours_requests', Number(req.params.id));
    await execute("INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES (?, ?, ?, 'error', 'work_hours_request', ?)",
      [request.requested_by, 'تم رفض طلب ساعات العمل', 'للأسف تم رفض طلبك لتغيير ساعات العمل' + (req.body?.note ? ' - السبب: ' + req.body.note : ''), Number(req.params.id)]);
    res.json({ message: 'تم رفض الطلب' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/requests/:id', async (req: AuthRequest, res: Response) => {
  try {
    const request = await queryOne("SELECT * FROM work_hours_requests WHERE id = ?", [req.params.id]) as any;
    if (!request) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    if (request.status !== 'pending') { res.status(400).json({ error: 'لا يمكن حذف طلب معالج' }); return; }
    if (req.user?.role !== 'admin' && request.requested_by !== req.user?.id) { res.status(403).json({ error: 'لا صلاحية لحذف هذا الطلب' }); return; }
    await execute("DELETE FROM work_hours_requests WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, 'cancel_work_hours_request', 'work_hours_requests', Number(req.params.id));
    res.json({ message: 'تم حذف الطلب' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
