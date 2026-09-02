const fs = require('fs');
const path = require('path');

const additions = {
  'dashboard.overdue_receivables': {
    ar: 'الذمم المتأخرة',
    en: 'Overdue Receivables',
  },
  'dashboard.overdue_amount': {
    ar: 'المبلغ المستحق المتأخر',
    en: 'Overdue Amount',
  },
  'dashboard.view_report': {
    ar: 'عرض التقرير الكامل',
    en: 'View Full Report',
  },
  'dashboard.overdue_days_30': {
    ar: 'المعدات',
    en: 'Days Overdue',
  },
  'dashboard.overdue_count': {
    ar: 'عدد الفواتير المتأخرة',
    en: 'Overdue Invoices',
  },
  'dashboard.top_overdue_clients': {
    ar: 'أعلى العملاء مديونية',
    en: 'Top Owing Clients',
  },
  'aging.title': {
    ar: 'تقرير الأعمار',
    en: 'Aging Report',
  },
  'aging.subtitle': {
    ar: 'تتبع الديون حسب مدة الاستحقاق',
    en: 'Track receivables by days overdue',
  },
  'aging.receivables': {
    ar: 'المتأخرات (العملاء)',
    en: 'Receivables (Clients)',
  },
  'aging.payables': {
    ar: 'المتأخرات (الموردون)',
    en: 'Payables (Suppliers)',
  },
  'aging.overdue_days': {
    ar: 'الفواتير المتأخرة',
    en: 'Overdue Invoices',
  },
  'aging.seriously_overdue': {
    ar: 'أكثر من 90 يوم',
    en: 'Over 90 days',
  },
  'aging.current': {
    ar: 'الجاري',
    en: 'Current',
  },
  'aging.client': {
    ar: 'العميل',
    en: 'Client',
  },
  'aging.supplier': {
    ar: 'المورد',
    en: 'Supplier',
  },
  'aging.phone': {
    ar: 'الهاتف',
    en: 'Phone',
  },
  'aging.balance': {
    ar: 'الرصيد',
    en: 'Balance',
  },
  'aging.total': {
    ar: 'الإجمالي',
    en: 'Total',
  },
  'aging.actions': {
    ar: 'الإجراءات',
    en: 'Actions',
  },
  'aging.send_reminder': {
    ar: 'إرسال تذكير',
    en: 'Send Reminder',
  },
  'aging.call': {
    ar: 'اتصال',
    en: 'Call',
  },
  'aging.collection_note': {
    ar: 'ملاحظة التحصيل',
    en: 'Collection Note',
  },
  'common.info': {
    ar: 'معلومة',
    en: 'Information',
  },
  'common.continue': {
    ar: 'استمرار',
    en: 'Continue',
  },
};

const files = [
  { path: 'src/i18n/ar.ts', lang: 'ar' },
  { path: 'src/i18n/en.ts', lang: 'en' },
];

for (const { path: filePath, lang } of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  const before = content.substring(0, content.indexOf("  'common.continue':"));

  const lines = [];
  for (const [key, trans] of Object.entries(additions)) {
    if (!content.includes(`'${key}':`)) {
      lines.push(`  '${key}': '${trans[lang].replace(/'/g, "\\'")}',`);
    }
  }

  if (lines.length > 0) {
    const insertPos = content.indexOf("  'common.continue':");
    const newContent = content.substring(0, insertPos) + '\n' + lines.join('\n') + '\n  ' + content.substring(insertPos);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`${filePath}: +${lines.length} keys`);
  } else {
    console.log(`${filePath}: no changes needed`);
  }
}

console.log('Done!');