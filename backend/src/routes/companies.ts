import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get('/', (_req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const companies = db.prepare("SELECT id, name, name_en, database_path, is_active, is_default, created_at FROM companies WHERE is_active = 1 ORDER BY name").all();
    res.json(companies);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json(company);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, name_en } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const db = getDatabase();
    const result = db.prepare("INSERT INTO companies (name, name_en) VALUES (?, ?)").run(name, name_en || null);
    logActivity(req.user!.id, "create_company", "company", result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid, message: "Company created" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, name_en, database_path, is_active, is_default } = req.body;
    const db = getDatabase();
    const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });
    db.prepare("UPDATE companies SET name = COALESCE(?, name), name_en = COALESCE(?, name_en), database_path = COALESCE(?, database_path), is_active = COALESCE(?, is_active), is_default = COALESCE(?, is_default) WHERE id = ?")
      .run(name, name_en, database_path, is_active, is_default, req.params.id);
    logActivity(req.user!.id, "update_company", "company", parseInt(req.params.id));
    res.json({ message: "Company updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });
    db.prepare("UPDATE companies SET is_active = 0 WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_company", "company", parseInt(req.params.id));
    res.json({ message: "Company deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/set-default', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const company = db.prepare("SELECT id FROM companies WHERE id = ? AND is_active = 1").get(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });
    const trx = db.transaction(() => {
      db.prepare("UPDATE companies SET is_default = 0").run();
      db.prepare("UPDATE companies SET is_default = 1 WHERE id = ?").run(req.params.id);
    });
    trx();
    logActivity(req.user!.id, "set_default_company", "company", parseInt(req.params.id));
    res.json({ message: "Default company updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
