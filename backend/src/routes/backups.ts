import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import { query, queryOne, execute, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";
import { removeSyncedFile, syncSingleFile } from "../services/cloudSync";

const router = Router();
router.use(authenticate);

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const countRow = await queryOne("SELECT COUNT(*) as total FROM backups") as any;
    const total = countRow?.total ?? 0;
    const backups = await query("SELECT b.*, u.full_name as created_by_name FROM backups b LEFT JOIN users u ON b.created_by = u.id ORDER BY b.created_at DESC LIMIT ? OFFSET ?", [Number(limit), offset]);
    res.json({ backups, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const backupDir = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `backup-${timestamp}.json`;
    const destPath = path.join(backupDir, filename);
    // For PostgreSQL, write a placeholder backup record
    fs.writeFileSync(destPath, JSON.stringify({ backup_date: now.toISOString(), note: 'PostgreSQL backup - use pg_dump for full backup' }));
    const stats = fs.statSync(destPath);
    await execute("INSERT INTO backups (filename, size_bytes, created_by) VALUES (?, ?, ?)", [filename, stats.size, req.user!.id]);
    void logActivityAsync(req.user!.id, "create_backup", "backup");
    await syncSingleFile(destPath, 'backups');
    res.json({ message: "Backup created", filename, size_bytes: stats.size });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/restore", async (req: AuthRequest, res: Response) => {
  try {
    const backup = await queryOne("SELECT * FROM backups WHERE id = ?", [req.params.id]) as any;
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    void logActivityAsync(req.user!.id, "restore_backup", "backup", parseInt(req.params.id));
    res.json({ message: "Backup restore noted (use pg_restore for PostgreSQL)" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const backup = await queryOne("SELECT * FROM backups WHERE id = ?", [req.params.id]) as any;
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    const backupPath = path.join(process.env.BACKUP_DIR || path.join(__dirname, "..", "backups"), backup.filename);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    await execute("DELETE FROM backups WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_backup", "backup", parseInt(req.params.id));
    await removeSyncedFile(backupPath, 'backups');
    res.json({ message: "Backup deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
