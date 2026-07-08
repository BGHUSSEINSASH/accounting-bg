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
    const classifications = db.prepare(`SELECT * FROM client_classifications ORDER BY name`).all();
    res.json(classifications);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, discount_percentage, credit_limit } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const db = getDatabase();
    const existing = db.prepare(`SELECT id FROM client_classifications WHERE name = ?`).get(name);
    if (existing) return res.status(409).json({ error: 'Classification name already exists' });
    db.prepare(`INSERT INTO client_classifications (name, discount_percentage, credit_limit) VALUES (?, ?, ?)`)
      .run(name, discount_percentage || 0, credit_limit || 0);
    logActivity(req.user!.id, 'create_client_classification', 'client_classification');
    res.json({ message: 'Classification created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, discount_percentage, credit_limit, is_active } = req.body;
    const db = getDatabase();
    const existing = db.prepare(`SELECT id FROM client_classifications WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Classification not found' });
    if (name) {
      const duplicate = db.prepare(`SELECT id FROM client_classifications WHERE name = ? AND id != ?`).get(name, req.params.id);
      if (duplicate) return res.status(409).json({ error: 'Classification name already exists' });
    }
    db.prepare(`UPDATE client_classifications SET name = COALESCE(?, name), discount_percentage = COALESCE(?, discount_percentage), credit_limit = COALESCE(?, credit_limit), is_active = COALESCE(?, is_active) WHERE id = ?`)
      .run(name, discount_percentage, credit_limit, is_active, req.params.id);
    logActivity(req.user!.id, 'update_client_classification', 'client_classification', parseInt(req.params.id));
    res.json({ message: 'Classification updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare(`SELECT id FROM client_classifications WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Classification not found' });
    db.prepare(`UPDATE client_classifications SET is_active = 0 WHERE id = ?`).run(req.params.id);
    logActivity(req.user!.id, 'delete_client_classification', 'client_classification', parseInt(req.params.id));
    res.json({ message: 'Classification deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
