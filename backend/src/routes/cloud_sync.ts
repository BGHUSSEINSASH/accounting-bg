import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { getCloudSyncSummary, syncLocalFiles } from '../services/cloudSync';

const router = Router();
router.use(authenticate);

router.get('/status', authorize('admin'), (_req: AuthRequest, res: Response) => {
  res.json(getCloudSyncSummary());
});

router.post('/sync', authorize('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await syncLocalFiles();
    res.json({ message: 'Cloud sync completed', ...result, ...getCloudSyncSummary() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;