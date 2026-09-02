# نظام المحاسبة والإدارة المتكامل | Integrated Accounting & Management System

## نظرة عامة | Overview

نظام محاسبة وإدارة أعمال متكامل مبني بتقنيات حديثة، يدعم اللغة العربية بالكامل ويعمل على الحواسيب والأجهزة المحمولة.

A full-stack Arabic-first accounting and business management system supporting multi-company, multi-warehouse, HR, POS, and comprehensive reporting.

---

## المميزات | Features

### المحاسبة | Accounting
- دليل الحسابات (شجرة هرمية متعددة المستويات)
- قيود اليومية مع الترحيل التلقائي
- ميزان المراجعة، الميزانية العمومية، قائمة الدخل
- التدفق النقدي، التسوية البنكية
- الموازنات التقديرية، الأصول الثابتة والإهلاك
- مراكز التكلفة، الأقساط، التسويات

### المبيعات | Sales
- فواتير البيع مع ضريبة القيمة المضافة
- نقطة البيع (POS) مع طابعة إيصالات
- عروض الأسعار، إشعارات الدائن، مدفوعات العملاء
- أهداف المبيعات، سياسات الخصم
- خريطة مواقع العملاء

### المخزون | Inventory
- إدارة الأصناف والمستودعات
- فواتير المشتريات، أوامر الشراء، مردودات المشتريات
- جرد المخزون، تحويلات بين المستودعات
- تنبيهات المخزون المنخفض وانتهاء الصلاحية
- طباعة الباركود

### الموارد البشرية | HR
- إدارة الموظفين والعقود
- الرواتب والخصومات والبدلات
- الإجازات والسلف
- المناوبات والجداول الزمنية
- مؤشرات الأداء (KPIs)

### الحضور | Attendance
- تسجيل الحضور بـ GPS وصورة الموظف
- سجلات الحضور والانصراف
- خريطة مواقع الموظفين

### التقارير | Reports
- تقارير المبيعات والأرباح
- تقارير الضريبة (ضريبة القيمة المضافة)
- تقارير الحضور والموازنة
- تقارير مخصصة، تصدير Excel و PDF
- تقرير الذمم المتأخرة (Aging Report)

### الإدارة | Admin
- إدارة شركات متعددة
- الصلاحيات ومجموعات المستخدمين
- النسخ الاحتياطي والاستعادة
- سجل النشاط، سجل الدخول
- إشعارات تلقائية

---

## التقنيات المستخدمة | Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Styling | TailwindCSS + Cairo Font |
| State | Zustand |
| Backend | Express.js + TypeScript |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken) |
| PDF | jsPDF + html2canvas |
| Excel | xlsx (SheetJS) |
| Barcode | JsBarcode |
| Maps | Leaflet.js |
| Container | Docker + Nginx |

---

## إعداد بيئة التطوير | Local Development Setup

### المتطلبات | Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### الخطوات | Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd accounting-system

# 2. Setup backend
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials
npm install
npm run dev

# 3. Setup frontend (in a new terminal)
cd frontend
npm install
npm run dev
```

### متغيرات البيئة | Environment Variables (backend/.env)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/accounting_db

# JWT
JWT_SECRET=your-very-secure-secret-key-here

# Server
PORT=3000
CORS_ORIGIN=http://localhost:5173

# Optional: Rate limiting
RATE_LIMIT_MAX=5000
```

---

## نشر Docker | Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The `docker-compose.yml` starts:
- PostgreSQL database
- Backend API (port 3000)
- Nginx reverse proxy (port 80/443)

---

## نشر سحابي | Cloud Deployment

### Render + Supabase (موصى به | Recommended)

1. **Database**: Create a free PostgreSQL instance on [Supabase](https://supabase.com)
   - Copy the connection string (URI format)

2. **Backend on Render**:
   - New → Web Service → Connect your repo
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `node dist/server.js`
   - Environment variables:
     ```
     DATABASE_URL=<supabase connection string>
     JWT_SECRET=<random 64-char string>
     NODE_ENV=production
     ```

3. **Frontend on Vercel**:
   - Import repo → Set root to `frontend`
   - Environment variable: `VITE_API_URL=https://your-render-backend.onrender.com/api`
   - Build command: `npm run build`
   - Output directory: `dist`

### render.yaml (Auto-deploy)

The `render.yaml` in the project root is pre-configured for Render Blueprint deployment.

---

## بيانات الدخول الافتراضية | Default Credentials

> **تحذير | Warning**: Change these immediately after first login.

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

---

## API Documentation

After running the backend, visit:
```
http://localhost:3000/api/docs
```

Swagger UI is available with full endpoint documentation.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/accounts` | Chart of accounts |
| GET | `/api/sales` | Sales invoices |
| GET | `/api/clients` | Clients list |
| GET | `/api/items` | Items/inventory |
| GET | `/api/reports/export/clients/excel` | Export clients to Excel |
| GET | `/api/reports/export/items/excel` | Export items to Excel |
| GET | `/api/reports/export/sales/excel?from=&to=` | Export sales to Excel |
| GET | `/api/barcode-print/items` | List items for barcode printing |
| POST | `/api/barcode-print/generate` | Generate printable barcode HTML |
| GET | `/api/health` | Health check |

---

## هيكل المشروع | Project Structure

```
├── backend/
│   ├── src/
│   │   ├── app.ts          # Express app entry
│   │   ├── config/
│   │   │   └── database.ts # PostgreSQL pool
│   │   ├── middleware/
│   │   │   ├── auth.ts     # JWT authentication
│   │   │   └── ...
│   │   └── routes/         # API route handlers
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   ├── i18n/ar.ts      # Arabic translations
│   │   └── services/api.ts
│   └── package.json
├── docker-compose.yml
├── nginx/
└── render.yaml
```

---

## الدعم | Support

For issues and feedback, please open a GitHub issue.

---

*نظام المحاسبة والإدارة المتكامل — مبني بـ ❤️ للشركات العربية*
