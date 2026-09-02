import { getDefaultCurrency, getLanguage } from '../store/appStore';

function getLocale(): string {
  const language = getLanguage();
  if (language === 'en') return 'en-US';
  if (language === 'ku') return 'ku-IQ';
  return 'ar-IQ';
}

const symbolMap: Record<string, string> = {
  SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ',
  EGP: 'ج.م', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع',
  IQD: 'د.ع'
};

const currencyNames: Record<string, string> = {
  SAR: 'ريال سعودي', USD: 'دولار أمريكي', EUR: 'يورو', GBP: 'جنيه إسترليني',
  AED: 'درهم إماراتي', EGP: 'جنيه مصري', KWD: 'دينار كويتي',
  QAR: 'ريال قطري', BHD: 'دينار بحريني', OMR: 'ريال عماني', IQD: 'دينار عراقي'
};

export function formatCurrency(amount: number, currencyCode?: string): string {
  const code = currencyCode || getDefaultCurrency() || 'IQD';
  const lang = getLocale();
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency code is not supported by Intl
    const symbol = symbolMap[code] || code;
    return `${symbol} ${amount.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function getCurrencyName(code: string): string {
  return currencyNames[code] || code;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getLocale()).format(value);
}

export function formatNumberAr(value: number): string {
  const lang = getLanguage();
  if (lang === 'ar' || lang === 'ku') {
    return new Intl.NumberFormat('ar-IQ', { useGrouping: true }).format(value);
  }
  return new Intl.NumberFormat('en-US', { useGrouping: true }).format(value);
}

// Arabic number words for IQD (basic implementation)
const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
  'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function threeDigits(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  let result = '';
  if (h > 0) result += hundreds[h];
  if (n % 100 > 0) {
    if (result) result += ' و';
    if (n % 100 < 20) {
      result += ones[n % 100];
    } else {
      if (o > 0) result += ones[o] + ' و';
      result += tens[t];
    }
  }
  return result;
}

export function tafqeer(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return 'صفر دينار عراقي';
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  const parts: string[] = [];
  if (billions > 0) parts.push(threeDigits(billions) + ' مليار');
  if (millions > 0) parts.push(threeDigits(millions) + ' مليون');
  if (thousands === 1) parts.push('ألف');
  else if (thousands === 2) parts.push('ألفان');
  else if (thousands > 0) parts.push(threeDigits(thousands) + ' آلاف');
  if (remainder > 0) parts.push(threeDigits(remainder));
  return (amount < 0 ? 'سالب ' : '') + parts.join(' و') + ' دينار عراقي';
}

export function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    paid: 'badge-success',
    partial: 'badge-warning',
    unpaid: 'badge-danger',
    present: 'badge-success',
    absent: 'badge-danger',
    late: 'badge-warning',
    pending: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
    active: 'badge-success',
    inactive: 'badge-danger',
  };
  return map[status] || 'badge-info';
}

export function getStatusText(status: string): string {
  const map: Record<string, string> = {
    paid: 'مدفوع',
    partial: 'مدفوع جزئياً',
    unpaid: 'غير مدفوع',
    present: 'حاضر',
    absent: 'غائب',
    late: 'متأخر',
    pending: 'قيد الانتظار',
    approved: 'تمت الموافقة',
    rejected: 'مرفوض',
    active: 'نشط',
    inactive: 'غير نشط',
    cash: 'نقداً',
    card: 'بطاقة',
    credit: 'آجل',
    transfer: 'تحويل بنكي',
  };
  return map[status] || status;
}
