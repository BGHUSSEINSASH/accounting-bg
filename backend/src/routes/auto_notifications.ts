import { Router, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);

// Helper: get admin/manager user ids
async function getAdminUserIds(): Promise<number[]> {
  const adminUsers = await query("SELECT id FROM users WHERE role IN ('admin','manager')") as any[];
  return adminUsers.map((u: any) => u.id);
}

// Helper: insert notification if not already exists (unread)
async function insertNotificationIfNew(uid: number, title: string, msg: string, type: string, refType: string, refId?: number): Promise<boolean> {
  const existing = await queryOne(
    "SELECT id FROM notifications WHERE user_id = $1 AND title = $2 AND message = $3 AND is_read = false",
    [uid, title, msg]
  );
  if (!existing) {
    if (refId !== undefined) {
      await execute(
        "INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [uid, title, msg, type, refType, refId]
      );
    } else {
      await execute(
        "INSERT INTO notifications (user_id, title, message, type, reference_type) VALUES ($1, $2, $3, $4, $5)",
        [uid, title, msg, type, refType]
      );
    }
    return true;
  }
  return false;
}

// POST /auto-notifications/check-overdue
router.post('/check-overdue', async (_req: AuthRequest, res: Response) => {
  try {
    const notifyUsers = await getAdminUserIds();
    let created = 0;
    const overdueInvoices = await query(
      `SELECT si.id, si.invoice_number, c.name AS client_name, si.total, si.remaining_amount
       FROM sales_invoices si
       LEFT JOIN clients c ON si.client_id = c.id
       WHERE si.payment_status IN ('partial','unpaid')
         AND si.invoice_date < NOW() - INTERVAL '30 days'`
    ) as any[];
    for (const inv of overdueInvoices) {
      const remaining = Number(inv.remaining_amount ?? inv.total);
      if (remaining <= 0) continue;
      const msg = `فاتورة متأخرة: ${inv.invoice_number} - ${inv.client_name || 'عميل نقدي'} - المتبقي: ${remaining}`;
      for (const uid of notifyUsers) {
        const inserted = await insertNotificationIfNew(uid, 'فاتورة متأخرة', msg, 'error', 'sales_invoice', inv.id);
        if (inserted) created++;
      }
    }
    res.json({ checked: true, created, overdue: overdueInvoices.length });
  } catch (err: any) {
    logger.error('check-overdue error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /auto-notifications/check-low-stock
router.post('/check-low-stock', async (_req: AuthRequest, res: Response) => {
  try {
    const notifyUsers = await getAdminUserIds();
    let created = 0;
    const lowStockItems = await query(
      "SELECT id, name, current_quantity, min_quantity FROM items WHERE min_quantity IS NOT NULL AND current_quantity <= min_quantity"
    ) as any[];
    for (const item of lowStockItems) {
      const msg = `تنبيه مخزون منخفض: ${item.name} - المتاح: ${item.current_quantity} (الحد الأدنى: ${item.min_quantity})`;
      for (const uid of notifyUsers) {
        const inserted = await insertNotificationIfNew(uid, 'تنبيه مخزون منخفض', msg, 'warning', 'item');
        if (inserted) created++;
      }
    }
    res.json({ checked: true, created, lowStock: lowStockItems.length });
  } catch (err: any) {
    logger.error('check-low-stock error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /auto-notifications/check-expiry
router.post('/check-expiry', async (_req: AuthRequest, res: Response) => {
  try {
    const notifyUsers = await getAdminUserIds();
    let created = 0;
    const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    // Check item_batches expiring within 30 days
    const expiringBatches = await query(
      `SELECT ib.id, i.name, ib.expiry_date, ib.quantity
       FROM item_batches ib
       JOIN items i ON ib.item_id = i.id
       WHERE ib.expiry_date IS NOT NULL
         AND ib.expiry_date BETWEEN $1 AND $2
         AND ib.quantity > 0`,
      [today, thirtyDaysLater]
    ) as any[];
    for (const batch of expiringBatches) {
      const daysLeft = Math.ceil((new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const msg = `دفعة منتج تنتهي قريباً: ${batch.name} - تنتهي في ${batch.expiry_date} (متبقي ${daysLeft} يوم)`;
      for (const uid of notifyUsers) {
        const inserted = await insertNotificationIfNew(uid, 'تنبيه صلاحية', msg, 'warning', 'item_batch', batch.id);
        if (inserted) created++;
      }
    }
    res.json({ checked: true, created, expiring: expiringBatches.length });
  } catch (err: any) {
    logger.error('check-expiry error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Legacy combined check endpoint
router.post('/check', async (_req: AuthRequest, res: Response) => {
  try {
    const notifyUsers = await getAdminUserIds();
    let created = 0;

    const lowStockItems = await query(
      "SELECT id, name, current_quantity, min_quantity FROM items WHERE min_quantity IS NOT NULL AND current_quantity <= min_quantity"
    ) as any[];
    for (const item of lowStockItems) {
      const msg = `تنبيه مخزون منخفض: ${item.name} - المتاح: ${item.current_quantity} (الحد الأدنى: ${item.min_quantity})`;
      for (const uid of notifyUsers) {
        const inserted = await insertNotificationIfNew(uid, 'تنبيه مخزون منخفض', msg, 'warning', 'item');
        if (inserted) created++;
      }
    }

    const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const expiringItems = await query(
      `SELECT id, name, expiry_date FROM items WHERE expiry_date IS NOT NULL AND expiry_date BETWEEN $1 AND $2 AND current_quantity > 0`,
      [today, thirtyDaysLater]
    ) as any[];
    for (const item of expiringItems) {
      const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const msg = `صلاحية منتج تنتهي قريباً: ${item.name} - تنتهي في ${item.expiry_date} (متبقي ${daysLeft} يوم)`;
      for (const uid of notifyUsers) {
        const inserted = await insertNotificationIfNew(uid, 'تنبيه صلاحية', msg, 'warning', 'item');
        if (inserted) created++;
      }
    }

    const overdueInvoices = await query(
      `SELECT si.id, si.invoice_number, c.name AS client_name, si.total, si.remaining_amount
       FROM sales_invoices si
       LEFT JOIN clients c ON si.client_id = c.id
       WHERE si.payment_status IN ('partial','unpaid')
         AND si.invoice_date < NOW() - INTERVAL '30 days'`
    ) as any[];
    for (const inv of overdueInvoices) {
      const remaining = Number(inv.remaining_amount ?? inv.total);
      if (remaining <= 0) continue;
      const msg = `فاتورة متأخرة: ${inv.invoice_number} - ${inv.client_name || 'عميل نقدي'} - المتبقي: ${remaining}`;
      for (const uid of notifyUsers) {
        const inserted = await insertNotificationIfNew(uid, 'فاتورة متأخرة', msg, 'error', 'sales_invoice', inv.id);
        if (inserted) created++;
      }
    }

    res.json({ checked: true, created, lowStock: lowStockItems.length, expiring: expiringItems.length, overdue: overdueInvoices.length });
  } catch (err: any) {
    logger.error('auto-notifications check error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;

// Exported runner for scheduled calls (no auth required)
export async function runAutoNotifications(): Promise<void> {
  try {
    const notifyUsers = await getAdminUserIds();

    const lowStockItems = await query(
      "SELECT id, name, current_quantity, min_quantity FROM items WHERE min_quantity IS NOT NULL AND current_quantity <= min_quantity"
    ) as any[];
    for (const item of lowStockItems) {
      const msg = `تنبيه مخزون منخفض: ${item.name} - المتاح: ${item.current_quantity} (الحد الأدنى: ${item.min_quantity})`;
      for (const uid of notifyUsers) {
        await insertNotificationIfNew(uid, 'تنبيه مخزون منخفض', msg, 'warning', 'item');
      }
    }

    const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const expiringBatches = await query(
      `SELECT ib.id, i.name, ib.expiry_date FROM item_batches ib JOIN items i ON ib.item_id = i.id WHERE ib.expiry_date IS NOT NULL AND ib.expiry_date BETWEEN $1 AND $2 AND ib.quantity > 0`,
      [today, thirtyDaysLater]
    ) as any[];
    for (const batch of expiringBatches) {
      const daysLeft = Math.ceil((new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const msg = `دفعة منتج تنتهي قريباً: ${batch.name} - تنتهي في ${batch.expiry_date} (متبقي ${daysLeft} يوم)`;
      for (const uid of notifyUsers) {
        await insertNotificationIfNew(uid, 'تنبيه صلاحية', msg, 'warning', 'item_batch', batch.id);
      }
    }

    const overdueInvoices = await query(
      `SELECT si.id, si.invoice_number, c.name AS client_name, si.remaining_amount, si.total
       FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id
       WHERE si.payment_status IN ('partial','unpaid') AND si.invoice_date < NOW() - INTERVAL '30 days'`
    ) as any[];
    for (const inv of overdueInvoices) {
      const remaining = Number(inv.remaining_amount ?? inv.total);
      if (remaining <= 0) continue;
      const msg = `فاتورة متأخرة: ${inv.invoice_number} - ${inv.client_name || 'عميل نقدي'} - المتبقي: ${remaining}`;
      for (const uid of notifyUsers) {
        await insertNotificationIfNew(uid, 'فاتورة متأخرة', msg, 'error', 'sales_invoice', inv.id);
      }
    }

    logger.info('Auto-notifications check completed');
  } catch (err: any) {
    logger.error('runAutoNotifications error', { error: err.message });
  }
}
