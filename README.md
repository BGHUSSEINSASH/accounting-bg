# النظام المحاسبي المتكامل | Integrated Accounting System

<div align="center">

[![CI/CD](https://github.com/BGHUSSEINSASH/accounting-bg/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/BGHUSSEINSASH/accounting-bg/actions/workflows/ci-cd.yml)
[![GitHub Stars](https://img.shields.io/github/stars/BGHUSSEINSASH/accounting-bg?style=flat)](https://github.com/BGHUSSEINSASH/accounting-bg/stargazers)

**نظام محاسبي متكامل مبني على الويب بدعم كامل للغة العربية واتجاه RTL**

*Full-stack web accounting system with complete Arabic RTL support*

[🚀 Deploy to Render](https://render.com/deploy?repo=https://github.com/BGHUSSEINSASH/accounting-bg) | [⚡ Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/BGHUSSEINSASH/accounting-bg&root=frontend) | [📖 Docs](#deployment)

</div>

---

## ✨ الميزات | Features

### 💰 المحاسبة | Accounting
- شجرة حسابات كاملة (أصول، خصوم، إيرادات، مصروفات)
- قيود يومية مع التحقق من التوازن
- ميزانية عمومية وقائمة دخل تلقائية
- تسوية بنكية مع استيراد كشف الحساب
- مراكز التكلفة والتحليلات المالية
- تقرير الذمم المتأخرة (Aging Report) مع إشعارات WhatsApp

### 🛒 المبيعات | Sales
- فواتير المبيعات مع حساب الضريبة والخصم
- نقطة بيع (POS) مع قارئ باركود
- عروض أسعار قابلة للتحويل لفواتير
- دفع مختلط (نقد + بطاقة)
- مندوبي المبيعات وتتبع الأداء والأهداف
- إشعارات دفع ومدفوعات جزئية

### 📦 المخزون | Inventory
- تتبع الكميات والمستودعات المتعددة
- تنبيهات الحد الأدنى ومنتهي الصلاحية
- طرق التكلفة: FIFO/LIFO/متوسط
- تحويلات بين المستودعات
- الباركود وطباعة الملصقات
- دفعات المنتجات (Batches)

### 👥 الموارد البشرية | HR
- إدارة الموظفين والعقود
- نظام الحضور مع GPS وكاميرا
- إجازات وأرصدة الإجازات
- الرواتب والبدلات والخصومات
- قروض الموظفين ومؤشرات الأداء

### 📊 التقارير | Reports
- تقرير الأرباح والخسائر المفصل
- مقارنة الفترات (شهري/سنوي)
- تصدير Excel لكل البيانات
- تقارير مخصصة قابلة للجدولة
- لوحة تحكم مع KPIs تفاعلية

---

## 🛠️ التقنيات | Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (Supabase / Render / Neon) |
| Auth | JWT + Refresh Tokens |
| i18n | Arabic (RTL) + English + Kurdish |
| Mobile | React Native (Expo) |
| CI/CD | GitHub Actions |
| Docker | Multi-stage build with Nginx |

---

## 🚀 النشر السريع | Quick Deploy

### Option 1: Render (Backend) + Vercel (Frontend) — مجاني تماماً

**الخطوة 1: نشر Backend على Render**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/BGHUSSEINSASH/accounting-bg)

> أو يدوياً:
> 1. اذهب إلى [render.com](https://render.com) → New Web Service
> 2. Root Directory: `backend`
> 3. Build: `npm install --ignore-scripts && npm run build`
> 4. Start: `node dist/app.js`

**الخطوة 2: إعداد قاعدة البيانات**

1. أنشئ PostgreSQL database على [supabase.com](https://supabase.com)
2. في SQL Editor، شغّل محتوى: `database/schema.postgresql.sql`
3. أضف `DATABASE_URL` كـ Environment Variable في Render

**الخطوة 3: نشر Frontend على Vercel**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/BGHUSSEINSASH/accounting-bg&root=frontend)

> أضف Environment Variable:
> `VITE_API_BASE_URL` = `https://your-backend.onrender.com/api`

### Option 2: Docker Compose (محلي أو VPS)

```bash
git clone https://github.com/BGHUSSEINSASH/accounting-bg.git
cd accounting-bg

# إنشاء ملف البيئة
cp backend/.env.production backend/.env
# عدّل DATABASE_URL و JWT_SECRET في .env

docker-compose up -d
# الموقع: http://localhost:80
```

### Option 3: النشر الآلي بـ Script

```bash
# Windows PowerShell
.\setup-online.ps1

# أو Node.js
node deploy-full.js --supabase-token=xxx --render-token=xxx --vercel-token=xxx
```

---

## 💻 التطوير المحلي | Local Development

### المتطلبات
- Node.js 20+
- PostgreSQL 16+ (أو Supabase/Neon مجاناً)
- Git

### الخطوات

```bash
# 1. استنساخ المشروع
git clone https://github.com/BGHUSSEINSASH/accounting-bg.git
cd accounting-bg

# 2. إعداد Backend
cd backend
cp .env.example .env
# عدّل DATABASE_URL في .env
npm install --ignore-scripts
npm run dev

# 3. إعداد Frontend (terminal آخر)
cd ../frontend
npm install
npm run dev
# الموقع: http://localhost:5173
```

### ملف `.env` للبيئة المحلية

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/accounting
JWT_SECRET=any-random-secret-key
REFRESH_SECRET=another-random-secret-key
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

---

## 🔐 بيانات الدخول الافتراضية | Default Credentials

> ⚠️ **تحذير**: غيّر كلمة المرور فوراً في الإنتاج!

| المستخدم | كلمة المرور | الصلاحية |
|---------|------------|---------|
| admin | 123456 | مدير النظام |
| mohammed | 123456 | مدير مبيعات |
| sara | 123456 | محاسب |
| ali_sale | 123456 | مندوب مبيعات |
| fatima | 123456 | مندوبة مبيعات |

---

## 📁 هيكل المشروع | Project Structure

```
accounting-bg/
├── backend/                 # Express API
│   ├── src/
│   │   ├── routes/         # 88 API endpoints
│   │   ├── config/         # Database (PostgreSQL)
│   │   ├── middleware/      # Auth, i18n, errors
│   │   ├── services/        # Business logic
│   │   └── utils/           # Helpers
│   └── dist/               # Compiled JS
├── frontend/               # React App
│   ├── src/
│   │   ├── pages/          # 68 pages
│   │   ├── components/      # Shared components
│   │   ├── i18n/           # Arabic/English/Kurdish
│   │   ├── services/        # API client
│   │   └── utils/           # Format, helpers
│   └── dist/               # Built static files
├── mobile/                 # React Native (Expo)
├── database/               # PostgreSQL schema
│   └── schema.postgresql.sql
├── docker-compose.yml      # Full stack Docker
├── render.yaml             # Render Blueprint
└── DEPLOYMENT.md           # تعليمات النشر
```

---

## 📡 API Reference

| Endpoint | Method | Description |
|---------|--------|-------------|
| `/api/auth/login` | POST | تسجيل الدخول |
| `/api/dashboard/stats` | GET | إحصائيات لوحة التحكم |
| `/api/clients` | GET/POST/PUT/DELETE | إدارة العملاء |
| `/api/sales` | GET/POST | فواتير المبيعات |
| `/api/items` | GET/POST/PUT/DELETE | إدارة الأصناف |
| `/api/reports/income-statement-detailed` | GET | قائمة الدخل المفصلة |
| `/api/reports/export/sales/excel` | GET | تصدير Excel |
| `/api/whatsapp/overdue-preview` | GET | الذمم المتأخرة |
| `/api/health` | GET | حالة الخادم |

> الوثائق الكاملة: `http://localhost:3000/api-docs` (Swagger UI)

---

## 🤝 المساهمة | Contributing

1. Fork المشروع
2. أنشئ branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. افتح Pull Request

---

## 📄 الترخيص | License

MIT License — استخدم حراً مع الإشارة للمصدر

---

<div align="center">

صُنع بـ ❤️ للمجتمع العربي | Made with ❤️ for the Arabic community

</div>
