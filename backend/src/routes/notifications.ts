import { Router, Response } from "express";
import { getDatabase } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";
import { logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { user_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT n.*, u.full_name as user_name FROM notifications n LEFT JOIN users u ON u.id = n.user_id";
    const params: any[] = [];
    if (user_id) {
      query += " WHERE n.user_id = ?";
      params.push(user_id);
    } else {
      query += " WHERE n.user_id IS NULL AND n.is_read = 0";
    }
    const countQuery = "SELECT COUNT(*) as total FROM (" + query + ")";
    const total = (db.prepare(countQuery).get(...params) as any).total;
    query += " ORDER BY n.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const notifications = db.prepare(query).all(...params);
    res.json({ notifications, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/unread-count", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { user_id } = req.query;
    let query = "SELECT COUNT(*) as count FROM notifications WHERE is_read = 0";
    const params: any[] = [];
    if (user_id) {
      query += " AND user_id = ?";
      params.push(user_id);
    } else {
      query += " AND user_id IS NULL";
    }
    const result = db.prepare(query).get(...params) as { count: number };
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { user_id, title, message, type, reference_type, reference_id } = req.body;
    const db = getDatabase();
    db.prepare("INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(user_id || null, title, message, type || "info", reference_type || null, reference_id || null);
    logActivity(req.user!.id, "create_notification", "notification");
    res.json({ message: "Notification created" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/:id/read", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    logActivity(req.user!.id, 'read_notification', 'notification', parseInt(req.params.id));
    res.json({ message: "Notification marked as read" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/read-all", (req: AuthRequest, res: Response) => {
  try {
    const { user_id } = req.body;
    const db = getDatabase();
    if (user_id) {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0").run(user_id);
    } else {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id IS NULL AND is_read = 0").run();
    }
    logActivity(req.user!.id, 'read_all_notifications', 'notification');
    res.json({ message: "All notifications marked as read" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM notifications WHERE id = ?").run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    logActivity(req.user!.id, "delete_notification", "notification", parseInt(req.params.id));
    res.json({ message: "Notification deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/types", (_req: AuthRequest, res: Response) => {
  try {
    const types = [
      { value: "info", label: "معلومات" },
      { value: "warning", label: "تحذير" },
      { value: "success", label: "نجاح" },
      { value: "error", label: "خطأ" },
    ];
    res.json(types);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
