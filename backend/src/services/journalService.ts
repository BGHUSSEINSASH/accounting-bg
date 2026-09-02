import Database from 'better-sqlite3';
import { generateCode } from '../utils/helpers';

export interface JournalItem {
  account_id?: number;
  account_code?: string;
  description?: string;
  debit: number;
  credit: number;
  analytic_account_id?: number | null;
}

export interface CreateJournalEntryParams {
  db: Database.Database;
  entry_date: string;
  description: string;
  reference_type?: string;
  reference_id?: number | bigint;
  created_by?: number | bigint;
  bank_account_id?: number | null;
  party_type?: string;
  party_id?: number | bigint;
  items: JournalItem[];
  is_posted?: number;
}

function resolveAccountId(db: Database.Database, item: JournalItem): number | null {
  if (item.account_id) return item.account_id;
  if (item.account_code) {
    const acc = db.prepare("SELECT id FROM accounts WHERE code = ? AND is_active = 1 LIMIT 1").get(item.account_code) as any;
    return acc ? acc.id : null;
  }
  return null;
}

function validateAccounts(db: Database.Database, items: JournalItem[]): { resolved: Array<JournalItem & { _id: number }>; errors: string[] } {
  const resolved = items.map(item => ({
    ...item,
    _id: resolveAccountId(db, item) as number,
  }));
  const errors: string[] = [];
  resolved.forEach((r, i) => {
    if (!r._id) {
      const code = items[i].account_code || `account_id:${items[i].account_id}`;
      errors.push(`Account not found or inactive: ${code} (item ${i + 1})`);
    }
  });
  return { resolved, errors };
}

export function getBankAccountCode(db: Database.Database, bankAccountId: number | null | undefined): string {
  if (!bankAccountId) return '1.1.1';
  const ba = db.prepare("SELECT accounting_code FROM bank_accounts WHERE id = ? AND is_active = 1").get(bankAccountId) as any;
  if (ba && ba.accounting_code) {
    const acc = db.prepare("SELECT code FROM accounts WHERE code = ?").get(ba.accounting_code) as any;
    if (acc) return acc.code;
  }
  return '1.1.1';
}

export function createJournalEntry(params: CreateJournalEntryParams): number | null {
  const { db, entry_date, description, reference_type, reference_id, created_by, items, party_type, party_id, is_posted = 0 } = params;

  const totalDebit = items.reduce((s, i) => s + (i.debit || 0), 0);
  const totalCredit = items.reduce((s, i) => s + (i.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry unbalanced: debit=${totalDebit}, credit=${totalCredit}`);
  }

  const { resolved, errors } = validateAccounts(db, items);
  if (errors.length > 0) {
    throw new Error(`Invalid accounts: ${errors.join('; ')}`);
  }

  const entryNumber = generateCode("JE", "journal_entries", "entry_number");
  const result = db.prepare(
    "INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id, created_by, is_posted, party_type, party_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(entryNumber, entry_date, description, reference_type || null, reference_id || null, created_by || null, is_posted, party_type || null, party_id || null);

  const entryId = result.lastInsertRowid;
  const insertItem = db.prepare(
    "INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit, analytic_account_id) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const updateDebit = db.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?");
  const updateCredit = db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?");

  const trx = db.transaction(() => {
    for (const item of resolved) {
      insertItem.run(entryId, item._id, item.description || null, item.debit || 0, item.credit || 0, item.analytic_account_id || null);
      if (item.debit > 0) updateDebit.run(item.debit, item._id);
      if (item.credit > 0) updateCredit.run(item.credit, item._id);
    }
  });
  trx();

  return entryId as number;
}

export function reverseJournalEntry(db: Database.Database, entryId: number | bigint, description?: string): number | null {
  const original = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(entryId) as any;
  if (!original) return null;

  const originalItems = db.prepare("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?").all(entryId) as any[];

  const items: JournalItem[] = originalItems.map((oi: any) => ({
    account_id: oi.account_id,
    description: oi.description,
    debit: oi.credit,
    credit: oi.debit,
  }));

  return createJournalEntry({
    db,
    entry_date: new Date().toISOString().split('T')[0],
    description: description || `عكس ${original.entry_number}`,
    reference_type: original.reference_type,
    reference_id: original.reference_id,
    created_by: original.created_by,
    party_type: original.party_type,
    party_id: original.party_id,
    items,
    is_posted: 1, // Reversals are posted immediately
  });
}

export function reverseJournalEntriesByReference(
  db: Database.Database,
  reference_type: string,
  reference_id: number | bigint,
  description?: string
): number {
  const entries = db.prepare(
    "SELECT id FROM journal_entries WHERE reference_type = ? AND reference_id = ?"
  ).all(reference_type, reference_id) as any[];

  let reversed = 0;
  for (const entry of entries) {
    const result = reverseJournalEntry(db, entry.id, description);
    if (result) reversed++;
  }
  return reversed;
}
