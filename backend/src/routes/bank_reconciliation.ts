import { Router, Response } from "express";
import { query, queryOne, execute, withTransaction, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/statements/:bankAccountId", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, is_reconciled } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = "SELECT * FROM bank_statements WHERE bank_account_id = ?";
    const params: any[] = [req.params.bankAccountId];
    if (is_reconciled !== undefined) {
      sql += " AND is_reconciled = ?";
      params.push(is_reconciled === "1" || is_reconciled === "true" ? 1 : 0);
    }
    const countRow = await queryOne(sql.replace("SELECT *", "SELECT COUNT(*) as total"), params) as any;
    const total = countRow?.total ?? 0;
    sql += " ORDER BY statement_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), offset);
    const statements = await query(sql, params);
    res.json({ statements, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/statements/upload", async (req: AuthRequest, res: Response) => {
  try {
    const { bank_account_id, entries } = req.body;
    if (!entries || entries.length === 0) return res.status(400).json({ error: "No entries provided" });
    await withTransaction(async (client) => {
      for (const entry of entries) {
        await client.query("INSERT INTO bank_statements (bank_account_id, statement_date, reference, description, debit, credit, balance) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [bank_account_id, entry.statement_date, entry.reference || null, entry.description || null, entry.debit || 0, entry.credit || 0, entry.balance || 0]);
      }
    });
    void logActivityAsync(req.user!.id, "upload_bank_statements", "bank_statement");
    res.json({ message: "Statements uploaded", count: entries.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reconcile/:bankAccountId", async (req: AuthRequest, res: Response) => {
  try {
    const account = await queryOne("SELECT * FROM bank_accounts WHERE id = ?", [req.params.bankAccountId]) as any;
    if (!account) return res.status(404).json({ error: "Bank account not found" });
    const totalRow = await queryOne("SELECT COUNT(*) as count FROM bank_statements WHERE bank_account_id = ?", [req.params.bankAccountId]) as any;
    const reconRow = await queryOne("SELECT COUNT(*) as count FROM bank_statements WHERE bank_account_id = ? AND is_reconciled = 1", [req.params.bankAccountId]) as any;
    const total = totalRow?.count ?? 0;
    const reconciled = reconRow?.count ?? 0;
    const unmatched = total - reconciled;
    const firstStatement = await queryOne("SELECT balance FROM bank_statements WHERE bank_account_id = ? ORDER BY statement_date ASC, id ASC LIMIT 1", [req.params.bankAccountId]) as any;
    const lastStatement = await queryOne("SELECT balance FROM bank_statements WHERE bank_account_id = ? ORDER BY statement_date DESC, id DESC LIMIT 1", [req.params.bankAccountId]) as any;
    res.json({
      total_statements: total,
      reconciled_count: reconciled,
      unmatched_count: unmatched,
      opening_balance: firstStatement ? firstStatement.balance - (firstStatement.debit || 0) + (firstStatement.credit || 0) : 0,
      closing_balance: lastStatement ? lastStatement.balance : 0
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/reconcile/match", async (req: AuthRequest, res: Response) => {
  try {
    const { bank_statement_id, journal_entry_id } = req.body;
    const statement = await queryOne("SELECT * FROM bank_statements WHERE id = ?", [bank_statement_id]) as any;
    if (!statement) return res.status(404).json({ error: "Bank statement not found" });
    if (statement.is_reconciled) return res.status(400).json({ error: "Already reconciled" });
    const entry = await queryOne("SELECT * FROM journal_entries WHERE id = ?", [journal_entry_id]) as any;
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    await withTransaction(async (client) => {
      await client.query("INSERT INTO reconciliation_items (bank_account_id, reconciliation_date, bank_statement_id, journal_entry_id, is_matched) VALUES ($1,$2,$3,$4,1)",
        [statement.bank_account_id, new Date().toISOString().split("T")[0], bank_statement_id, journal_entry_id]);
      await client.query("UPDATE bank_statements SET is_reconciled = 1 WHERE id = $1", [bank_statement_id]);
    });
    void logActivityAsync(req.user!.id, "match_reconciliation", "reconciliation_item");
    res.json({ message: "Matched successfully" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/reconcile/unmatch/:id", async (req: AuthRequest, res: Response) => {
  try {
    const item = await queryOne("SELECT * FROM reconciliation_items WHERE id = ?", [req.params.id]) as any;
    if (!item) return res.status(404).json({ error: "Reconciliation item not found" });
    await withTransaction(async (client) => {
      await client.query("DELETE FROM reconciliation_items WHERE id = $1", [req.params.id]);
      await client.query("UPDATE bank_statements SET is_reconciled = 0 WHERE id = $1", [item.bank_statement_id]);
    });
    void logActivityAsync(req.user!.id, "unmatch_reconciliation", "reconciliation_item", parseInt(req.params.id));
    res.json({ message: "Unmatched successfully" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reconcile/suggestions/:bankAccountId", async (req: AuthRequest, res: Response) => {
  try {
    const account = await queryOne("SELECT * FROM bank_accounts WHERE id = ?", [req.params.bankAccountId]) as any;
    if (!account) return res.status(404).json({ error: "Bank account not found" });
    const statements = await query("SELECT * FROM bank_statements WHERE bank_account_id = ? AND is_reconciled = 0 ORDER BY statement_date ASC", [req.params.bankAccountId]);
    const entries = await query(`
      SELECT je.* FROM journal_entries je
      JOIN journal_entry_items jei ON je.id = jei.journal_entry_id
      JOIN accounts a ON jei.account_id = a.id
      WHERE a.name LIKE ? AND je.is_posted = 1
      GROUP BY je.id
      ORDER BY je.entry_date ASC
    `, [`%${account.account_name}%`]);
    res.json({ unmatched_statements: statements, unmatched_entries: entries, matched_items: [], suggestions: [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/statements/:id", async (req: AuthRequest, res: Response) => {
  try {
    await execute("DELETE FROM bank_statements WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_bank_statement", "bank_statement", parseInt(req.params.id));
    res.json({ message: "Bank statement deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
