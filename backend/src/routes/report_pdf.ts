import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { queryOne } from '../config/database';
import PDFDocument from 'pdfkit';

const router = Router();

router.get('/sales/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await queryOne(`SELECT si.*, c.name as client_name, c.phone as client_phone, c.tax_number as client_tax, u.full_name as sales_rep_name FROM sales_invoices si LEFT JOIN clients c ON c.id = si.client_id LEFT JOIN users u ON u.id = si.sales_rep_id WHERE si.id = ?`, [req.params.id]) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const { query } = await import('../config/database');
    const items = await query(`SELECT sii.*, i.name as item_name FROM sales_invoice_items sii JOIN items i ON i.id = sii.item_id WHERE sii.sales_invoice_id = ?`, [req.params.id]);
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoice_number}.pdf`);
    doc.pipe(res);
    const company = await queryOne('SELECT * FROM company_info LIMIT 1') as any;
    doc.fontSize(20).font('Helvetica-Bold').text(company?.name || 'Company Name', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica');
    doc.text(`Invoice: ${invoice.invoice_number}`, { align: 'left' });
    doc.text(`Date: ${invoice.created_at}`, { align: 'left' });
    doc.text(`Client: ${invoice.client_name || 'N/A'}`, { align: 'left' });
    doc.text(`Sales Rep: ${invoice.sales_rep_name || 'N/A'}`, { align: 'left' });
    doc.moveDown();
    doc.font('Helvetica-Bold');
    doc.text('Item', 50, doc.y, { width: 200, continued: true });
    doc.text('Qty', 250, doc.y, { width: 50, continued: true });
    doc.text('Price', 300, doc.y, { width: 80, continued: true });
    doc.text('Total', 400, doc.y, { width: 80 });
    doc.moveDown(0.5);
    doc.font('Helvetica');
    let total = 0;
    items.forEach((item: any) => {
      const lineTotal = item.quantity * item.unit_price;
      total += lineTotal;
      doc.text(item.item_name || 'Item', 50, doc.y, { width: 200, continued: true });
      doc.text(String(item.quantity), 250, doc.y, { width: 50, continued: true });
      doc.text(String(item.unit_price), 300, doc.y, { width: 80, continued: true });
      doc.text(String(lineTotal.toFixed(2)), 400, doc.y, { width: 80 });
      doc.moveDown(0.3);
    });
    doc.moveDown();
    doc.font('Helvetica-Bold');
    doc.text(`Total: ${total.toFixed(2)}`, { align: 'right' });
    doc.end();
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/custom', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { title, columns, data } = req.body;
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=report.pdf`);
    doc.pipe(res);
    doc.fontSize(20).font('Helvetica-Bold').text(title || 'Report', { align: 'center' });
    doc.moveDown();
    if (columns && data && data.length > 0) {
      const colWidth = 450 / columns.length;
      doc.font('Helvetica-Bold');
      columns.forEach((col: string) => { doc.text(col, 50 + (columns.indexOf(col) * colWidth), doc.y, { width: colWidth, continued: true }); });
      doc.moveDown(0.5);
      doc.font('Helvetica');
      data.forEach((row: any) => {
        const y = doc.y;
        columns.forEach((col: string) => { doc.text(String(row[col] || ''), 50 + (columns.indexOf(col) * colWidth), y, { width: colWidth, continued: true }); });
        doc.moveDown(0.3);
      });
    } else {
      doc.text('No data available');
    }
    doc.end();
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
