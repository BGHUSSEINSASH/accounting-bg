import { Router, Response } from "express";
import { query, queryOne, execute, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, from, to, user_id, action, entity_type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT al.*, u.full_name as user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1";
    const params: any[] = [];
    if (from) { sql += " AND al.created_at >= ?"; params.push(from); }
    if (to) { sql += " AND al.created_at <= ?"; params.push(to); }
    if (user_id) { sql += " AND al.user_id = ?"; params.push(Number(user_id)); }
    if (action) { sql += " AND al.action LIKE ?"; params.push(`%${action}%`); }
    if (entity_type) { sql += " AND al.entity_type = ?"; params.push(entity_type); }
    const countRow = await queryOne(sql.replace("al.*, u.full_name as user_name", "COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY al.created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const logs = await query(sql, params);
    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const log = await queryOne("SELECT al.*, u.full_name as user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE al.id = ?", [req.params.id]);
    if (!log) return res.status(404).json({ error: "Activity log not found" });
    res.json(log);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
