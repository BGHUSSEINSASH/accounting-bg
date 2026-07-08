import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDatabase } from './database';

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

export function generateRefreshToken(userId: number): string {
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign({ id: userId, jti }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

  const db = getDatabase();
  db.prepare(
    "INSERT INTO refresh_tokens (user_id, token_jti, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
  ).run(userId, jti);

  return refreshToken;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { id: number; jti: string } | null {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET) as { id: number; jti: string };

    const db = getDatabase();
    const stored = db.prepare(
      "SELECT id FROM refresh_tokens WHERE user_id = ? AND token_jti = ? AND revoked = 0 AND expires_at > datetime('now')"
    ).get(payload.id, payload.jti);

    if (!stored) return null;
    return payload;
  } catch {
    return null;
  }
}

export function revokeRefreshToken(userId: number): void {
  const db = getDatabase();
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
}

export function revokeAllUserTokens(userId: number): void {
  const db = getDatabase();
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
}
