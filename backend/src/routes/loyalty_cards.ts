import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(`SELECT lc.*, c.name as client_name, c.phone as client_phone FROM loyalty_cards lc LEFT JOIN clients c ON lc.client_id = c.id ORDER BY lc.created_at DESC`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { card_number, client_id, discount_percentage, start_date, end_date, is_active, notes } = req.body;
    if (!card_number) return res.status(400).json({ error: 'رقم البطاقة مطلوب' });
    if (discount_percentage == null || discount_percentage < 0 || discount_percentage > 100) return res.status(400).json({ error: 'نسبة الخصم يجب أن تكون بين 0 و 100' });
    const exists = await queryOne('SELECT id FROM loyalty_cards WHERE card_number = ?', [card_number]);
    if (exists) return res.status(400).json({ error: 'رقم البطاقة مستخدم مسبقاً' });
    const result = await execute(`INSERT INTO loyalty_cards (card_number, client_id, discount_percentage, start_date, end_date, is_active, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [card_number, client_id || null, discount_percentage, start_date || null, end_date || null, is_active === false ? 0 : 1, notes || null, req.user!.id]);
    void logActivityAsync(req.user!.id, 'create_loyalty_card', 'loyalty_card', result.id as number);
    res.json({ message: 'تم إنشاء البطاقة', id: result.id });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authorize('admin', 'manager', 'accountant'), async (req: AuthRequest, res: Response) => {
  try {
    const { card_number, client_id, discount_percentage, start_date, end_date, is_active, notes } = req.body;
    await execute(`UPDATE loyalty_cards SET card_number = COALESCE(?, card_number), client_id = ?, discount_percentage = COALESCE(?, discount_percentage), start_date = ?, end_date = ?, is_active = COALESCE(?, is_active), notes = ? WHERE id = ?`,
      [card_number, client_id || null, discount_percentage, start_date || null, end_date || null, is_active, notes || null, req.params.id]);
    res.json({ message: 'تم التحديث' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await execute('DELETE FROM loyalty_cards WHERE id = ?', [req.params.id]);
    res.json({ message: 'تم الحذف' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.get('/lookup/:cardNumber', async (req: AuthRequest, res: Response) => {
  try {
    const card = await queryOne(`SELECT lc.*, c.name as client_name FROM loyalty_cards lc LEFT JOIN clients c ON lc.client_id = c.id WHERE lc.card_number = ?`, [req.params.cardNumber]) as any;
    if (!card) return res.status(404).json({ error: 'بطاقة الولاء غير موجودة' });
    const today = new Date().toISOString().split('T')[0];
    if (!card.is_active) return res.status(400).json({ error: 'البطاقة غير مفعلة' });
    if (card.start_date && card.start_date > today) return res.status(400).json({ error: 'البطاقة لم تبدأ بعد' });
    if (card.end_date && card.end_date < today) return res.status(400).json({ error: 'البطاقة منتهية الصلاحية' });
    res.json(card);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
