import { Router, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.post('/check', async (req: AuthRequest, res: Response) => {
  try {
    const notifications: { user_id: number | null; title: string; message: string; type: string }[] = [];
    const adminUsers = await query("SELECT id FROM users WHERE role IN ('admin','manager')") as any[];
    const notifyUsers = adminUsers.map(u => u.id);
    if (req.user?.id && !notifyUsers.includes(req.user.id)) notifyUsers.push(req.user.id);

    const lowStockItems = await query("SELECT i.id, i.name, i.current_quantity, i.min_quantity FROM items i WHERE i.min_quantity IS NOT NULL AND i.current_quantity <= i.min_quantity") as any[];
    for (const item of lowStockItems) {
      const msg = `تنبيه مخزون منخفض: ${item.name} - المتاح: ${item.current_quantity} (الحد الأدنى: ${item.min_quantity})`;
      for (const uid of notifyUsers) {
        const existing = await queryOne("SELECT id FROM notifications WHERE user_id = ? AND title = ? AND message = ? AND is_read = 0", [uid, 'تنبيه مخزون منخفض', msg]);
        if (!existing) {
          await execute("INSERT INTO notifications (user_id, title, message, type, reference_type) VALUES (?, ?, ?, 'warning', 'item')", [uid, 'تنبيه مخزون منخفض', msg]);
          notifications.push({ user_id: uid, title: 'تنبيه مخزون منخفض', message: msg, type: 'warning' });
        }
      }
    }

    const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const expiringItems = await query(`SELECT i.id, i.name, i.expiry_date FROM items i WHERE i.expiry_date IS NOT NULL AND i.expiry_date BETWEEN $1 AND $2 AND i.current_quantity > 0`, [today, thirtyDaysLater]) as any[];
    for (const item of expiringItems) {
      const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const msg = `صلاحية منتج تنتهي قريباً: ${item.name} - تنتهي في ${item.expiry_date} (متبقي ${daysLeft} يوم)`;
      for (const uid of notifyUsers) {
        const existing = await queryOne("SELECT id FROM notifications WHERE user_id = ? AND title = ? AND message = ? AND is_read = 0", [uid, 'تنبيه صلاحية', msg]);
        if (!existing) {
          await execute("INSERT INTO notifications (user_id, title, message, type, reference_type) VALUES (?, ?, ?, 'warning', 'item')", [uid, 'تنبيه صلاحية', msg]);
          notifications.push({ user_id: uid, title: 'تنبيه صلاحية', message: msg, type: 'warning' });
        }
      }
    }

    const overdueInvoices = await query(`SELECT si.id, si.invoice_number, c.name AS client_name, si.total, si.payment_status, si.remaining_amount FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id WHERE si.payment_status IN ('partial','unpaid') AND si.invoice_date < NOW() - INTERVAL '30 days'`) as any[];
    for (const inv of overdueInvoices) {
      const remaining = inv.remaining_amount ?? inv.total;
      if (remaining <= 0) continue;
      const msg = `فاتورة متأخرة: ${inv.invoice_number} - ${inv.client_name} - المتبقي: ${remaining}`;
      for (const uid of notifyUsers) {
        const existing = await queryOne("SELECT id FROM notifications WHERE user_id = ? AND title = ? AND message = ? AND is_read = 0", [uid, 'فاتورة متأخرة', msg]);
        if (!existing) {
          await execute("INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES (?, ?, ?, 'error', 'sales_invoice', ?)", [uid, 'فاتورة متأخرة', msg, inv.id]);
          notifications.push({ user_id: uid, title: 'فاتورة متأخرة', message: msg, type: 'error' });
        }
      }
    }

    res.json({ checked: true, created: notifications.length, lowStock: lowStockItems.length, expiring: expiringItems.length, overdue: overdueInvoices.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
