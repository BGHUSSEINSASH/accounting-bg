import { Router, Response } from 'express';
import { query, queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const classifications = await query(`SELECT * FROM client_classifications ORDER BY name`);
    res.json(classifications);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, discount_percentage, credit_limit } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const existing = await queryOne(`SELECT id FROM client_classifications WHERE name = ?`, [name]);
    if (existing) return res.status(409).json({ error: 'Classification name already exists' });
    await execute(`INSERT INTO client_classifications (name, discount_percentage, credit_limit) VALUES (?, ?, ?)`,
      [name, discount_percentage || 0, credit_limit || 0]);
    void logActivityAsync(req.user!.id, 'create_client_classification', 'client_classification');
    res.json({ message: 'Classification created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, discount_percentage, credit_limit, is_active } = req.body;
    const existing = await queryOne(`SELECT id FROM client_classifications WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Classification not found' });
    if (name) {
      const duplicate = await queryOne(`SELECT id FROM client_classifications WHERE name = ? AND id != ?`, [name, req.params.id]);
      if (duplicate) return res.status(409).json({ error: 'Classification name already exists' });
    }
    await execute(`UPDATE client_classifications SET name = COALESCE(?, name), discount_percentage = COALESCE(?, discount_percentage), credit_limit = COALESCE(?, credit_limit), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, discount_percentage, credit_limit, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, 'update_client_classification', 'client_classification', parseInt(req.params.id));
    res.json({ message: 'Classification updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await queryOne(`SELECT id FROM client_classifications WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Classification not found' });
    await execute(`UPDATE client_classifications SET is_active = 0 WHERE id = ?`, [req.params.id]);
    void logActivityAsync(req.user!.id, 'delete_client_classification', 'client_classification', parseInt(req.params.id));
    res.json({ message: 'Classification deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
