import { query, queryOne, execute } from '../config/database';

// ============================================================
//  generateCode — async version for PostgreSQL
// ============================================================
export async function generateCodeAsync(prefix: string, table: string, column: string = 'code'): Promise<string> {
  const safeTable = table.replace(/[^a-z_]/gi, '');
  const safeCol = column.replace(/[^a-z_]/gi, '');
  // Use ? placeholders so both PG and SQLite layers can translate.
  // SUBSTRING(col, N) is translated to substr(col, N) for SQLite automatically.
  const result = await queryOne(
    `SELECT MAX(CAST(SUBSTRING(${safeCol}, LENGTH(?) + 1) AS INTEGER)) AS max_num FROM ${safeTable} WHERE ${safeCol} LIKE ?`,
    [prefix, `${prefix}%`]
  );
  const nextNum = (result?.max_num || 0) + 1;
  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

/**
 * Sync wrapper — kept for backward compat but throws in PG mode.
 * @deprecated Use generateCodeAsync() instead.
 */
export function generateCode(prefix: string, table: string, column: string = 'code'): string {
  throw new Error('[helpers] generateCode() is synchronous and not supported with PostgreSQL. Use generateCodeAsync().');
}

// ============================================================
//  logActivity — async
// ============================================================
export async function logActivityAsync(
  userId: number,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string,
  ipAddress?: string
): Promise<void> {
  try {
    await execute(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, entityType, entityId || null, details || null, ipAddress || null]
    );
  } catch {
    // Non-critical — don't crash the request
  }
}

/** @deprecated Use logActivityAsync() */
export function logActivity(
  userId: number,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string
): void {
  logActivityAsync(userId, action, entityType, entityId, details).catch(() => {});
}

// ============================================================
//  Utility helpers
// ============================================================
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function calculatePagination(page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;
  return { offset, limit };
}

// ============================================================
//  Costing helpers — async for PostgreSQL
// ============================================================

/**
 * Compute the cost amount for a given quantity using specified costing method.
 */
export async function computeCostAmount(
  itemId: number,
  quantity: number,
  costingMethod: string = 'fifo'
): Promise<number> {
  try {
    if (costingMethod === 'average') {
      const item = await queryOne('SELECT average_cost FROM items WHERE id = ?', [itemId]);
      return (item?.average_cost || 0) * quantity;
    }
    if (costingMethod === 'standard') {
      const item = await queryOne('SELECT standard_cost FROM items WHERE id = ?', [itemId]);
      return (item?.standard_cost || 0) * quantity;
    }
    // FIFO / LIFO
    const order = costingMethod === 'lifo' ? 'DESC' : 'ASC';
    const batches = await query(
      `SELECT quantity, unit_cost FROM item_batches WHERE item_id = ? AND quantity > 0 ORDER BY created_at ${order}`,
      [itemId]
    );
    let remaining = quantity;
    let totalCost = 0;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const used = Math.min(remaining, batch.quantity);
      totalCost += used * (batch.unit_cost || 0);
      remaining -= used;
    }
    return totalCost;
  } catch {
    return 0;
  }
}

/**
 * Compute total inventory value for an item.
 */
export async function computeInventoryValue(itemId: number, costingMethod: string = 'fifo'): Promise<number> {
  try {
    const item = await queryOne('SELECT current_quantity FROM items WHERE id = ?', [itemId]);
    const qty = item?.current_quantity || 0;
    if (qty <= 0) return 0;
    return computeCostAmount(itemId, qty, costingMethod);
  } catch {
    return 0;
  }
}

/**
 * Compute effective price for a client based on pricing tiers.
 */
export async function computeClientPrice(
  itemId: number,
  clientId: number,
  quantity: number
): Promise<number> {
  try {
    const clientPrice = await queryOne(
      `SELECT price FROM item_prices WHERE item_id = ? AND (client_id = ? OR client_id IS NULL)
       ORDER BY client_id DESC NULLS LAST, min_quantity DESC LIMIT 1`,
      [itemId, clientId]
    );
    if (clientPrice) return clientPrice.price;
    const item = await queryOne('SELECT sale_price, selling_price FROM items WHERE id = ?', [itemId]);
    return item?.sale_price || item?.selling_price || 0;
  } catch {
    return 0;
  }
}
