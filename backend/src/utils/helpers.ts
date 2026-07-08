import { getDatabase } from '../config/database';

export function generateCode(prefix: string, table: string, column: string = 'code'): string {
  const db = getDatabase();
  const result = db.prepare(`SELECT MAX(CAST(SUBSTR(${column}, LENGTH(?) + 1) AS INTEGER)) as max_num FROM ${table}`).get(prefix) as any;
  const nextNum = (result?.max_num || 0) + 1;
  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

export function logActivity(userId: number, action: string, entityType: string, entityId?: number, details?: string): void {
  const db = getDatabase();
  db.prepare(`INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`).run(userId, action, entityType, entityId || null, details || null);
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function calculatePagination(page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;
  return { offset, limit };
}
