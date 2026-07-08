import { Router, Response } from 'express';
import { getDatabase } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateCode, logActivity } from '../utils/helpers';

const router = Router();
router.use(authenticate);

router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const total = (db.prepare("SELECT COUNT(*) as total FROM accounts").get() as any).total;
    const accounts = db.prepare("SELECT * FROM accounts ORDER BY code LIMIT ? OFFSET ?").all(Number(limit), offset);
    res.json({ accounts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/trial-balance", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { as_of } = req.query;
    const accounts = db.prepare("SELECT * FROM accounts WHERE is_active = 1 ORDER BY code").all() as any[];
    const result = accounts.map(a => ({
      ...a,
      debit_balance: a.balance > 0 ? a.balance : 0,
      credit_balance: a.balance < 0 ? Math.abs(a.balance) : 0
    }));
    const totalDebit = result.reduce((s, r) => s + r.debit_balance, 0);
    const totalCredit = result.reduce((s, r) => s + r.credit_balance, 0);
    res.json({ accounts: result, total_debit: totalDebit, total_credit: totalCredit, as_of: as_of || new Date().toISOString().split("T")[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/income-statement", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    let incomeQuery = "SELECT a.*, COALESCE(SUM(jei.credit - jei.debit), 0) as period_balance FROM accounts a LEFT JOIN journal_entry_items jei ON jei.account_id = a.id LEFT JOIN journal_entries je ON je.id = jei.journal_entry_id AND je.is_posted = 1 WHERE a.type = 'income' AND a.is_active = 1";
    let expenseQuery = "SELECT a.*, COALESCE(SUM(jei.debit - jei.credit), 0) as period_balance FROM accounts a LEFT JOIN journal_entry_items jei ON jei.account_id = a.id LEFT JOIN journal_entries je ON je.id = jei.journal_entry_id AND je.is_posted = 1 WHERE a.type = 'expense' AND a.is_active = 1";
    const incomeParams: any[] = [];
    const expenseParams: any[] = [];
    if (from) { incomeQuery += " AND je.entry_date >= ?"; expenseQuery += " AND je.entry_date >= ?"; incomeParams.push(from); expenseParams.push(from); }
    if (to) { incomeQuery += " AND je.entry_date <= ?"; expenseQuery += " AND je.entry_date <= ?"; incomeParams.push(to); expenseParams.push(to); }
    incomeQuery += " GROUP BY a.id ORDER BY a.code";
    expenseQuery += " GROUP BY a.id ORDER BY a.code";
    const incomeAccounts = db.prepare(incomeQuery).all(...incomeParams);
    const expenseAccounts = db.prepare(expenseQuery).all(...expenseParams);
    const totalIncome = incomeAccounts.reduce((s: number, a: any) => s + a.period_balance, 0);
    const totalExpense = expenseAccounts.reduce((s: number, a: any) => s + a.period_balance, 0);
    res.json({
      income: incomeAccounts,
      expense: expenseAccounts,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_profit: totalIncome - totalExpense,
      from: from || "All time",
      to: to || new Date().toISOString().split("T")[0]
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/balance-sheet", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { as_of } = req.query;
    let assetQuery: string, liabilityQuery: string, equityQuery: string;
    if (as_of) {
      assetQuery = "SELECT a.*, COALESCE((SELECT SUM(jei.debit - jei.credit) FROM journal_entry_items jei JOIN journal_entries je ON je.id = jei.journal_entry_id WHERE jei.account_id = a.id AND je.is_posted = 1 AND je.entry_date <= ?), 0) as balance FROM accounts a WHERE a.type = 'asset' AND a.is_active = 1 ORDER BY a.code";
      liabilityQuery = "SELECT a.*, COALESCE((SELECT SUM(jei.credit - jei.debit) FROM journal_entry_items jei JOIN journal_entries je ON je.id = jei.journal_entry_id WHERE jei.account_id = a.id AND je.is_posted = 1 AND je.entry_date <= ?), 0) as balance FROM accounts a WHERE a.type = 'liability' AND a.is_active = 1 ORDER BY a.code";
      equityQuery = "SELECT a.*, COALESCE((SELECT SUM(jei.credit - jei.debit) FROM journal_entry_items jei JOIN journal_entries je ON je.id = jei.journal_entry_id WHERE jei.account_id = a.id AND je.is_posted = 1 AND je.entry_date <= ?), 0) as balance FROM accounts a WHERE a.type = 'equity' AND a.is_active = 1 ORDER BY a.code";
    } else {
      assetQuery = "SELECT * FROM accounts WHERE type = 'asset' AND is_active = 1 ORDER BY code";
      liabilityQuery = "SELECT * FROM accounts WHERE type = 'liability' AND is_active = 1 ORDER BY code";
      equityQuery = "SELECT * FROM accounts WHERE type = 'equity' AND is_active = 1 ORDER BY code";
    }
    const assetAccounts = as_of ? db.prepare(assetQuery).all(as_of) : db.prepare(assetQuery).all();
    const liabilityAccounts = as_of ? db.prepare(liabilityQuery).all(as_of) : db.prepare(liabilityQuery).all();
    const equityAccounts = as_of ? db.prepare(equityQuery).all(as_of) : db.prepare(equityQuery).all();
    const totalAssets = assetAccounts.reduce((s: number, a: any) => s + Math.abs(a.balance), 0);
    const totalLiabilities = liabilityAccounts.reduce((s: number, a: any) => s + Math.abs(a.balance), 0);
    const totalEquity = equityAccounts.reduce((s: number, a: any) => s + Math.abs(a.balance), 0);
    res.json({
      assets: assetAccounts,
      liabilities: liabilityAccounts,
      equity: equityAccounts,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      total_liabilities_equity: totalLiabilities + totalEquity
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/ledger/:account_id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { from, to } = req.query;
    const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.account_id) as any;
    if (!account) return res.status(404).json({ error: "Account not found" });
    let query = "SELECT je.entry_date, je.entry_number, je.description as entry_desc, jei.debit, jei.credit, jei.description as item_desc FROM journal_entry_items jei JOIN journal_entries je ON jei.journal_entry_id = je.id WHERE jei.account_id = ? AND je.is_posted = 1";
    const params: any[] = [req.params.account_id];
    if (from) { query += " AND je.entry_date >= ?"; params.push(from); }
    if (to) { query += " AND je.entry_date <= ?"; params.push(to); }
    query += " ORDER BY je.entry_date ASC, je.id ASC";
    const transactions = db.prepare(query).all(...params);
    let runningBalance = 0;
    const items = transactions.map((t: any) => {
      runningBalance += (t.debit || 0) - (t.credit || 0);
      return { ...t, balance: runningBalance };
    });
    res.json({ account, transactions: items, opening_balance: account.balance - runningBalance, closing_balance: account.balance });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/journal/entries", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, from, to } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT * FROM journal_entries WHERE 1=1";
    const params: any[] = [];
    if (from) { query += " AND entry_date >= ?"; params.push(from); }
    if (to) { query += " AND entry_date <= ?"; params.push(to); }
    query += " ORDER BY entry_date DESC, created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const entries = db.prepare(query).all(...params);
    const countResult = db.prepare("SELECT COUNT(*) as total FROM journal_entries").get() as any;
    res.json({ entries, total: countResult.total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/journal/entries", authorize("admin", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const { entry_date, description, items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item required" });
    const totalDebit = items.reduce((s: number, i: any) => s + Number(i.debit || 0), 0);
    const totalCredit = items.reduce((s: number, i: any) => s + Number(i.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(400).json({ error: "Debit and credit must be equal" });
    const db = getDatabase();
    const entryNumber = generateCode("JE", "journal_entries", "entry_number");
    const insertEntry = db.transaction(() => {
      const result = db.prepare("INSERT INTO journal_entries (entry_number, entry_date, description, created_by, is_posted) VALUES (?, ?, ?, ?, 0)")
        .run(entryNumber, entry_date, description, req.user!.id);
      const insertItem = db.prepare("INSERT INTO journal_entry_items (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)");
      for (const item of items) {
        insertItem.run(result.lastInsertRowid, item.account_id, item.description || null, item.debit || 0, item.credit || 0);
      }
      return result.lastInsertRowid;
    });
    const entryId = insertEntry();
    logActivity(req.user!.id, "create_journal_entry", "journal_entry", entryId as number);
    res.json({ message: "Journal entry created", id: entryId, entry_number: entryNumber });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/journal/entries/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const entry = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(req.params.id) as any;
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    entry.items = db.prepare("SELECT jei.*, a.name as account_name, a.code as account_code FROM journal_entry_items jei JOIN accounts a ON jei.account_id = a.id WHERE jei.journal_entry_id = ?").all(req.params.id);
    res.json(entry);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/journal/entries/:id/post", authorize("admin", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const entry = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(req.params.id) as any;
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    if (entry.is_posted) return res.status(400).json({ error: "Entry already posted" });
    const items = db.prepare("SELECT * FROM journal_entry_items WHERE journal_entry_id = ?").all(req.params.id) as any[];
    const updateBalance = db.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?");
    const updateBalanceNeg = db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?");
    const trx = db.transaction(() => {
      for (const item of items) {
        if (item.debit > 0) {
          updateBalance.run(item.debit, item.account_id);
        }
        if (item.credit > 0) {
          updateBalanceNeg.run(item.credit, item.account_id);
        }
      }
      db.prepare("UPDATE journal_entries SET is_posted = 1, posted_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    });
    trx();
    logActivity(req.user!.id, "post_journal_entry", "journal_entry", parseInt(req.params.id));
    res.json({ message: "Entry posted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.id);
    if (!account) return res.status(404).json({ error: "Account not found" });
    res.json(account);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", authorize("admin", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const { code, name, name_en, type, parent_id } = req.body;
    const db = getDatabase();
    let accountCode = code;
    if (!accountCode) {
      accountCode = generateCode("", "accounts", "code");
    }
    const parentLevel = parent_id ? (db.prepare("SELECT level FROM accounts WHERE id = ?").get(parent_id) as any)?.level || 0 : -1;
    db.prepare("INSERT INTO accounts (code, name, name_en, type, parent_id, level) VALUES (?, ?, ?, ?, ?, ?)")
      .run(accountCode, name, name_en || null, type, parent_id || null, parentLevel + 1);
    logActivity(req.user!.id, "create_account", "account");
    res.json({ message: "Account created", code: accountCode });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/:id", authorize("admin", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const { name, name_en, is_active } = req.body;
    const db = getDatabase();
    db.prepare("UPDATE accounts SET name = COALESCE(?, name), name_en = COALESCE(?, name_en), is_active = COALESCE(?, is_active) WHERE id = ?")
      .run(name, name_en, is_active, req.params.id);
    logActivity(req.user!.id, "update_account", "account", parseInt(req.params.id));
    res.json({ message: "Account updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", authorize("admin", "accountant"), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const hasChildren = db.prepare("SELECT COUNT(*) as count FROM accounts WHERE parent_id = ?").get(req.params.id) as any;
    if (hasChildren.count > 0) return res.status(400).json({ error: "Cannot delete account with sub-accounts" });
    db.prepare("DELETE FROM accounts WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_account", "account", parseInt(req.params.id));
    res.json({ message: "Account deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
