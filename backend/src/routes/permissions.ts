import { Router, Response } from "express";
import { query, queryOne, execute, withTransaction, logActivityAsync } from "../config/database";
import { authenticate, authorize } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/groups", async (req: AuthRequest, res: Response) => {
  try {
    const groups = await query("SELECT * FROM permission_groups ORDER BY name");
    res.json(groups);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/groups", authorize("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    const existing = await queryOne("SELECT id FROM permission_groups WHERE name = ?", [name]);
    if (existing) { res.status(409).json({ error: "Group name already exists" }); return; }
    await execute("INSERT INTO permission_groups (name, description) VALUES (?, ?)", [name, description || null]);
    void logActivityAsync(req.user!.id, "create_permission_group", "permission_group");
    res.json({ message: "Group created" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/groups/:id", authorize("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    const group = await queryOne("SELECT * FROM permission_groups WHERE id = ?", [req.params.id]) as any;
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    if (name && name !== group.name) {
      const existing = await queryOne("SELECT id FROM permission_groups WHERE name = ? AND id != ?", [name, req.params.id]);
      if (existing) { res.status(409).json({ error: "Group name already exists" }); return; }
    }
    await execute("UPDATE permission_groups SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?", [name, description, req.params.id]);
    void logActivityAsync(req.user!.id, "update_permission_group", "permission_group", parseInt(req.params.id));
    res.json({ message: "Group updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/groups/:id", authorize("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const group = await queryOne("SELECT * FROM permission_groups WHERE id = ?", [req.params.id]) as any;
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    if (group.is_system) { res.status(403).json({ error: "Cannot delete system group" }); return; }
    await execute("DELETE FROM permission_group_users WHERE group_id = ?", [req.params.id]);
    await execute("DELETE FROM permissions WHERE group_id = ?", [req.params.id]);
    await execute("DELETE FROM permission_groups WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_permission_group", "permission_group", parseInt(req.params.id));
    res.json({ message: "Group deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/groups/:id/permissions", async (req: AuthRequest, res: Response) => {
  try {
    const group = await queryOne("SELECT id FROM permission_groups WHERE id = ?", [req.params.id]);
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    const perms = await query("SELECT * FROM permissions WHERE group_id = ? ORDER BY resource", [req.params.id]);
    res.json(perms);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/groups/:id/permissions", authorize("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { resource, can_view, can_create, can_edit, can_delete, can_approve } = req.body;
    const group = await queryOne("SELECT id FROM permission_groups WHERE id = ?", [req.params.id]);
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    await execute("INSERT INTO permissions (group_id, resource, can_view, can_create, can_edit, can_delete, can_approve) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(group_id, resource) DO UPDATE SET can_view = COALESCE(?, can_view), can_create = COALESCE(?, can_create), can_edit = COALESCE(?, can_edit), can_delete = COALESCE(?, can_delete), can_approve = COALESCE(?, can_approve)",
      [req.params.id, resource, can_view ? 1 : 0, can_create ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0, can_approve ? 1 : 0, can_view ? 1 : 0, can_create ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0, can_approve ? 1 : 0]);
    void logActivityAsync(req.user!.id, "set_permission", "permission", undefined, "group_id=" + req.params.id + ",resource=" + resource);
    res.json({ message: "Permission set" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/groups/:id/users", async (req: AuthRequest, res: Response) => {
  try {
    const group = await queryOne("SELECT id FROM permission_groups WHERE id = ?", [req.params.id]);
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    const users = await query("SELECT u.id, u.full_name, u.username FROM permission_group_users pgu JOIN users u ON u.id = pgu.user_id WHERE pgu.group_id = ? ORDER BY u.full_name", [req.params.id]);
    res.json(users);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/groups/:id/users", authorize("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { user_id } = req.body;
    const group = await queryOne("SELECT id FROM permission_groups WHERE id = ?", [req.params.id]);
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    const user = await queryOne("SELECT id FROM users WHERE id = ?", [user_id]);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const existing = await queryOne("SELECT id FROM permission_group_users WHERE group_id = ? AND user_id = ?", [req.params.id, user_id]);
    if (existing) { res.status(409).json({ error: "User already in group" }); return; }
    await execute("INSERT INTO permission_group_users (group_id, user_id) VALUES (?, ?)", [req.params.id, user_id]);
    void logActivityAsync(req.user!.id, "add_user_to_permission_group", "permission_group_user", undefined, "group_id=" + req.params.id + ",user_id=" + user_id);
    res.json({ message: "User added to group" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/groups/:id/users/:userId", authorize("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const result = await execute("DELETE FROM permission_group_users WHERE group_id = ? AND user_id = ?", [req.params.id, req.params.userId]);
    if (result.rowCount === 0) { res.status(404).json({ error: "User not found in group" }); return; }
    void logActivityAsync(req.user!.id, "remove_user_from_permission_group", "permission_group_user", undefined, "group_id=" + req.params.id + ",user_id=" + req.params.userId);
    res.json({ message: "User removed from group" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/user/:userId", async (req: AuthRequest, res: Response) => {
  try {
    const groups = await query("SELECT group_id FROM permission_group_users WHERE user_id = ?", [req.params.userId]) as { group_id: number }[];
    if (groups.length === 0) { res.json([]); return; }
    const groupIds = groups.map(g => g.group_id);
    const placeholders = groupIds.map((_: any, i: number) => `$${i + 1}`).join(",");
    const { getPool } = await import('../config/database');
    const pool = getPool();
    const result = await pool.query(`SELECT resource, MAX(can_view) as can_view, MAX(can_create) as can_create, MAX(can_edit) as can_edit, MAX(can_delete) as can_delete, MAX(can_approve) as can_approve FROM permissions WHERE group_id IN (${placeholders}) GROUP BY resource ORDER BY resource`, groupIds);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/init-defaults", authorize("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const resources = ["clients", "suppliers", "items", "sales", "purchases", "accounts", "expenses", "reports", "settings", "users", "permissions", "notifications", "budgets", "bank_accounts", "fixed_assets", "payroll", "leaves", "attendance"];
    await withTransaction(async (client) => {
      const upsertGroup = async (name: string, description: string) => {
        const existing = await client.query("SELECT id FROM permission_groups WHERE name = $1", [name]).then(r => r.rows[0]);
        if (existing) return existing.id;
        const result = await client.query("INSERT INTO permission_groups (name, description, is_system) VALUES ($1,$2,1) RETURNING id", [name, description]);
        return result.rows[0].id;
      };
      const setPerm = async (groupId: number, resource: string, v: number, c: number, e: number, d: number, a: number) => {
        const existing = await client.query("SELECT id FROM permissions WHERE group_id = $1 AND resource = $2", [groupId, resource]).then(r => r.rows[0]);
        if (!existing) await client.query("INSERT INTO permissions (group_id, resource, can_view, can_create, can_edit, can_delete, can_approve) VALUES ($1,$2,$3,$4,$5,$6,$7)", [groupId, resource, v, c, e, d, a]);
      };
      const adminId = await upsertGroup("مدير النظام", "Full system access");
      const accountantId = await upsertGroup("محاسب", "Accounting read/write");
      const salesRepId = await upsertGroup("مندوب مبيعات", "Sales read/write");
      const employeeId = await upsertGroup("موظف", "Basic read");
      for (const r of resources) {
        await setPerm(adminId, r, 1, 1, 1, 1, 1);
        if (["accounts", "expenses"].includes(r)) await setPerm(accountantId, r, 1, 1, 1, 1, 0);
        if (["clients", "items", "sales"].includes(r)) await setPerm(salesRepId, r, 1, 1, 1, 0, 0);
        if (["clients", "items"].includes(r)) await setPerm(employeeId, r, 1, 0, 0, 0, 0);
      }
    });
    void logActivityAsync(req.user!.id, "init_default_permissions", "permission_group");
    res.json({ message: "Default permission groups initialized" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
