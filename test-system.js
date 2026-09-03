/**
 * Comprehensive System Test Script
 * Tests all major components without requiring a live database
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
    errors.push({ name, error: e.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

const projectRoot = __dirname;

// ====================================================
// 1. PROJECT STRUCTURE TESTS
// ====================================================
console.log('\n📁 PROJECT STRUCTURE\n');

test('backend/src/app.ts exists', () => {
  assert(fs.existsSync(path.join(projectRoot, 'backend/src/app.ts')), 'app.ts missing');
});

test('backend/src/config/database.ts exists', () => {
  assert(fs.existsSync(path.join(projectRoot, 'backend/src/config/database.ts')));
});

test('database/schema.postgresql.sql exists', () => {
  assert(fs.existsSync(path.join(projectRoot, 'database/schema.postgresql.sql')));
});

test('frontend/src/App.tsx exists', () => {
  assert(fs.existsSync(path.join(projectRoot, 'frontend/src/App.tsx')));
});

test('frontend/dist/index.html built', () => {
  assert(fs.existsSync(path.join(projectRoot, 'frontend/dist/index.html')), 'Frontend not built');
});

test('backend/dist/app.js built', () => {
  assert(fs.existsSync(path.join(projectRoot, 'backend/dist/app.js')), 'Backend not built');
});

// ====================================================
// 2. ROUTE FILES COUNT
// ====================================================
console.log('\n🛣️  BACKEND ROUTES\n');

test('All route files exist (>80)', () => {
  const routesDir = path.join(projectRoot, 'backend/src/routes');
  const routes = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));
  assert(routes.length >= 80, `Only ${routes.length} route files found, expected ≥80`);
  console.log(`   Found ${routes.length} route files`);
});

const criticalRoutes = [
  'auth.ts', 'clients.ts', 'suppliers.ts', 'items.ts', 'sales.ts',
  'purchases.ts', 'dashboard.ts', 'accounts.ts', 'expenses.ts',
  'client_payments.ts', 'whatsapp.ts', 'settings.ts', 'hr.ts'
];

criticalRoutes.forEach(route => {
  test(`Route: ${route}`, () => {
    assert(fs.existsSync(path.join(projectRoot, 'backend/src/routes', route)), `Missing: ${route}`);
  });
});

// ====================================================
// 3. FRONTEND PAGES COUNT
// ====================================================
console.log('\n📄 FRONTEND PAGES\n');

test('All page files exist (>50)', () => {
  const pagesDir = path.join(projectRoot, 'frontend/src/pages');
  function countFiles(dir) {
    let count = 0;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) count += countFiles(path.join(dir, item.name));
      else if (item.name.endsWith('.tsx')) count++;
    }
    return count;
  }
  const count = countFiles(pagesDir);
  assert(count >= 50, `Only ${count} page files, expected ≥50`);
  console.log(`   Found ${count} page files`);
});

const criticalPages = [
  'dashboard/DashboardPage.tsx',
  'accounting/AgingReportPage.tsx',
  'accounting/SettlementsPage.tsx',
  'sales/POSPage.tsx',
  'sales/SalesInvoicesPage.tsx',
  'reports/ProfitReportPage.tsx',
  'reports/SalesReportPage.tsx',
];

criticalPages.forEach(page => {
  test(`Page: ${page}`, () => {
    assert(fs.existsSync(path.join(projectRoot, 'frontend/src/pages', page)));
  });
});

// ====================================================
// 4. DATABASE SCHEMA TESTS
// ====================================================
console.log('\n🗄️  DATABASE SCHEMA\n');

test('PostgreSQL schema has SERIAL PRIMARY KEY', () => {
  const schema = fs.readFileSync(path.join(projectRoot, 'database/schema.postgresql.sql'), 'utf8');
  assert(schema.includes('SERIAL PRIMARY KEY'), 'Missing SERIAL PRIMARY KEY');
  assert(!schema.includes('AUTOINCREMENT'), 'Found SQLite AUTOINCREMENT in PG schema');
});

test('Schema has all critical tables', () => {
  const schema = fs.readFileSync(path.join(projectRoot, 'database/schema.postgresql.sql'), 'utf8');
  const tables = ['users', 'clients', 'items', 'sales_invoices', 'purchase_invoices',
    'journal_entries', 'accounts', 'currencies', 'settings', 'company_info'];
  tables.forEach(t => {
    assert(schema.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Missing table: ${t}`);
  });
});

test('Schema has ON CONFLICT DO NOTHING (not INSERT OR IGNORE)', () => {
  const schema = fs.readFileSync(path.join(projectRoot, 'database/schema.postgresql.sql'), 'utf8');
  assert(!schema.includes('INSERT OR IGNORE'), 'Found SQLite-specific INSERT OR IGNORE');
  assert(schema.includes('ON CONFLICT'), 'Missing ON CONFLICT syntax');
});

// ====================================================
// 5. DATABASE.TS TESTS
// ====================================================
console.log('\n⚙️  DATABASE CONFIGURATION\n');

test('database.ts uses pg (not better-sqlite3)', () => {
  const dbContent = fs.readFileSync(path.join(projectRoot, 'backend/src/config/database.ts'), 'utf8');
  assert(dbContent.includes("from 'pg'"), 'Missing pg import');
  assert(!dbContent.includes("better-sqlite3"), 'Found better-sqlite3 in database.ts');
});

test('database.ts exports query, queryOne, execute, withTransaction', () => {
  const dbContent = fs.readFileSync(path.join(projectRoot, 'backend/src/config/database.ts'), 'utf8');
  ['export async function query', 'export async function queryOne', 
   'export async function execute', 'export async function withTransaction'].forEach(fn => {
    assert(dbContent.includes(fn), `Missing: ${fn}`);
  });
});

test('database.ts converts ? to $N placeholders', () => {
  const dbContent = fs.readFileSync(path.join(projectRoot, 'backend/src/config/database.ts'), 'utf8');
  assert(dbContent.includes('convertPlaceholders') || dbContent.includes('\\$'), 'No placeholder conversion found');
});

// ====================================================
// 6. ROUTE CONVERSION TESTS (sample)
// ====================================================
console.log('\n🔄 ROUTE ASYNC CONVERSION\n');

const routesToCheck = ['dashboard.ts', 'clients.ts', 'sales.ts', 'items.ts'];
routesToCheck.forEach(routeName => {
  test(`${routeName} uses async handlers`, () => {
    const content = fs.readFileSync(path.join(projectRoot, 'backend/src/routes', routeName), 'utf8');
    assert(content.includes('async'), `${routeName} has no async handlers`);
    assert(!content.includes('db.prepare('), `${routeName} still uses db.prepare()`);
    assert(content.includes('await'), `${routeName} has no await calls`);
  });
});

// ====================================================
// 7. FRONTEND TYPESCRIPT BUILD
// ====================================================
console.log('\n🏗️  BUILD ARTIFACTS\n');

test('Frontend dist has JS files', () => {
  const assetsDir = path.join(projectRoot, 'frontend/dist/assets');
  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
  assert(jsFiles.length > 5, `Only ${jsFiles.length} JS files in dist/assets`);
  console.log(`   Found ${jsFiles.length} JS files in dist`);
});

test('Backend dist has app.js', () => {
  const appJs = path.join(projectRoot, 'backend/dist/app.js');
  assert(fs.existsSync(appJs));
  const size = fs.statSync(appJs).size;
  assert(size > 1000, `app.js too small: ${size} bytes`);
  console.log(`   app.js size: ${(size/1024).toFixed(1)}KB`);
});

// ====================================================
// 8. I18N TESTS
// ====================================================
console.log('\n🌍 I18N TRANSLATIONS\n');

test('ar.ts has aging keys', () => {
  const ar = fs.readFileSync(path.join(projectRoot, 'frontend/src/i18n/ar.ts'), 'utf8');
  ['aging.title', 'aging.client', 'aging.phone', 'dashboard.overdue_receivables'].forEach(key => {
    assert(ar.includes(`'${key}'`), `Missing key: ${key}`);
  });
});

test('en.ts has settlements keys', () => {
  const en = fs.readFileSync(path.join(projectRoot, 'frontend/src/i18n/en.ts'), 'utf8');
  assert(en.includes("'settlements.title'"), 'Missing settlements.title');
});

test('No duplicate keys in ar.ts', () => {
  const ar = fs.readFileSync(path.join(projectRoot, 'frontend/src/i18n/ar.ts'), 'utf8');
  const keyMatches = ar.match(/'[a-z._]+'\s*:/g) || [];
  const keys = keyMatches.map(k => k.replace(/'/g, '').replace(':', '').trim());
  const unique = new Set(keys);
  const dups = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert(dups.length === 0, `Duplicate keys found: ${dups.join(', ')}`);
});

// ====================================================
// 9. DEPLOYMENT FILES
// ====================================================
console.log('\n🚀 DEPLOYMENT\n');

test('render.yaml exists and has services', () => {
  const yaml = fs.readFileSync(path.join(projectRoot, 'render.yaml'), 'utf8');
  assert(yaml.includes('services:'), 'Missing services section');
  assert(yaml.includes('accounting-bg-backend'), 'Missing backend service');
});

test('GitHub Actions workflow exists', () => {
  const workflow = path.join(projectRoot, '.github/workflows/ci-cd.yml');
  assert(fs.existsSync(workflow), 'ci-cd.yml missing');
  const content = fs.readFileSync(workflow, 'utf8');
  assert(content.includes('Backend Build'), 'Missing Backend Build job');
  assert(content.includes('Frontend Build'), 'Missing Frontend Build job');
});

test('frontend/vercel.json exists', () => {
  assert(fs.existsSync(path.join(projectRoot, 'frontend/vercel.json')));
});

test('.gitignore excludes sensitive files', () => {
  const gi = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');
  assert(gi.includes('.env'), 'Missing .env in gitignore');
  assert(gi.includes('*.db'), 'Missing *.db in gitignore');
  assert(gi.includes('node_modules'), 'Missing node_modules in gitignore');
});

// ====================================================
// 10. LAYOUT FIX
// ====================================================
console.log('\n🎨 LAYOUT FIX\n');

test('Layout.tsx has proper RTL sidebar (flex-shrink-0)', () => {
  const layout = fs.readFileSync(
    path.join(projectRoot, 'frontend/src/components/ui/Layout.tsx'), 'utf8'
  );
  assert(layout.includes('flex-shrink-0'), 'Missing flex-shrink-0 on sidebar');
  assert(
    layout.includes("dir=\"rtl\"") || layout.includes("direction: 'rtl'"),
    'Missing RTL direction on root container'
  );
});

test('Layout.tsx sidebar not purely fixed on desktop', () => {
  const layout = fs.readFileSync(
    path.join(projectRoot, 'frontend/src/components/ui/Layout.tsx'), 'utf8'
  );
  // Should have an explicit desktop override class
  assert(
    layout.includes('lg:relative') ||
      layout.includes('lg:static') ||
      layout.includes('lg:translate-x-0') ||
      layout.includes('lg:flex') ||
      layout.includes('lg:hidden'),
    'Sidebar missing lg: responsive class'
  );
});

// ====================================================
// SUMMARY
// ====================================================
console.log('\n' + '='.repeat(60));
console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed\n`);

if (errors.length > 0) {
  console.log('❌ FAILURES:');
  errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
}

if (failed === 0) {
  console.log('🎉 All tests passed!');
} else {
  console.log(`⚠️  ${failed} test(s) failed`);
}

process.exit(failed > 0 ? 1 : 0);
