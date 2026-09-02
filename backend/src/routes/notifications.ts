import { Router, Response } from "express";
import { query, queryOne, execute, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT n.*, u.full_name as user_name FROM notifications n LEFT JOIN users u ON u.id = n.user_id";
    const params: any[] = [];
    if (user_id) {
      sql += " WHERE n.user_id = ?";
      params.push(user_id);
    } else {
      sql += " WHERE n.user_id IS NULL AND n.is_read = 0";
    }
    const countRow = await queryOne("SELECT COUNT(*) as total FROM (" + sql + ") sub", params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY n.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const notifications = await query(sql, params);
    res.json({ notifications, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/unread-count", async (req: AuthRequest, res: Response) => {
  try {
    const { user_id } = req.query;
    let sql = "SELECT COUNT(*) as count FROM notifications WHERE is_read = 0";
    const params: any[] = [];
    if (user_id) {
      sql += " AND user_id = ?";
      params.push(user_id);
    } else {
      sql += " AND user_id IS NULL";
    }
    const result = await queryOne(sql, params) as any;
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/types", (_req: AuthRequest, res: Response) => {
  const types = [
    { value: "info", label: "معلومات" },
    { value: "warning", label: "تحذير" },
    { value: "success", label: "نجاح" },
    { value: "error", label: "خطأ" },
  ];
  res.json(types);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, title, message, type, reference_type, reference_id } = req.body;
    await execute("INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)",
      [user_id || null, title, message, type || "info", reference_type || null, reference_id || null]);
    void logActivityAsync(req.user!.id, "create_notification", "notification");
    res.json({ message: "Notification created" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/read-all", async (req: AuthRequest, res: Response) => {
  try {
    const { user_id } = req.body;
    if (user_id) {
      await execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", [user_id]);
    } else {
      await execute("UPDATE notifications SET is_read = 1 WHERE user_id IS NULL AND is_read = 0");
    }
    void logActivityAsync(req.user!.id, 'read_all_notifications', 'notification');
    res.json({ message: "All notifications marked as read" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/:id/read", async (req: AuthRequest, res: Response) => {
  try {
    const result = await execute("UPDATE notifications SET is_read = 1 WHERE id = ?", [req.params.id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    void logActivityAsync(req.user!.id, 'read_notification', 'notification', parseInt(req.params.id));
    res.json({ message: "Notification marked as read" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await execute("DELETE FROM notifications WHERE id = ?", [req.params.id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    void logActivityAsync(req.user!.id, "delete_notification", "notification", parseInt(req.params.id));
    res.json({ message: "Notification deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
