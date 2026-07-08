import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import { getDatabase } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";
import { logActivity } from "../utils/helpers";
import { removeSyncedFile, syncSingleFile } from "../services/cloudSync";

const router = Router();
router.use(authenticate);

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const total = (db.prepare("SELECT COUNT(*) as total FROM backups").get() as any).total;
    const backups = db.prepare("SELECT b.*, u.full_name as created_by_name FROM backups b LEFT JOIN users u ON b.created_by = u.id ORDER BY b.created_at DESC LIMIT ? OFFSET ?").all(Number(limit), offset);
    res.json({ backups, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "accounting.db");
    const backupDir = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `backup-${timestamp}.db`;
    const destPath = path.join(backupDir, filename);
    fs.copyFileSync(dbPath, destPath);
    const stats = fs.statSync(destPath);
    db.prepare("INSERT INTO backups (filename, size_bytes, created_by) VALUES (?, ?, ?)").run(filename, stats.size, req.user!.id);
    logActivity(req.user!.id, "create_backup", "backup");
    await syncSingleFile(destPath, 'backups');
    res.json({ message: "Backup created", filename, size_bytes: stats.size });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/restore", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const backup = db.prepare("SELECT * FROM backups WHERE id = ?").get(req.params.id) as any;
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "accounting.db");
    const backupPath = path.join(__dirname, "..", "backups", backup.filename);
    if (!fs.existsSync(backupPath)) return res.status(404).json({ error: "Backup file not found on disk" });
    fs.copyFileSync(backupPath, dbPath);
    logActivity(req.user!.id, "restore_backup", "backup", parseInt(req.params.id));
    res.json({ message: "Backup restored successfully" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const backup = db.prepare("SELECT * FROM backups WHERE id = ?").get(req.params.id) as any;
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    const backupPath = path.join(process.env.BACKUP_DIR || path.join(__dirname, "..", "backups"), backup.filename);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    db.prepare("DELETE FROM backups WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_backup", "backup", parseInt(req.params.id));
    await removeSyncedFile(backupPath, 'backups');
    res.json({ message: "Backup deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
