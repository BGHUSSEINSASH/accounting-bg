import { Router, Response } from "express";
import { getDatabase } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";
import { logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get("/statements/:bankAccountId", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20, is_reconciled } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = "SELECT * FROM bank_statements WHERE bank_account_id = ?";
    const params: any[] = [req.params.bankAccountId];
    if (is_reconciled !== undefined) {
      query += " AND is_reconciled = ?";
      params.push(is_reconciled === "1" || is_reconciled === "true" ? 1 : 0);
    }
    const total = (db.prepare(query.replace("SELECT *", "SELECT COUNT(*) as total")).get(...params) as any).total;
    query += " ORDER BY statement_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const statements = db.prepare(query).all(...params);
    res.json({ statements, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/statements/upload", (req: AuthRequest, res: Response) => {
  try {
    const { bank_account_id, entries } = req.body;
    if (!entries || entries.length === 0) return res.status(400).json({ error: "No entries provided" });
    const db = getDatabase();
    const insert = db.prepare("INSERT INTO bank_statements (bank_account_id, statement_date, reference, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const trx = db.transaction(() => {
      for (const entry of entries) {
        insert.run(bank_account_id, entry.statement_date, entry.reference || null, entry.description || null, entry.debit || 0, entry.credit || 0, entry.balance || 0);
      }
    });
    trx();
    logActivity(req.user!.id, "upload_bank_statements", "bank_statement");
    res.json({ message: "Statements uploaded", count: entries.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reconcile/:bankAccountId", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const account = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(req.params.bankAccountId) as any;
    if (!account) return res.status(404).json({ error: "Bank account not found" });
    const total = (db.prepare("SELECT COUNT(*) as count FROM bank_statements WHERE bank_account_id = ?").get(req.params.bankAccountId) as any).count;
    const reconciled = (db.prepare("SELECT COUNT(*) as count FROM bank_statements WHERE bank_account_id = ? AND is_reconciled = 1").get(req.params.bankAccountId) as any).count;
    const unmatched = total - reconciled;
    const firstStatement = db.prepare("SELECT balance FROM bank_statements WHERE bank_account_id = ? ORDER BY statement_date ASC, id ASC LIMIT 1").get(req.params.bankAccountId) as any;
    const lastStatement = db.prepare("SELECT balance FROM bank_statements WHERE bank_account_id = ? ORDER BY statement_date DESC, id DESC LIMIT 1").get(req.params.bankAccountId) as any;
    res.json({
      total_statements: total,
      reconciled_count: reconciled,
      unmatched_count: unmatched,
      opening_balance: firstStatement ? firstStatement.balance - (firstStatement.debit || 0) + (firstStatement.credit || 0) : 0,
      closing_balance: lastStatement ? lastStatement.balance : 0
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/reconcile/match", (req: AuthRequest, res: Response) => {
  try {
    const { bank_statement_id, journal_entry_id } = req.body;
    const db = getDatabase();
    const statement = db.prepare("SELECT * FROM bank_statements WHERE id = ?").get(bank_statement_id) as any;
    if (!statement) return res.status(404).json({ error: "Bank statement not found" });
    if (statement.is_reconciled) return res.status(400).json({ error: "Already reconciled" });
    const entry = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(journal_entry_id) as any;
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    const trx = db.transaction(() => {
      db.prepare("INSERT INTO reconciliation_items (bank_account_id, reconciliation_date, bank_statement_id, journal_entry_id, is_matched) VALUES (?, ?, ?, ?, 1)")
        .run(statement.bank_account_id, new Date().toISOString().split("T")[0], bank_statement_id, journal_entry_id);
      db.prepare("UPDATE bank_statements SET is_reconciled = 1 WHERE id = ?").run(bank_statement_id);
    });
    trx();
    logActivity(req.user!.id, "match_reconciliation", "reconciliation_item");
    res.json({ message: "Matched successfully" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/reconcile/unmatch/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const item = db.prepare("SELECT * FROM reconciliation_items WHERE id = ?").get(req.params.id) as any;
    if (!item) return res.status(404).json({ error: "Reconciliation item not found" });
    const trx = db.transaction(() => {
      db.prepare("DELETE FROM reconciliation_items WHERE id = ?").run(req.params.id);
      db.prepare("UPDATE bank_statements SET is_reconciled = 0 WHERE id = ?").run(item.bank_statement_id);
    });
    trx();
    logActivity(req.user!.id, "unmatch_reconciliation", "reconciliation_item", parseInt(req.params.id));
    res.json({ message: "Unmatched successfully" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reconcile/suggestions/:bankAccountId", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const account = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(req.params.bankAccountId) as any;
    if (!account) return res.status(404).json({ error: "Bank account not found" });
    const statements = db.prepare("SELECT * FROM bank_statements WHERE bank_account_id = ? AND is_reconciled = 0 ORDER BY statement_date ASC").all(req.params.bankAccountId);
    const entries = db.prepare(`
      SELECT je.* FROM journal_entries je
      JOIN journal_entry_items jei ON je.id = jei.journal_entry_id
      JOIN accounts a ON jei.account_id = a.id
      WHERE a.name LIKE ? AND je.is_posted = 1
      GROUP BY je.id
      ORDER BY je.entry_date ASC
    `).all(`%${account.account_name}%`);
    res.json({ unmatched_statements: statements, unmatched_entries: entries, matched_items: [], suggestions: [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/statements/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM bank_statements WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_bank_statement", "bank_statement", parseInt(req.params.id));
    res.json({ message: "Bank statement deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
