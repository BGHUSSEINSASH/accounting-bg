import { Router, Response } from 'express';
import { queryOne, execute, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const config = await queryOne("SELECT * FROM email_config LIMIT 1") || {};
    res.json(config);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, is_active } = req.body;
    const existing = await queryOne("SELECT id FROM email_config LIMIT 1") as { id: number } | undefined;
    if (existing) {
      await execute("UPDATE email_config SET smtp_host = COALESCE(?, smtp_host), smtp_port = COALESCE(?, smtp_port), smtp_secure = COALESCE(?, smtp_secure), smtp_user = COALESCE(?, smtp_user), smtp_pass = COALESCE(?, smtp_pass), from_name = COALESCE(?, from_name), from_email = COALESCE(?, from_email), is_active = COALESCE(?, is_active) WHERE id = ?",
        [smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, is_active, existing.id]);
    } else {
      await execute("INSERT INTO email_config (smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [smtp_host || '', smtp_port || 587, smtp_secure ?? 1, smtp_user || '', smtp_pass || '', from_name || '', from_email || '', is_active ?? 1]);
    }
    void logActivityAsync(req.user!.id, "update_email_config", "email_config");
    res.json({ message: "Email configuration saved" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/test', async (req: AuthRequest, res: Response) => {
  try {
    const { test_email } = req.body;
    if (!test_email) return res.status(400).json({ error: "test_email is required" });
    const config = await queryOne("SELECT * FROM email_config LIMIT 1") as any;
    if (!config) return res.status(400).json({ error: "No email configuration found" });
    const missing: string[] = [];
    if (!config.smtp_host) missing.push("smtp_host");
    if (!config.smtp_user) missing.push("smtp_user");
    if (!config.smtp_pass) missing.push("smtp_pass");
    if (!config.from_email) missing.push("from_email");
    if (missing.length) return res.status(400).json({ error: `Incomplete email configuration. Missing: ${missing.join(", ")}` });
    res.json({ message: "Email configuration is valid and complete", test_email });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
