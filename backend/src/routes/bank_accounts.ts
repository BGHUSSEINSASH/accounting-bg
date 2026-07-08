import { Router, Response } from "express";
import { getDatabase } from "../config/database";
import { authenticate } from "../middleware/auth";
import { AuthRequest } from "../types";
import { logActivity } from "../utils/helpers";

const router = Router();
router.use(authenticate);

router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const total = (db.prepare("SELECT COUNT(*) as total FROM bank_accounts WHERE is_active = 1").get() as any).total;
    const accounts = db.prepare("SELECT * FROM bank_accounts WHERE is_active = 1 ORDER BY account_name LIMIT ? OFFSET ?").all(Number(limit), offset);
    res.json({ accounts, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const account = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(req.params.id);
    if (!account) return res.status(404).json({ error: "Bank account not found" });
    res.json(account);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { account_name, bank_name, account_number, iban, currency, opening_balance, current_balance } = req.body;
    const db = getDatabase();
    db.prepare("INSERT INTO bank_accounts (account_name, bank_name, account_number, iban, currency, opening_balance, current_balance) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(account_name, bank_name, account_number, iban || null, currency || "SAR", opening_balance || 0, current_balance || opening_balance || 0);
    logActivity(req.user!.id, "create_bank_account", "bank_account");
    res.json({ message: "Bank account created" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { account_name, bank_name, account_number, iban, currency, opening_balance, current_balance, is_active } = req.body;
    const db = getDatabase();
    db.prepare("UPDATE bank_accounts SET account_name = COALESCE(?, account_name), bank_name = COALESCE(?, bank_name), account_number = COALESCE(?, account_number), iban = COALESCE(?, iban), currency = COALESCE(?, currency), opening_balance = COALESCE(?, opening_balance), current_balance = COALESCE(?, current_balance), is_active = COALESCE(?, is_active) WHERE id = ?")
      .run(account_name, bank_name, account_number, iban, currency, opening_balance, current_balance, is_active, req.params.id);
    logActivity(req.user!.id, "update_bank_account", "bank_account", parseInt(req.params.id));
    res.json({ message: "Bank account updated" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare("UPDATE bank_accounts SET is_active = 0 WHERE id = ?").run(req.params.id);
    logActivity(req.user!.id, "delete_bank_account", "bank_account", parseInt(req.params.id));
    res.json({ message: "Bank account deleted" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
