import { Router, Response } from 'express';
import { queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const totalAssets = (await queryOne("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'asset'") as any)?.total || 0;
    const currentAssets = (await queryOne("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'asset' AND code >= '11' AND code < '15'") as any)?.total || 0;
    const inventory = (await queryOne("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'asset' AND (code LIKE '1.3%' OR name LIKE '%inventory%' OR name LIKE '%مخزون%')") as any)?.total || 0;
    const totalLiabilities = (await queryOne("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'liability'") as any)?.total || 0;
    const currentLiabilities = (await queryOne("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'liability' AND code >= '21' AND code < '22'") as any)?.total || 0;
    const equity = (await queryOne("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE type = 'equity'") as any)?.total || 0;
    const monthlySales = (await queryOne("SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE invoice_date >= NOW() - INTERVAL '30 days'") as any)?.total || 0;
    const prevMonthSales = (await queryOne("SELECT COALESCE(SUM(total), 0) as total FROM sales_invoices WHERE invoice_date >= NOW() - INTERVAL '60 days' AND invoice_date < NOW() - INTERVAL '30 days'") as any)?.total || 0;
    const monthlyCost = (await queryOne("SELECT COALESCE(SUM(total), 0) as total FROM purchase_invoices WHERE invoice_date >= NOW() - INTERVAL '30 days'") as any)?.total || 0;
    const monthlyExpenses = (await queryOne("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date >= NOW() - INTERVAL '30 days' AND status = 'approved'") as any)?.total || 0;
    const grossProfit = monthlySales - monthlyCost;
    const netProfit = grossProfit - monthlyExpenses;
    const currentRatio = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : 0;
    const profitMargin = monthlySales > 0 ? (netProfit / monthlySales) * 100 : 0;
    const grossMargin = monthlySales > 0 ? (grossProfit / monthlySales) * 100 : 0;
    const debtToEquity = equity > 0 ? (totalLiabilities / equity) : 0;
    const roa = totalAssets > 0 ? (netProfit / totalAssets) * 100 : 0;
    const roe = equity > 0 ? (netProfit / equity) * 100 : 0;
    const salesGrowth = prevMonthSales > 0 ? ((monthlySales - prevMonthSales) / prevMonthSales) * 100 : 0;
    const expenseRatio = monthlySales > 0 ? (monthlyExpenses / monthlySales) * 100 : 0;
    const quickRatioVal = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
    res.json({
      currentRatio: { value: currentRatio.toFixed(2), status: currentRatio >= 1.5 ? 'good' : currentRatio >= 1 ? 'warning' : 'danger' },
      quickRatio: { value: quickRatioVal.toFixed(2), status: quickRatioVal >= 1 ? 'good' : quickRatioVal >= 0.5 ? 'warning' : 'danger' },
      profitMargin: { value: profitMargin.toFixed(1), status: profitMargin > 0 ? 'good' : 'danger', suffix: '%' },
      grossMargin: { value: grossMargin.toFixed(1), status: grossMargin > 20 ? 'good' : grossMargin > 10 ? 'warning' : 'danger', suffix: '%' },
      netProfit: { value: netProfit.toFixed(2), status: netProfit >= 0 ? 'good' : 'danger' },
      monthlySales: { value: monthlySales.toFixed(2), status: 'info' },
      monthlyCost: { value: monthlyCost.toFixed(2), status: 'info' },
      monthlyExpenses: { value: monthlyExpenses.toFixed(2), status: 'info' },
      debtToEquity: { value: debtToEquity.toFixed(2), status: debtToEquity < 1 ? 'good' : debtToEquity < 2 ? 'warning' : 'danger' },
      roa: { value: roa.toFixed(1), status: roa > 5 ? 'good' : roa > 0 ? 'warning' : 'danger', suffix: '%' },
      roe: { value: roe.toFixed(1), status: roe > 10 ? 'good' : roe > 0 ? 'warning' : 'danger', suffix: '%' },
      salesGrowth: { value: salesGrowth.toFixed(1), status: salesGrowth > 0 ? 'good' : 'danger', suffix: '%' },
      expenseRatio: { value: expenseRatio.toFixed(1), status: expenseRatio < 50 ? 'good' : expenseRatio < 80 ? 'warning' : 'danger', suffix: '%' },
      totalAssets: { value: totalAssets.toFixed(2), status: 'info' },
      totalLiabilities: { value: totalLiabilities.toFixed(2), status: 'info' },
      equity: { value: equity.toFixed(2), status: 'info' },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
