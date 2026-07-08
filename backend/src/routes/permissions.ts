import { Router, Response } from "express";
import { getDatabase } from "../config/database";
import { authenticate, authorize } from "../middleware/auth";
import { AuthRequest } from "../types";
import { logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get("/groups", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const groups = db.prepare("SELECT * FROM permission_groups ORDER BY name").all();
    res.json(groups);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/groups", authorize("admin"), (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    const db = getDatabase();
    const existing = db.prepare("SELECT id FROM permission_groups WHERE name = ?").get(name);
    if (existing) {
      res.status(409).json({ error: "Group name already exists" });
      return;
    }
    db.prepare("INSERT INTO permission_groups (name, description) VALUES (?, ?)").run(name, description || null);
    logActivity(req.user!.id, "create_permission_group", "permission_group");
    res.json({ message: "Group created" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/groups/:id", authorize("admin"), (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    const db = getDatabase();
    const group = db.prepare("SELECT * FROM permission_groups WHERE id = ?").get(req.params.id) as any;
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (name && name !== group.name) {
      const existing = db.prepare("SELECT id FROM permission_groups WHERE name = ? AND id != ?").get(name, req.params.id);
      if (existing) {
        res.status(409).json({ error: "Group name already exists" });
        return;
      }
    }
    db.prepare("UPDATE permission_groups SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?").run(name, description, req.params.id);
    logActivity(req.user!.id, "update_permission_group", "permission_group", parseInt(req.params.id));
    res.json({ message: "Group updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/groups/:id", authorize("admin"), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const group = db.prepare("SELECT * FROM permission_groups WHERE id = ?").get(req.params.id) as any;
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (group.is_system) {
      res.status(403).json({ error: "Cannot delete system group" });
      return;
    }
    db.prepare("DELETE FROM permission_group_users WHERE group_id = ?").run(req.params.id);
    db.prepare("DELETE FROM permissions WHERE group_id = ?").run(req.params.id);
    db.prepare("DELETE FROM permission_groups WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_permission_group", "permission_group", parseInt(req.params.id));
    res.json({ message: "Group deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/groups/:id/permissions", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const group = db.prepare("SELECT id FROM permission_groups WHERE id = ?").get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const perms = db.prepare("SELECT * FROM permissions WHERE group_id = ? ORDER BY resource").all(req.params.id);
    res.json(perms);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/groups/:id/permissions", authorize("admin"), (req: AuthRequest, res: Response) => {
  try {
    const { resource, can_view, can_create, can_edit, can_delete, can_approve } = req.body;
    const db = getDatabase();
    const group = db.prepare("SELECT id FROM permission_groups WHERE id = ?").get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    db.prepare("INSERT INTO permissions (group_id, resource, can_view, can_create, can_edit, can_delete, can_approve) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(group_id, resource) DO UPDATE SET can_view = COALESCE(?, can_view), can_create = COALESCE(?, can_create), can_edit = COALESCE(?, can_edit), can_delete = COALESCE(?, can_delete), can_approve = COALESCE(?, can_approve)")
      .run(req.params.id, resource, can_view ? 1 : 0, can_create ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0, can_approve ? 1 : 0, can_view ? 1 : 0, can_create ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0, can_approve ? 1 : 0);
    logActivity(req.user!.id, "set_permission", "permission", undefined, "group_id=" + req.params.id + ",resource=" + resource);
    res.json({ message: "Permission set" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/groups/:id/users", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const group = db.prepare("SELECT id FROM permission_groups WHERE id = ?").get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const users = db.prepare("SELECT u.id, u.full_name, u.username FROM permission_group_users pgu JOIN users u ON u.id = pgu.user_id WHERE pgu.group_id = ? ORDER BY u.full_name").all(req.params.id);
    res.json(users);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/groups/:id/users", authorize("admin"), (req: AuthRequest, res: Response) => {
  try {
    const { user_id } = req.body;
    const db = getDatabase();
    const group = db.prepare("SELECT id FROM permission_groups WHERE id = ?").get(req.params.id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(user_id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const existing = db.prepare("SELECT id FROM permission_group_users WHERE group_id = ? AND user_id = ?").get(req.params.id, user_id);
    if (existing) {
      res.status(409).json({ error: "User already in group" });
      return;
    }
    db.prepare("INSERT INTO permission_group_users (group_id, user_id) VALUES (?, ?)").run(req.params.id, user_id);
    logActivity(req.user!.id, "add_user_to_permission_group", "permission_group_user", undefined, "group_id=" + req.params.id + ",user_id=" + user_id);
    res.json({ message: "User added to group" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/groups/:id/users/:userId", authorize("admin"), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM permission_group_users WHERE group_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: "User not found in group" });
      return;
    }
    logActivity(req.user!.id, "remove_user_from_permission_group", "permission_group_user", undefined, "group_id=" + req.params.id + ",user_id=" + req.params.userId);
    res.json({ message: "User removed from group" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/user/:userId", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const groups = db.prepare("SELECT group_id FROM permission_group_users WHERE user_id = ?").all(req.params.userId) as { group_id: number }[];
    if (groups.length === 0) {
      res.json([]);
      return;
    }
    const groupIds = groups.map(g => g.group_id);
    const placeholders = groupIds.map(() => "?").join(",");
    const perms = db.prepare("SELECT resource, MAX(can_view) as can_view, MAX(can_create) as can_create, MAX(can_edit) as can_edit, MAX(can_delete) as can_delete, MAX(can_approve) as can_approve FROM permissions WHERE group_id IN (" + placeholders + ") GROUP BY resource ORDER BY resource").all(...groupIds);
    res.json(perms);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/init-defaults", authorize("admin"), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();

    const upsertGroup = (name: string, description: string) => {
      const existing = db.prepare("SELECT id FROM permission_groups WHERE name = ?").get(name) as { id: number } | undefined;
      if (existing) return existing.id;
      const result = db.prepare("INSERT INTO permission_groups (name, description, is_system) VALUES (?, ?, 1)").run(name, description);
      return result.lastInsertRowid as number;
    };

    const setPerm = (groupId: number, resource: string, can_view: number, can_create: number, can_edit: number, can_delete: number, can_approve: number) => {
      const existing = db.prepare("SELECT id FROM permissions WHERE group_id = ? AND resource = ?").get(groupId, resource) as { id: number } | undefined;
      if (!existing) {
        db.prepare("INSERT INTO permissions (group_id, resource, can_view, can_create, can_edit, can_delete, can_approve) VALUES (?, ?, ?, ?, ?, ?, ?)").run(groupId, resource, can_view, can_create, can_edit, can_delete, can_approve);
      }
    };

    const adminId = upsertGroup("مدير النظام", "Full system access");
    const accountantId = upsertGroup("محاسب", "Accounting read/write");
    const salesRepId = upsertGroup("مندوب مبيعات", "Sales read/write");
    const employeeId = upsertGroup("موظف", "Basic read");

    const resources = ["clients", "suppliers", "items", "sales", "purchases", "accounts", "expenses", "reports", "settings", "users", "permissions", "notifications", "budgets", "bank_accounts", "fixed_assets", "payroll", "leaves", "attendance"];

    const tx = db.transaction(() => {
      for (const r of resources) {
        setPerm(adminId, r, 1, 1, 1, 1, 1);
        if (["accounts", "expenses"].includes(r)) {
          setPerm(accountantId, r, 1, 1, 1, 1, 0);
        }
        if (["clients", "items", "sales"].includes(r)) {
          setPerm(salesRepId, r, 1, 1, 1, 0, 0);
        }
        if (["clients", "items"].includes(r)) {
          setPerm(employeeId, r, 1, 0, 0, 0, 0);
        }
      }
    });
    tx();

    logActivity(req.user!.id, "init_default_permissions", "permission_group");
    res.json({ message: "Default permission groups initialized" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
