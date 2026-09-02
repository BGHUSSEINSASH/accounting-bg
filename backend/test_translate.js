import fs from 'fs';
import path from 'path';

const arKeys = {
  'dashboard.overdue_receivables': 'الذمم المتأخرة (30+ يوم)',
  'dashboard.overdue_amount': 'المبلغ المستحق المتأخر',
  'dashboard.view_report': 'عرض التقرير الكامل',
  'dashboard.overdue_days_30': 'المدة الزمنية المتأخرة',
  'dashboard.overdue_count': 'عدد الفواتير المتأخرة',
  'dashboard.top_overdue_clients': 'أعلى العملاء مديونية',
};

const enKeys = {
  'dashboard.overdue_receivables': 'Overdue Receivables (30+ days)',
  'dashboard.overdue_amount': 'Overdue Amount',
  'dashboard.view_report': 'View Full Report',
  'dashboard.overdue_days_30': 'Days Overdue',
  'dashboard.overdue_count': 'Number of Overdue Invoices',
  'dashboard.top_overdue_clients': 'Top Owing Clients',
};

const agingKeys = {
  'aging.title': 'تقرير الأعمار',
  'aging.subtitle': 'تتبع الديون حسب مدة الاستحقاق',
  'aging.receivables': 'الديون المستحقة',
  'aging.payables': 'الديون للموردين',
  'aging.overdue_days': 'الفواتير المتأخرة',
  'aging.seriously_overdue': 'أكثر من 90 يوم',
  'aging.current': 'الجاري',
  'aging.client': 'العميل',
  'aging.supplier': 'الموordner',
  'aging.phone': 'الهاتف',
  'aging.balance': 'الرصيد',
  'aging.total': 'الإجمالي',
  'aging.actions': 'الإجراءات',
  'aging.send_reminder': 'إرسال تذكير',
  'aging.call': 'اتصال',
  'aging.collection_note': 'ملاحظة التحصيل',
};

const enAgingKeys = {
  'aging.title': 'Aging Report',
  'aging.subtitle': 'Track receivables by days overdue',
  'aging.receivables': 'Receivables (Clients)',
  'aging.payables': 'Payables (Suppliers)',
  'aging.overdue_days': 'Overdue Invoices',
  'aging.seriously_overdue': 'Over 90 days',
  'aging.current': 'Current (Not due)',
  'aging.client': 'Client',
  'aging.supplier': 'Supplier',
  'aging.phone': 'Phone',
  'aging.balance': 'Balance',
  'aging.total': 'Total',
  'aging.actions': 'Actions',
  'aging.send_reminder': 'Send Reminder',
  'aging.call': 'Call',
  'aging.collection_note': 'Collection Note',
  'aging.1_30': '1-30 days',
  'aging.31_60': '31-60 days',
  'aging.61_90': '61-90 days',
  'aging.90_plus': 'Over 90 days',
  'dashboard.aging_report': 'Aging Report',
};

// For Kurdish we'll reuse the English for now (can be updated later)

const files = [
  { path: 'src/i18n/ar.ts', keys: { ...arKeys, ...agingKeys } },
  { path: 'src/i18n/en.ts', keys: { ...enKeys, ...enAgingKeys } },
];

for (const file of files) {
  let content = fs.readFileSync(file.path, 'utf8');
  const insertPos = content.indexOf("  'common.continue':");

  const newContent = [];
  for (const [key, value] of Object.entries(file.keys)) {
    if (!content.includes(`'${key}':`)) {
      newContent.push(`  '${key}': '${value.replace(/'/g, "\\'")}',`);
    }
  }

  if (newContent.length > 0) {
    const before = content.substring(0, insertPos + newContent.length);
    const after = content.substring(insertPos + content.length);
    console.log(`Adding ${newContent.length} keys to ${file.path}`);
    fs.writeFileSync(file.path, newContent.join('\n') + '\n  ' + after);
  } else {
    console.log(`No changes needed for ${file.path}`);
  }
}

console.log('Done!');