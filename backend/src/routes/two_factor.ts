import { Router, Response } from 'express';
import { queryOne, execute } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import crypto from 'crypto';

const router = Router();
router.use(authenticate);

function generateSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  let secret = '';
  for (let i = 0; i < 20; i++) { secret += chars[bytes[i] % 32]; }
  return secret;
}

function generateTOTP(secret: string): string {
  const epoch = Math.floor(Date.now() / 30000);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(epoch));
  const key = Buffer.from(secret, 'utf8');
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne("SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = ?", [req.user!.id]) as any;
    res.json({ enabled: !!user?.two_factor_enabled, hasSecret: !!user?.two_factor_secret });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/setup', async (req: AuthRequest, res: Response) => {
  try {
    const secret = generateSecret();
    await execute("UPDATE users SET two_factor_secret = ?, two_factor_enabled = 0 WHERE id = ?", [secret, req.user!.id]);
    const dbUser = await queryOne("SELECT username FROM users WHERE id = ?", [req.user!.id]) as any;
    res.json({ secret, uri: `otpauth://totp/Accounting:${dbUser?.username || req.user!.id}?secret=${secret}&issuer=AccountingSystem` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;
    const user = await queryOne("SELECT two_factor_secret FROM users WHERE id = ?", [req.user!.id]) as any;
    if (!user?.two_factor_secret) return res.status(400).json({ error: '2FA not set up' });
    const expected = generateTOTP(user.two_factor_secret);
    if (code === expected) {
      await execute("UPDATE users SET two_factor_enabled = 1 WHERE id = ?", [req.user!.id]);
      res.json({ verified: true, message: '2FA enabled successfully' });
    } else {
      res.status(400).json({ verified: false, error: 'Invalid code' });
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/disable', async (req: AuthRequest, res: Response) => {
  try {
    await execute("UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?", [req.user!.id]);
    res.json({ message: '2FA disabled' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/validate', async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, code } = req.body;
    if (!user_id || !code) return res.status(400).json({ error: 'Missing credentials' });
    const user = await queryOne("SELECT two_factor_secret FROM users WHERE id = ? AND two_factor_enabled = 1", [user_id]) as any;
    if (!user) return res.json({ valid: true });
    const expected = generateTOTP(user.two_factor_secret);
    res.json({ valid: code === expected });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
