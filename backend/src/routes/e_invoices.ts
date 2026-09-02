import { Router, Response } from 'express';
import { query, queryOne, logActivityAsync } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { buildZatcaQR, buildEInvoiceXML, toZatcaTimestamp, toDecimal } from '../utils/zatca';

const router = Router();
router.use(authenticate);

router.get('/invoices/:id/einvoice', async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT si.*, c.name as client_name, c.tax_number as client_tax, c.address as client_address, c.city as client_city FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id WHERE si.id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = await query("SELECT sii.*, i.name as item_name, i.code as item_code FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?", [req.params.id]);
    const company = (await queryOne('SELECT * FROM company_info LIMIT 1') as any) || {};
    const vatRow = await queryOne("SELECT setting_value FROM settings WHERE setting_key = 'vat_number'") as any;
    const vatNumber = company.tax_number || vatRow?.setting_value || '';
    const timestamp = toZatcaTimestamp(invoice.invoice_date);
    const total = toDecimal(invoice.total);
    const vat = toDecimal(invoice.tax);
    const qr = buildZatcaQR({ seller_name: company.name || company.name_en || '', seller_vat_number: vatNumber, timestamp, total, vat_amount: vat, buyer_name: invoice.client_name || undefined, buyer_vat_number: invoice.client_tax || undefined });
    const xml = buildEInvoiceXML({ company: { name: company.name || '', name_en: company.name_en || '', address: company.address || '', city: company.city || '', tax_number: vatNumber, commercial_registry: company.commercial_registry || '' }, invoice: { invoice_number: invoice.invoice_number, issue_date: invoice.invoice_date, total: invoice.total, tax: invoice.tax, discount: invoice.discount || 0, subtotal: invoice.subtotal || 0, currency: invoice.currency_code || 'IQD' }, client: invoice.client_id ? { name: invoice.client_name || '', tax_number: invoice.client_tax || '', address: invoice.client_address || '', city: invoice.client_city || '' } : undefined, items: (invoice.items || []).map((it: any) => ({ name: it.item_name || '', quantity: it.quantity, unit_price: it.unit_price, total: it.total })) });
    void logActivityAsync(req.user!.id, 'generate_einvoice', 'sales_invoice', parseInt(req.params.id), 'توليد فاتورة إلكترونية');
    res.json({ invoice_id: invoice.id, invoice_number: invoice.invoice_number, qr_base64: qr.base64, qr_svg: qr.svg, qr_tlv_hex: qr.tlv_hex, xml, summary: { seller_name: company.name, vat_number: vatNumber, timestamp, total, vat } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/invoices/:id/einvoice/xml', async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne("SELECT si.*, c.name as client_name, c.tax_number as client_tax, c.address as client_address, c.city as client_city FROM sales_invoices si LEFT JOIN clients c ON si.client_id = c.id WHERE si.id = ?", [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    invoice.items = await query("SELECT sii.*, i.name as item_name, i.code as item_code FROM sales_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.sales_invoice_id = ?", [req.params.id]);
    const company = (await queryOne('SELECT * FROM company_info LIMIT 1') as any) || {};
    const vatRow = await queryOne("SELECT setting_value FROM settings WHERE setting_key = 'vat_number'") as any;
    const vatNumber = company.tax_number || vatRow?.setting_value || '';
    const xml = buildEInvoiceXML({ company: { name: company.name || '', name_en: company.name_en || '', address: company.address || '', city: company.city || '', tax_number: vatNumber, commercial_registry: company.commercial_registry || '' }, invoice: { invoice_number: invoice.invoice_number, issue_date: invoice.invoice_date, total: invoice.total, tax: invoice.tax, discount: invoice.discount || 0, subtotal: invoice.subtotal || 0, currency: invoice.currency || 'SAR' }, client: invoice.client_id ? { name: invoice.client_name || '', tax_number: invoice.client_tax || '', address: invoice.client_address || '', city: invoice.client_city || '' } : undefined, items: (invoice.items || []).map((it: any) => ({ name: it.item_name || '', quantity: it.quantity, unit_price: it.unit_price, total: it.total })) });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.xml"`);
    res.send(xml);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
