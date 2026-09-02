import { Router, Response } from "express";
import { query, queryOne, execute, logActivityAsync } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const countRow = await queryOne("SELECT COUNT(*) as total FROM bank_accounts WHERE is_active = 1") as any;
    const total = countRow?.total ?? 0;
    const accounts = await query("SELECT * FROM bank_accounts WHERE is_active = 1 ORDER BY account_name LIMIT ? OFFSET ?", [Number(limit), offset]);
    res.json({ accounts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const account = await queryOne("SELECT * FROM bank_accounts WHERE id = ?", [req.params.id]);
    if (!account) return res.status(404).json({ error: "Bank account not found" });
    res.json(account);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { account_name, bank_name, account_number, iban, currency, opening_balance, current_balance } = req.body;
    await execute("INSERT INTO bank_accounts (account_name, bank_name, account_number, iban, currency, opening_balance, current_balance) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [account_name, bank_name, account_number, iban || null, currency || "SAR", opening_balance || 0, current_balance || opening_balance || 0]);
    void logActivityAsync(req.user!.id, "create_bank_account", "bank_account");
    res.json({ message: "Bank account created" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { account_name, bank_name, account_number, iban, currency, opening_balance, current_balance, is_active } = req.body;
    await execute("UPDATE bank_accounts SET account_name = COALESCE(?, account_name), bank_name = COALESCE(?, bank_name), account_number = COALESCE(?, account_number), iban = COALESCE(?, iban), currency = COALESCE(?, currency), opening_balance = COALESCE(?, opening_balance), current_balance = COALESCE(?, current_balance), is_active = COALESCE(?, is_active) WHERE id = ?",
      [account_name, bank_name, account_number, iban, currency, opening_balance, current_balance, is_active, req.params.id]);
    void logActivityAsync(req.user!.id, "update_bank_account", "bank_account", parseInt(req.params.id));
    res.json({ message: "Bank account updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await execute("UPDATE bank_accounts SET is_active = 0 WHERE id = ?", [req.params.id]);
    void logActivityAsync(req.user!.id, "delete_bank_account", "bank_account", parseInt(req.params.id));
    res.json({ message: "Bank account deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
