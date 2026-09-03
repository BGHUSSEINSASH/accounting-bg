import bcrypt from 'bcryptjs';
import { execute, query, queryOne } from '../config/database';
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

export async function login(username: string, password: string, ip?: string) {
  const user = await queryOne('SELECT * FROM users WHERE username = ?', [username]) as User | undefined;

  if (!user) {
    await logFailedAttempt(username, ip);
    throw new AppError(401, 'Invalid username or password');
  }

  if (!user.is_active) {
    throw new AppError(403, 'Account is disabled');
  }

  const lockout = await queryOne(
    "SELECT COUNT(*)::int as attempts FROM login_attempts WHERE username = ? AND created_at > NOW() - INTERVAL '15 minutes'",
    [username]
  ) as { attempts: number } | undefined;

  const attempts = Number(lockout?.attempts || 0);
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    throw new AppError(429, `Account locked. Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    await logFailedAttempt(username, ip);
    const remaining = MAX_LOGIN_ATTEMPTS - attempts - 1;
    throw new AppError(
      401,
      remaining > 0
        ? `Invalid username or password (${remaining} attempts remaining)`
        : 'Account locked due to too many failed attempts'
    );
  }

  await execute('DELETE FROM login_attempts WHERE username = ?', [username]);

  const token = generateToken({ id: user.id, role: user.role });
  const refreshToken = await generateRefreshToken(user.id);

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

export async function refreshAccessToken(refreshToken: string) {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const user = await queryOne('SELECT id, role FROM users WHERE id = ? AND is_active = 1', [payload.id]) as { id: number; role: string } | undefined;
  if (!user) {
    throw new AppError(401, 'User not found or inactive');
  }

  const token = generateToken({ id: user.id, role: user.role });
  return { token };
}

export async function logout(userId: number) {
  await revokeAllUserTokens(userId);
  logger.info('User logged out', { userId });
}

export async function getProfile(userId: number) {
  const user = await queryOne(
    'SELECT id, username, full_name, email, phone, role, department, profile_image FROM users WHERE id = ?',
    [userId]
  );
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

export async function updateProfile(userId: number, data: { full_name?: string; email?: string; phone?: string }) {
  const fields: string[] = [];
  const values: any[] = [];

  if (data.full_name !== undefined) {
    fields.push('full_name = ?');
    values.push(data.full_name);
  }
  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push('phone = ?');
    values.push(data.phone);
  }

  if (fields.length === 0) throw new AppError(400, 'No fields to update');

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId);

  await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  return getProfile(userId);
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]) as { password_hash: string } | undefined;

  if (!user) throw new AppError(404, 'User not found');
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    throw new AppError(400, 'Current password is incorrect');
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  await execute('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, userId]);
  logger.info('Password changed', { userId });
}

export async function listUsers() {
  return query('SELECT id, username, full_name, email, phone, role, department, is_active, created_at FROM users ORDER BY full_name');
}

export async function createUser(data: { username: string; password: string; full_name: string; email?: string; phone?: string; role: string; department?: string }) {
  const hash = bcrypt.hashSync(data.password, 10);

  try {
    const result = await execute(
      'INSERT INTO users (username, password_hash, full_name, email, phone, role, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.username, hash, data.full_name, data.email || null, data.phone || null, data.role, data.department || null]
    );

    logger.info('User created', { userId: result.id, username: data.username });
    return { id: result.id, ...data };
  } catch (err: any) {
    if (err.message?.includes('duplicate key') || err.message?.includes('UNIQUE')) {
      throw new AppError(409, 'Username already exists');
    }
    throw err;
  }
}

export async function deleteUser(userId: number) {
  await execute('DELETE FROM users WHERE id = ?', [userId]);
  await revokeAllUserTokens(userId);
  logger.info('User deleted', { userId });
}

export async function updateUser(userId: number, data: { full_name?: string; email?: string; phone?: string; role?: string; department?: string; is_active?: boolean }) {
  const fields: string[] = [];
  const values: any[] = [];

  if (data.full_name !== undefined) {
    fields.push('full_name = ?');
    values.push(data.full_name);
  }
  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push('phone = ?');
    values.push(data.phone);
  }
  if (data.role !== undefined) {
    fields.push('role = ?');
    values.push(data.role);
  }
  if (data.department !== undefined) {
    fields.push('department = ?');
    values.push(data.department);
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(data.is_active ? 1 : 0);
  }

  if (fields.length === 0) throw new AppError(400, 'No fields to update');

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId);

  await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  logger.info('User updated', { userId });
}

async function logFailedAttempt(username: string, ip?: string) {
  await execute('INSERT INTO login_attempts (username, ip_address) VALUES (?, ?)', [username, ip || null]);
}
