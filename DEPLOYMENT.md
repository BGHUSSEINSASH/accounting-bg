# 🚀 دليل رفع ونشر النظام المحاسبي

## خطوات رفع الكود على GitHub

```bash
# 1. افتح Git Bash أو PowerShell في مجلد المشروع
cd "C:\Users\taha0\OneDrive\Desktop\تطبيق حسابات\تطبيق حسابات"

# 2. أضف token في الـ URL (أو سيطلبها Git تلقائياً)
# اذهب إلى: https://github.com/settings/tokens/new
# أنشئ token بصلاحية: repo (كل الصلاحيات)

# 3. ارفع الكود
git push origin master:main

# أو باستخدام token مباشرة:
git remote set-url origin https://YOUR_TOKEN@github.com/BGHUSSEINSASH/accounting-bg.git
git push origin master:main
```

---

## 🌐 نشر البـ Backend على Render

### 1. إنشاء PostgreSQL Database
1. اذهب إلى [render.com](https://render.com) وسجّل دخول
2. اضغط **New** → **PostgreSQL**
3. اختر:
   - Name: `accounting-bg-db`
   - Region: Frankfurt
   - Plan: Free
4. بعد الإنشاء، انسخ **External Database URL**

### 2. إنشاء Web Service
1. اضغط **New** → **Web Service**
2. اربط بـ GitHub repo: `BGHUSSEINSASH/accounting-bg`
3. إعدادات:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install --ignore-scripts && npm run build`
   - **Start Command**: `node dist/app.js`
4. أضف Environment Variables:
   - `DATABASE_URL` = (من خطوة 1)
   - `JWT_SECRET` = (نص عشوائي طويل)
   - `REFRESH_SECRET` = (نص عشوائي طويل آخر)
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = (عنوان Vercel — أضفه بعد خطوة Frontend)

### 3. تشغيل Schema على PostgreSQL
بعد إنشاء الـ Service، اذهب لـ **Shell** في Render وشغّل:
```bash
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const schema = fs.readFileSync('database/schema.postgresql.sql', 'utf8');
pool.query(schema).then(() => { console.log('Done'); pool.end(); }).catch(console.error);
"
```

---

## 🌐 نشر الـ Frontend على Vercel

### 1. إنشاء Project
1. اذهب إلى [vercel.com](https://vercel.com) وسجّل دخول
2. **New Project** → Import من GitHub → `BGHUSSEINSASH/accounting-bg`
3. إعدادات:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. أضف Environment Variable:
   - `VITE_API_BASE_URL` = `https://accounting-bg-backend.onrender.com/api`

### 2. بعد النشر
- انسخ عنوان Vercel (مثال: `https://accounting-bg.vercel.app`)
- اذهب لـ Render → Backend Service → Environment Variables
- حدّث `CORS_ORIGIN` = عنوان Vercel

---

## 🗄️ إعداد Supabase (بديل لـ Render Database)

1. اذهب إلى [supabase.com](https://supabase.com) وأنشئ project جديد
2. اذهب إلى **SQL Editor** وشغّل محتوى ملف:
   `database/schema.postgresql.sql`
3. اذهب إلى **Settings** → **Database** → **Connection string** → **URI**
4. انسخ الـ URL واستخدمه كـ `DATABASE_URL`

---

## 🔄 GitHub Actions CI/CD

بعد رفع الكود، أضف هذه Secrets في GitHub:
- `RENDER_DEPLOY_HOOK` = من Render → Settings → Deploy Hook
- `VERCEL_TOKEN` = من Vercel → Settings → Tokens
- `VERCEL_ORG_ID` = من Vercel → Settings
- `VERCEL_PROJECT_ID` = من Vercel → Project Settings

سيتم البناء والنشر تلقائياً عند كل `git push`.

---

## 💻 تشغيل محلي مع PostgreSQL

```bash
# 1. أنشئ .env في backend/
DATABASE_URL=postgresql://user:pass@localhost:5432/accounting
JWT_SECRET=any-secret-key
REFRESH_SECRET=another-secret-key

# 2. شغّل Backend
cd backend
npm install
npm run dev

# 3. شغّل Frontend (في terminal آخر)  
cd frontend
npm install
npm run dev
```

---

## 📋 بيانات الدخول الافتراضية

| المستخدم | كلمة المرور | الدور |
|---|---|---|
| admin | 123456 | مدير |
| mohammed | 123456 | مدير مبيعات |
| sara | 123456 | محاسب |
| ali_sale | 123456 | مندوب مبيعات |
| fatima | 123456 | مندوبة مبيعات |
