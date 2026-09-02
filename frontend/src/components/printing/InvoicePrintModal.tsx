import { useEffect, useRef } from 'react';
import { X, Printer, FileText } from 'lucide-react';
import { useTranslation } from '../../i18n/context';
import { formatCurrency, formatDate } from '../../utils/format';

interface InvoiceData {
  id?: number;
  invoice_number?: string;
  invoice_date?: string;
  expense_date?: string;
  client_name?: string;
  client_phone?: string;
  client_address?: string;
  client_tax?: string;
  supplier_name?: string;
  supplier_phone?: string;
  supplier_address?: string;
  supplier_tax?: string;
  sales_rep_name?: string;
  paid_by_name?: string;
  account_name?: string;
  category?: string;
  description?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  amount?: number;
  paid_amount?: number;
  remaining_amount?: number;
  payment_status?: string;
  payment_method?: string;
  notes?: string;
  items?: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
}

const companyInfo = {
  name: localStorage.getItem('company_name') || '',
  nameEn: localStorage.getItem('company_name_en') || '',
  taxNumber: localStorage.getItem('company_tax_number') || '',
  phone: localStorage.getItem('company_phone') || '',
  address: localStorage.getItem('company_address') || '',
  currency: localStorage.getItem('currency_symbol') || 'د.ع',
};

function generateSmallReceiptHtml(data: InvoiceData): string {
  const itemsHtml = (data.items || []).map(item => `
    <tr>
      <td style="text-align:right;padding:2px 0">${item.item_name}</td>
      <td style="text-align:center;padding:2px 0">${item.quantity}</td>
      <td style="text-align:left;padding:2px 0">${formatCurrency(item.unit_price)}</td>
      <td style="text-align:left;padding:2px 0">${formatCurrency(item.total)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><title>فاتورة ${data.invoice_number}</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  body { font-family: 'Cairo', sans-serif; margin: 0; padding: 8px; width: 80mm; font-size: 11px; }
  .header { text-align: center; border-bottom: 1px dashed #333; padding-bottom: 8px; margin-bottom: 8px; }
  .header h2 { margin: 0; font-size: 14px; }
  .header p { margin: 2px 0; font-size: 10px; }
  .info { margin-bottom: 8px; font-size: 10px; }
  .info table { width: 100%; }
  .info td { padding: 1px 0; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.items th { border-bottom: 1px solid #333; padding: 4px 2px; font-size: 10px; }
  table.items td { padding: 2px; font-size: 10px; }
  .totals { width: 100%; margin-bottom: 8px; }
  .totals td { padding: 2px 0; font-size: 11px; }
  .totals .grand { font-weight: bold; font-size: 13px; border-top: 1px solid #333; padding-top: 4px; }
  .footer { text-align: center; font-size: 9px; border-top: 1px dashed #333; padding-top: 8px; margin-top: 8px; }
</style></head>
<body>
  <div class="header">
    <h2>${companyInfo.name}</h2>
    <p>${companyInfo.phone ? 'هاتف: ' + companyInfo.phone : ''}</p>
    <p>${companyInfo.address || ''}</p>
    ${companyInfo.taxNumber ? '<p>الرقم الضريبي: ' + companyInfo.taxNumber + '</p>' : ''}
  </div>
  <div class="info">
    <table>
      <tr><td><strong>رقم الفاتورة:</strong></td><td style="text-align:left">${data.invoice_number}</td></tr>
      <tr><td><strong>التاريخ:</strong></td><td style="text-align:left">${data.invoice_date}</td></tr>
      ${data.client_name ? `<tr><td><strong>العميل:</strong></td><td style="text-align:left">${data.client_name}</td></tr>` : ''}
      ${data.supplier_name ? `<tr><td><strong>المورد:</strong></td><td style="text-align:left">${data.supplier_name}</td></tr>` : ''}
      ${data.sales_rep_name ? `<tr><td><strong>مندوب المبيعات:</strong></td><td style="text-align:left">${data.sales_rep_name}</td></tr>` : ''}
    </table>
  </div>
  <table class="items">
    <thead><tr><th style="text-align:right">البيان</th><th style="text-align:center">الكمية</th><th style="text-align:left">السعر</th><th style="text-align:left">الإجمالي</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <table class="totals">
    <tr><td><strong>المجموع الفرعي:</strong></td><td style="text-align:left">${formatCurrency(data.subtotal ?? 0)}</td></tr>
    ${(data.discount ?? 0) > 0 ? `<tr><td><strong>الخصم:</strong></td><td style="text-align:left">${formatCurrency(data.discount ?? 0)}</td></tr>` : ''}
    ${(data.tax ?? 0) > 0 ? `<tr><td><strong>الضريبة:</strong></td><td style="text-align:left">${formatCurrency(data.tax ?? 0)}</td></tr>` : ''}
    <tr class="grand"><td><strong>الإجمالي الكلي:</strong></td><td style="text-align:left">${formatCurrency(data.total ?? 0)}</td></tr>
    <tr><td><strong>المدفوع:</strong></td><td style="text-align:left">${formatCurrency(data.paid_amount ?? 0)}</td></tr>
    ${(data.remaining_amount ?? 0) > 0 ? `<tr><td><strong>المتبقي:</strong></td><td style="text-align:left">${formatCurrency(data.remaining_amount ?? 0)}</td></tr>` : ''}
  </table>
  ${data.notes ? `<div style="margin-bottom:8px;font-size:10px;padding:4px;background:#f5f5f5;border-radius:4px"><strong>ملاحظات:</strong> ${data.notes}</div>` : ''}
  <div class="footer">
    <p>شكراً لتعاملكم معنا</p>
    <p style="font-size:8px;color:#666;">تم الإنشاء بواسطة النظام المحاسبي المتكامل</p>
  </div>
  <script>window.print();setTimeout(()=>window.close(),500);</script>
</body></html>`;
}

function generateLargeInvoiceHtml(data: InvoiceData): string {
  const itemsHtml = (data.items || []).map(item => `
    <tr>
      <td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd">${item.item_name}</td>
      <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd">${item.quantity}</td>
      <td style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;direction:ltr">${formatCurrency(item.unit_price)}</td>
      <td style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;direction:ltr">${formatCurrency(item.total)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><title>فاتورة ${data.invoice_number}</title>
<style>
  @page { margin: 20mm 15mm; }
  body { font-family: 'Cairo', sans-serif; margin: 0; padding: 20px; font-size: 13px; color: #333; }
  .invoice-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1e3a5f; padding-bottom:15px; margin-bottom:20px; }
  .company-info h1 { margin:0; font-size:22px; color:#1e3a5f; }
  .company-info p { margin:2px 0; font-size:11px; color:#666; }
  .invoice-title { text-align:left; }
  .invoice-title h2 { margin:0; font-size:18px; color:#1e3a5f; }
  .invoice-title .badge { display:inline-block; background:#1e3a5f; color:white; padding:3px 12px; border-radius:4px; font-size:12px; }
  .info-section { display:flex; justify-content:space-between; margin-bottom:20px; }
  .info-box { width:48%; }
  .info-box h3 { font-size:13px; color:#1e3a5f; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px; }
  .info-box p { margin:3px 0; font-size:12px; }
  .info-box .label { color:#888; }
  table.items { width:100%; border-collapse:collapse; margin-bottom:20px; }
  table.items thead { background:#1e3a5f; color:white; }
  table.items th { padding:8px; font-size:12px; }
  table.items tbody tr:nth-child(even) { background:#f9f9f9; }
  table.items td { padding:6px 8px; font-size:12px; border-bottom:1px solid #eee; }
  .summary-section { display:flex; justify-content:flex-end; margin-bottom:20px; }
  .summary-box { width:300px; }
  .summary-box table { width:100%; }
  .summary-box td { padding:4px 8px; font-size:13px; }
  .summary-box .grand-total td { font-size:16px; font-weight:bold; border-top:2px solid #1e3a5f; padding-top:8px; color:#1e3a5f; }
  .footer { border-top:1px solid #ddd; padding-top:15px; margin-top:20px; display:flex; justify-content:space-between; }
  .footer .signature { text-align:center; width:200px; }
  .footer .signature .line { border-top:1px solid #333; width:150px; margin:5px auto; padding-top:4px; font-size:11px; color:#666; }
  .notes-box { background:#f5f5f5; padding:10px; border-radius:6px; margin-bottom:15px; font-size:12px; }
</style></head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      <h1>${companyInfo.name}</h1>
      ${companyInfo.nameEn ? '<p style="direction:ltr">' + companyInfo.nameEn + '</p>' : ''}
      ${companyInfo.phone ? '<p>📞 ' + companyInfo.phone + '</p>' : ''}
      ${companyInfo.address ? '<p>📍 ' + companyInfo.address + '</p>' : ''}
      ${companyInfo.taxNumber ? '<p>🧾 الرقم الضريبي: ' + companyInfo.taxNumber + '</p>' : ''}
    </div>
    <div class="invoice-title">
      <span class="badge">فاتورة ${data.client_name ? 'مبيعات' : 'مشتريات'}</span>
      <h2>${data.invoice_number}</h2>
      <p style="margin-top:4px;color:#666;font-size:12px">التاريخ: ${data.invoice_date}</p>
    </div>
  </div>

  <div class="info-section">
    <div class="info-box">
      ${data.client_name ? `
        <h3>بيانات العميل</h3>
        <p><span class="label">الاسم:</span> ${data.client_name}</p>
        ${data.client_phone ? '<p><span class="label">الهاتف:</span> ' + data.client_phone + '</p>' : ''}
        ${data.client_address ? '<p><span class="label">العنوان:</span> ' + data.client_address + '</p>' : ''}
        ${data.client_tax ? '<p><span class="label">الرقم الضريبي:</span> ' + data.client_tax + '</p>' : ''}
      ` : ''}
      ${data.supplier_name ? `
        <h3>بيانات المورد</h3>
        <p><span class="label">الاسم:</span> ${data.supplier_name}</p>
        ${data.supplier_phone ? '<p><span class="label">الهاتف:</span> ' + data.supplier_phone + '</p>' : ''}
        ${data.supplier_address ? '<p><span class="label">العنوان:</span> ' + data.supplier_address + '</p>' : ''}
        ${data.supplier_tax ? '<p><span class="label">الرقم الضريبي:</span> ' + data.supplier_tax + '</p>' : ''}
      ` : ''}
    </div>
    <div class="info-box" style="text-align:left">
      <h3 style="text-align:right">معلومات الفاتورة</h3>
      <p style="text-align:right"><span class="label">حالة الدفع:</span> ${data.payment_status === 'paid' ? 'مدفوع' : data.payment_status === 'partial' ? 'مدفوع جزئياً' : 'غير مدفوع'}</p>
      ${data.payment_method ? '<p style="text-align:right"><span class="label">طريقة الدفع:</span> ' + data.payment_method + '</p>' : ''}
      ${data.sales_rep_name ? '<p style="text-align:right"><span class="label">مندوب المبيعات:</span> ' + data.sales_rep_name + '</p>' : ''}
    </div>
  </div>

  <table class="items">
    <thead><tr><th style="text-align:right">البيان</th><th style="text-align:center">الكمية</th><th style="text-align:left">سعر الوحدة</th><th style="text-align:left">الإجمالي</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="summary-section">
    <div class="summary-box">
      <table>
        <tr><td style="text-align:right">المجموع الفرعي</td><td style="text-align:left;direction:ltr">${formatCurrency(data.subtotal ?? 0)}</td></tr>
        ${(data.discount ?? 0) > 0 ? `<tr><td style="text-align:right">الخصم</td><td style="text-align:left;direction:ltr;color:#e53e3e">- ${formatCurrency(data.discount ?? 0)}</td></tr>` : ''}
        ${(data.tax ?? 0) > 0 ? `<tr><td style="text-align:right">الضريبة</td><td style="text-align:left;direction:ltr">+ ${formatCurrency(data.tax ?? 0)}</td></tr>` : ''}
        <tr class="grand-total"><td style="text-align:right">الإجمالي الكلي</td><td style="text-align:left;direction:ltr">${formatCurrency(data.total ?? 0)}</td></tr>
        <tr><td style="text-align:right;border-top:1px solid #ddd;padding-top:4px">المدفوع</td><td style="text-align:left;direction:ltr;border-top:1px solid #ddd;padding-top:4px">${formatCurrency(data.paid_amount ?? 0)}</td></tr>
        ${(data.remaining_amount ?? 0) > 0 ? `<tr><td style="text-align:right">المتبقي</td><td style="text-align:left;direction:ltr;color:#e53e3e">${formatCurrency(data.remaining_amount ?? 0)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  ${data.notes ? `<div class="notes-box"><strong>ملاحظات:</strong><br/>${data.notes}</div>` : ''}

  <div class="footer">
    <div class="signature">
      <div class="line">توقيع المستلم</div>
    </div>
    <div class="signature">
      <div class="line">توقيع المدير المالي</div>
    </div>
    <div class="signature">
      <div class="line">ختم الشركة</div>
    </div>
  </div>
  <script>window.print();setTimeout(()=>window.close(),500);</script>
</body></html>`;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: InvoiceData | null;
  type: 'sales' | 'purchases' | 'expense';
}

function generateExpenseHtml(data: InvoiceData): string {
  return `<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><title>سند صرف - #${data.id || ''}</title>
<style>
  @page { margin: 15mm; }
  body { font-family: 'Cairo', sans-serif; margin: 0; padding: 20px; font-size: 13px; color: #333; }
  .header { text-align:center; border-bottom:2px solid #c53030; padding-bottom:15px; margin-bottom:20px; }
  .header h1 { margin:0; font-size:20px; color:#c53030; }
  .header p { margin:2px 0; font-size:11px; color:#666; }
  .info-table { width:100%; margin-bottom:20px; }
  .info-table td { padding:4px 8px; font-size:13px; }
  .info-table .label { color:#888; }
  .amount-box { text-align:center; padding:20px; background:#fff5f5; border:2px solid #c53030; border-radius:8px; margin-bottom:20px; }
  .amount-box .amount { font-size:28px; font-weight:bold; color:#c53030; direction:ltr; }
  .amount-box .label { font-size:14px; color:#666; }
  .footer { border-top:1px solid #ddd; padding-top:15px; margin-top:20px; display:flex; justify-content:space-between; }
  .footer .signature { text-align:center; width:200px; }
  .footer .signature .line { border-top:1px solid #333; width:150px; margin:5px auto; padding-top:4px; font-size:11px; color:#666; }
</style></head>
<body>
  <div class="header">
    <h1>سند صرف</h1>
    <p>${companyInfo.name}</p>
    ${companyInfo.phone ? '<p>📞 ' + companyInfo.phone + '</p>' : ''}
  </div>
  <table class="info-table">
    <tr><td class="label">التاريخ:</td><td>${data.expense_date ? formatDate(data.expense_date) : ''}</td></tr>
    <tr><td class="label">التصنيف:</td><td>${data.category || ''}</td></tr>
    <tr><td class="label">البيان:</td><td>${data.description || data.notes || ''}</td></tr>
    <tr><td class="label">الحساب:</td><td>${data.account_name || '-'}</td></tr>
    <tr><td class="label">مدفوع بواسطة:</td><td>${data.paid_by_name || '-'}</td></tr>
  </table>
  <div class="amount-box">
    <div class="label">المبلغ</div>
    <div class="amount">${formatCurrency(data.amount || data.total || 0)}</div>
  </div>
  <div class="footer">
    <div class="signature"><div class="line">توقيع الصارف</div></div>
    <div class="signature"><div class="line">توقيع المدير المالي</div></div>
    <div class="signature"><div class="line">ختم الشركة</div></div>
  </div>
  <script>window.print();setTimeout(()=>window.close(),500);</script>
</body></html>`;
}

export default function InvoicePrintModal({ isOpen, onClose, data, type }: Props) {
  const { t } = useTranslation();

  const handlePrint = (size: 'small' | 'large') => {
    if (!data) return;
    if (type === 'expense') {
      const html = generateExpenseHtml(data);
      const win = window.open('', '_blank', 'width=800,height=600');
      if (win) { win.document.write(html); win.document.close(); }
      return;
    }
    const html = size === 'small' ? generateSmallReceiptHtml(data) : generateLargeInvoiceHtml(data);
    const win = window.open('', '_blank', 'width=800,height=600');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  if (!isOpen || !data) return null;

  const title = type === 'expense' ? (t('expenses.title') || 'سند صرف') : data.invoice_number || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{t('common.print')} - {title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          {type === 'expense' ? (
            <button onClick={() => handlePrint('large')} className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all text-right flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center"><Printer className="w-6 h-6 text-red-600" /></div>
              <div><p className="font-bold text-sm">{t('common.print')}</p><p className="text-xs text-gray-500">{t('expenses.title')}</p></div>
            </button>
          ) : (<>
            <button onClick={() => handlePrint('small')} className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all text-right flex items-center gap-3">
              <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center"><Printer className="w-6 h-6 text-primary-600" /></div>
              <div><p className="font-bold text-sm">{t('print.small_receipt')}</p><p className="text-xs text-gray-500">{t('print.small_receipt_desc')}</p></div>
            </button>
            <button onClick={() => handlePrint('large')} className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all text-right flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center"><FileText className="w-6 h-6 text-blue-600" /></div>
              <div><p className="font-bold text-sm">{t('print.large_invoice')}</p><p className="text-xs text-gray-500">{t('print.large_invoice_desc')}</p></div>
            </button>
          </>)}
        </div>
        <button onClick={onClose} className="mt-6 w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">{t('common.cancel')}</button>
      </div>
    </div>
  );
}