import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { execute, queryOne } from './database';

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET not set'); })();
const REFRESH_SECRET = process.env.REFRESH_SECRET || (() => { throw new Error('REFRESH_SECRET not set'); })();
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'];
const REFRESH_EXPIRES_IN = (process.env.REFRESH_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

interface TokenPayload {
  id: number;
  role: string;
  jti?: string;
}

export function generateToken(payload: { id: number; role: string }): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export async function generateRefreshToken(userId: number): Promise<string> {
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign({ id: userId, jti }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

  await execute(
    "INSERT INTO refresh_tokens (user_id, token_jti, expires_at) VALUES (?, ?, NOW() + INTERVAL '7 days')",
    [userId, jti]
  );

  return refreshToken;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<{ id: number; jti: string } | null> {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET) as { id: number; jti: string };

    const stored = await queryOne(
      'SELECT id FROM refresh_tokens WHERE user_id = ? AND token_jti = ? AND revoked = 0 AND expires_at > NOW()',
      [payload.id, payload.jti]
    );

    if (!stored) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function revokeRefreshToken(userId: number): Promise<void> {
  await execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);
}

export async function revokeAllUserTokens(userId: number): Promise<void> {
  await execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);
}
