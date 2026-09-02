import { Router, Response } from 'express';
import { query, queryOne, execute, withTransaction, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const branches = await query('SELECT * FROM branches ORDER BY is_default DESC, name ASC');
    res.json(branches);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const branch = await queryOne('SELECT * FROM branches WHERE id = ?', [req.params.id]);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, phone, address, city, manager_name, is_default, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required' });
    const branchCode = code || `B${Date.now().toString().slice(-6)}`;
    const existing = await queryOne('SELECT id FROM branches WHERE code = ?', [branchCode]);
    if (existing) return res.status(400).json({ error: 'Branch code already exists' });
    const makeDefault = is_default ? 1 : 0;
    if (makeDefault) await execute('UPDATE branches SET is_default = 0 WHERE is_default = 1');
    const result = await execute('INSERT INTO branches (code, name, phone, address, city, manager_name, is_default, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [branchCode, name, phone || null, address || null, city || null, manager_name || null, makeDefault, is_active === undefined ? 1 : (is_active ? 1 : 0)]);
    void logActivityAsync(req.user!.id, 'create_branch', 'branches', result.id as number);
    res.status(201).json({ id: result.id, message: 'Branch created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, phone, address, city, manager_name, is_default, is_active } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (code !== undefined) {
      const existing = await queryOne('SELECT id FROM branches WHERE code = ? AND id != ?', [code, req.params.id]);
      if (existing) return res.status(400).json({ error: 'Branch code already exists' });
      updates.push('code = ?'); params.push(code);
    }
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (city !== undefined) { updates.push('city = ?'); params.push(city); }
    if (manager_name !== undefined) { updates.push('manager_name = ?'); params.push(manager_name); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (is_default !== undefined && is_default) {
      await execute('UPDATE branches SET is_default = 0 WHERE is_default = 1 AND id != ?', [req.params.id]);
      updates.push('is_default = 1');
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await execute(`UPDATE branches SET ${updates.join(', ')} WHERE id = ?`, params);
    void logActivityAsync(req.user!.id, 'update_branch', 'branches', Number(req.params.id));
    res.json({ message: 'Branch updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const branch = await queryOne('SELECT * FROM branches WHERE id = ?', [req.params.id]) as any;
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    if (branch.is_default) return res.status(400).json({ error: 'Cannot delete the default branch. Set another branch as default first.' });
    const used = await queryOne('SELECT COUNT(*) as count FROM sales_invoices WHERE branch_id = ?', [req.params.id]) as any;
    if (used?.count > 0) return res.status(400).json({ error: 'Branch has sales invoices and cannot be deleted. Deactivate it instead.' });
    await execute('DELETE FROM branches WHERE id = ?', [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_branch', 'branches', Number(req.params.id));
    res.json({ message: 'Branch deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
