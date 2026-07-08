import bcrypt from 'bcryptjs';
import { getDatabase } from '../config/database';
import { generateToken, generateRefreshToken, verifyRefreshToken, revokeAllUserTokens } from '../config/auth';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface User {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  department: string | null;
  is_active: number;
  profile_image: string | null;
}

export function login(username: string, password: string, ip?: string) {
  const db = getDatabase();

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;

  if (!user) {
    logFailedAttempt(username, ip);
    throw new AppError(401, 'Invalid username or password');
  }

  if (!user.is_active) {
    throw new AppError(403, 'Account is disabled');
  }

  const lockout = db.prepare(`
    SELECT COUNT(*) as attempts, MAX(created_at) as last_attempt
    FROM login_attempts WHERE username = ? AND created_at > datetime('now', '-15 minutes')
  `).get(username) as { attempts: number; last_attempt: string };

  if (lockout.attempts >= MAX_LOGIN_ATTEMPTS) {
    throw new AppError(429, `Account locked. Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    logFailedAttempt(username, ip);
    const remaining = MAX_LOGIN_ATTEMPTS - lockout.attempts - 1;
    throw new AppError(401, remaining > 0
      ? `Invalid username or password (${remaining} attempts remaining)`
      : 'Account locked due to too many failed attempts');
  }

  db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);

  const token = generateToken({ id: user.id, role: user.role });
  const refreshToken = generateRefreshToken(user.id);

  logger.info('User logged in', { userId: user.id, username: user.username, ip });

  return {
    token,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      department: user.department,
      profile_image: user.profile_image,
    },
  };
}

export function refreshAccessToken(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const db = getDatabase();
  const user = db.prepare('SELECT id, role FROM users WHERE id = ? AND is_active = 1').get(payload.id) as { id: number; role: string } | undefined;

  if (!user) {
    throw new AppError(401, 'User not found or inactive');
  }

  const token = generateToken({ id: user.id, role: user.role });
  return { token };
}

export function logout(userId: number) {
  revokeAllUserTokens(userId);
  logger.info('User logged out', { userId });
}

export function getProfile(userId: number) {
  const db = getDatabase();
  const user = db.prepare('SELECT id, username, full_name, email, phone, role, department, profile_image FROM users WHERE id = ?').get(userId);
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

export function updateProfile(userId: number, data: { full_name?: string; email?: string; phone?: string }) {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.full_name !== undefined) { fields.push('full_name = ?'); values.push(data.full_name); }
  if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
  if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }

  if (fields.length === 0) throw new AppError(400, 'No fields to update');

  fields.push("updated_at = datetime('now')");
  values.push(userId);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProfile(userId);
}

export function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const db = getDatabase();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;

  if (!user) throw new AppError(404, 'User not found');
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    throw new AppError(400, 'Current password is incorrect');
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, userId);
  logger.info('Password changed', { userId });
}

export function listUsers() {
  const db = getDatabase();
  return db.prepare('SELECT id, username, full_name, email, phone, role, department, is_active, created_at FROM users ORDER BY full_name').all();
}

export function createUser(data: { username: string; password: string; full_name: string; email?: string; phone?: string; role: string; department?: string }) {
  const db = getDatabase();
  const hash = bcrypt.hashSync(data.password, 10);

  try {
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, email, phone, role, department) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(data.username, hash, data.full_name, data.email || null, data.phone || null, data.role, data.department || null);

    logger.info('User created', { userId: result.lastInsertRowid, username: data.username });
    return { id: result.lastInsertRowid, ...data };
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      throw new AppError(409, 'Username already exists');
    }
    throw err;
  }
}

export function deleteUser(userId: number) {
  const db = getDatabase();
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  revokeAllUserTokens(userId);
  logger.info('User deleted', { userId });
}

export function updateUser(userId: number, data: { full_name?: string; email?: string; phone?: string; role?: string; department?: string; is_active?: boolean }) {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.full_name !== undefined) { fields.push('full_name = ?'); values.push(data.full_name); }
  if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
  if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
  if (data.department !== undefined) { fields.push('department = ?'); values.push(data.department); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }

  if (fields.length === 0) throw new AppError(400, 'No fields to update');

  fields.push("updated_at = datetime('now')");
  values.push(userId);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  logger.info('User updated', { userId });
}

function logFailedAttempt(username: string, ip?: string) {
  const db = getDatabase();
  db.prepare('INSERT INTO login_attempts (username, ip_address) VALUES (?, ?)').run(username, ip || null);
}
