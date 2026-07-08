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
    const { page = 1, limit = 20, from, to, user_id, action, entity_type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT al.*, u.full_name as user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1";
    const params: any[] = [];
    if (from) { query += " AND al.created_at >= ?"; params.push(from); }
    if (to) { query += " AND al.created_at <= ?"; params.push(to); }
    if (user_id) { query += " AND al.user_id = ?"; params.push(Number(user_id)); }
    if (action) { query += " AND al.action LIKE ?"; params.push(`%${action}%`); }
    if (entity_type) { query += " AND al.entity_type = ?"; params.push(entity_type); }
    const countQuery = query.replace("al.*, u.full_name as user_name", "COUNT(*) as total");
    const total = (db.prepare(countQuery).get(...params) as any).total;
    query += " ORDER BY al.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const logs = db.prepare(query).all(...params);
    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const log = db.prepare("SELECT al.*, u.full_name as user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE al.id = ?").get(req.params.id);
    if (!log) return res.status(404).json({ error: "Activity log not found" });
    res.json(log);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
