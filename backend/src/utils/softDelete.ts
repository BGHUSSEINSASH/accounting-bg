import { getDatabase } from '../config/database';

export function softDelete(table: string, id: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE ${table} SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function restore(table: string, id: number): void {
  const db = getDatabase();
  db.prepare(`UPDATE ${table} SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function hardDelete(table: string, id: number): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}
