import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const companies = await query("SELECT id, name, name_en, database_path, is_active, is_default, created_at FROM companies WHERE is_active = 1 ORDER BY name");
    res.json(companies);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const company = await queryOne("SELECT * FROM companies WHERE id = ?", [req.params.id]);
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json(company);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, name_en } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const result = await execute("INSERT INTO companies (name, name_en) VALUES (?, ?)", [name, name_en || null]);
    void logActivityAsync(req.user!.id, "create_company", "company", result.id as number);
    res.json({ id: result.id, message: "Company created" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, name_en, database_path, is_active, is_default } = req.body;
    const company = await queryOne("SELECT id FROM companies WHERE id = ?", [req.params.id]);
    if (!company) return res.status(404).json({ error: "Company not found" });
    await execute("UPDATE companies SET name = COALESCE(?, name), name_en = COALESCE(?, name_en), database_path = COALESCE(?, database_path), is_active = COALESCE(?, is_active), is_default = COALESCE(?, is_default) WHERE id = ?",
      [name, name_en, database_path, is_active, is_default, req.params.id]);
    void logActivityAsync(req.user!.id, "update_company", "company", parseInt(req.params.id));
    res.json({ message: "Company updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const company = await queryOne("SELECT id FROM companies WHERE id = ?", [req.params.id]);
    if (!company) return res.status(404).json({ error: "Company not found" });
    await execute("UPDATE companies SET is_active = 0 WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_company", "company", parseInt(req.params.id));
    res.json({ message: "Company deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/set-default', async (req: AuthRequest, res: Response) => {
  try {
    const company = await queryOne("SELECT id FROM companies WHERE id = ? AND is_active = 1", [req.params.id]);
    if (!company) return res.status(404).json({ error: "Company not found" });
    await withTransaction(async (client) => {
      await client.query("UPDATE companies SET is_default = 0");
      await client.query("UPDATE companies SET is_default = 1 WHERE id = $1", [req.params.id]);
    });
    void logActivityAsync(req.user!.id, "set_default_company", "company", parseInt(req.params.id));
    res.json({ message: "Default company updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
