import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { initializeDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { i18nMiddleware } from './middleware/i18n';
import { getLanguage, setLanguage } from './i18n';
import logger from './utils/logger';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import clientRoutes from './routes/clients';
import supplierRoutes from './routes/suppliers';
import salesRoutes from './routes/sales';
import purchaseRoutes from './routes/purchases';
import itemRoutes from './routes/items';
import doctorRoutes from './routes/doctors';
import attendanceRoutes from './routes/attendance';
import attendanceMapRoutes from './routes/attendance_map';
import expenseRoutes from './routes/expenses';
import reportRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import leaveRoutes from './routes/leaves';
import payrollRoutes from './routes/payroll';
import settingsRoutes from './routes/settings';
import warehouseRoutes from './routes/warehouses';
import itemPriceRoutes from './routes/item_prices';
import purchaseOrderRoutes from './routes/purchase_orders';
import quotationRoutes from './routes/quotations';
import creditNoteRoutes from './routes/credit_notes';
import debitNoteRoutes from './routes/debit_notes';
import clientPaymentRoutes from './routes/client_payments';
import clientClassificationRoutes from './routes/client_classifications';
import bankAccountRoutes from './routes/bank_accounts';
import bankReconciliationRoutes from './routes/bank_reconciliation';
import fixedAssetRoutes from './routes/fixed_assets';
import budgetRoutes from './routes/budgets';
import employeeContractRoutes from './routes/employee_contracts';
import employeeLoanRoutes from './routes/employee_loans';
import shiftRoutes from './routes/shifts';
import leaveBalanceRoutes from './routes/leave_balances';
import permissionRoutes from './routes/permissions';
import notificationRoutes from './routes/notifications';
import companyRoutes from './routes/companies';
import emailConfigRoutes from './routes/email_config';
import inventoryCountRoutes from './routes/inventory_counts';
import activityLogRoutes from './routes/activity_log';
import backupRoutes from './routes/backups';
import expiryRoutes from './routes/expiry_alerts';
import accountStatementRoutes from './routes/account_statement';
import barcodeRoutes from './routes/barcode';
import loyaltyRoutes from './routes/loyalty';
import installmentRoutes from './routes/installments';
import abcRoutes from './routes/abc_analysis';
import repRoutes from './routes/rep_performance';
import pdfRoutes from './routes/report_pdf';
import loginHistoryRoutes from './routes/login_history';
import autoBackupRoutes from './routes/auto_backup';
import kpiRoutes from './routes/employee_kpis';
import overtimeRoutes from './routes/overtime';
import payrollCalcRoutes from './routes/payroll_calc';
import salesTargetsRoutes from './routes/sales_targets';
import inventoryTransfersRoutes from './routes/inventory_transfers';
import costCentersRoutes from './routes/cost_centers';
import discountPoliciesRoutes from './routes/discount_policies';
import tileProxyRoutes from './routes/tile_proxy';
import cloudSyncRoutes from './routes/cloud_sync';
import { logCloudProviderWarning } from './services/cloudStorage';
import { syncLocalFiles } from './services/cloudSync';
import autoNotificationsRoutes, { runAutoNotifications } from './routes/auto_notifications';
import searchRoutes from './routes/search';
import barcodePrintRoutes from './routes/barcode_print';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting - skip for GET requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '5000'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => req.method === 'GET',
});

app.use('/api/', limiter);

// Auth-specific stricter rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

app.use('/api/auth/login', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Serve frontend static files
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// i18n middleware
app.use(i18nMiddleware);

// Initialize database (async for PostgreSQL)
initializeDatabase()
  .then(() => { logCloudProviderWarning(); })
  .catch((err) => {
    logger.error('Database initialization failed', { error: (err as Error).message });
    process.exit(1);
  });

// Swagger
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'النظام المحاسبي المتكامل API',
      version: '1.0.0',
      description: 'Integrated Accounting System REST API',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Accounting System API Docs',
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance-map', attendanceMapRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/item-prices', itemPriceRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
app.use('/api/debit-notes', debitNoteRoutes);
app.use('/api/client-payments', clientPaymentRoutes);
app.use('/api/client-classifications', clientClassificationRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/bank-reconciliation', bankReconciliationRoutes);
app.use('/api/fixed-assets', fixedAssetRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/employee-contracts', employeeContractRoutes);
app.use('/api/employee-loans', employeeLoanRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/leave-balances', leaveBalanceRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/email-config', emailConfigRoutes);
app.use('/api/inventory-counts', inventoryCountRoutes);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/expiry-alerts', expiryRoutes);
app.use('/api/account-statement', accountStatementRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/installments', installmentRoutes);
app.use('/api/abc-analysis', abcRoutes);
app.use('/api/sales-rep-performance', repRoutes);
app.use('/api/employee-kpis', kpiRoutes);
app.use('/api/overtime', overtimeRoutes);
app.use('/api/payroll-calculate', payrollCalcRoutes);
app.use('/api/report-pdf', pdfRoutes);
app.use('/api/login-history', loginHistoryRoutes);
app.use('/api/auto-backup', autoBackupRoutes);
app.use('/api/sales-targets', salesTargetsRoutes);
app.use('/api/inventory-transfers', inventoryTransfersRoutes);
app.use('/api/cost-centers', costCentersRoutes);
app.use('/api/discount-policies', discountPoliciesRoutes);
app.use('/api', tileProxyRoutes);
app.use('/api/cloud-sync', cloudSyncRoutes);
app.use('/api/auto-notifications', autoNotificationsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/barcode-print', barcodePrintRoutes);

// Health check
app.get('/api/health', async (_req, res) => {
  const used = process.memoryUsage();
  let dbStatus = 'unknown';
  try {
    const { getPool } = await import('./config/database');
    await getPool().query('SELECT 1');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
      rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
    },
    database: dbStatus,
    node: process.version,
  });
});

// Language endpoints
app.get('/api/lang', (_req, res) => {
  res.json({ lang: getLanguage() });
});

app.post('/api/lang', (req, res) => {
  const { lang } = req.body;
  if (lang === 'ar' || lang === 'en' || lang === 'ku') {
    setLanguage(lang);
    res.json({ lang });
  } else {
    res.status(400).json({ error: 'Invalid language' });
  }
});

if (process.env.CLOUD_PROVIDER && process.env.CLOUD_PROVIDER !== 'none') {
  const intervalMs = Number(process.env.CLOUD_SYNC_INTERVAL_MS || 15 * 60 * 1000);
  setInterval(() => {
    syncLocalFiles().catch((err) => logger.error('Scheduled cloud sync failed', { error: err.message }));
  }, intervalMs);
}

// Hourly auto-notifications scheduler
setInterval(() => {
  runAutoNotifications().catch((err) => logger.error('Scheduled auto-notifications failed', { error: (err as Error).message }));
}, 60 * 60 * 1000);

// SPA fallback - serve index.html for non-API routes
if (fs.existsSync(frontendDist)) {
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
