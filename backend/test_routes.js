const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const r = http.request(opts, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
      res.on('error', reject);
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function test() {
  // Login
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  const token = login.body.token;
  if (!token) { console.log('LOGIN FAILED:', JSON.stringify(login.body)); process.exit(1); }
  console.log('LOGIN OK');

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const endpoints = [
    '/api/activity-log',
    '/api/backups',
    '/api/client-classifications',
    '/api/client-payments',
    '/api/warehouses',
    '/api/item-prices',
    '/api/purchase-orders',
    '/api/quotations',
    '/api/credit-notes',
    '/api/debit-notes',
    '/api/bank-accounts',
    '/api/bank-reconciliation',
    '/api/fixed-assets',
    '/api/budgets',
    '/api/employee-contracts',
    '/api/employee-loans',
    '/api/shifts',
    '/api/leave-balances',
    '/api/permissions',
    '/api/notifications',
    '/api/companies',
    '/api/email-config',
    '/api/inventory-counts'
  ];

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    try {
      const res = await request('GET', ep);
      if (res.status === 200 || res.status === 401) {
        // 401 = no auth (if our token is wrong) shouldn't happen
        // 200 = success
        if (res.status === 200) {
          console.log(`  ✓ ${ep} -> ${res.status}`);
          passed++;
        } else {
          console.log(`  ? ${ep} -> ${res.status} (no auth)`);
          failed++;
        }
      } else {
        console.log(`  ✗ ${ep} -> ${res.status}`);
        failed++;
      }
    } catch (e) {
      console.log(`  ✗ ${ep} -> ERROR: ${e.message}`);
      failed++;
    }
  }

  // Test POST endpoints
  console.log('\n--- POST Tests ---');

  // POST /api/backups
  try {
    const r = await request('POST', '/api/backups');
    console.log(`  POST /api/backups -> ${r.status} ${r.status === 200 || r.status === 201 ? '✓' : '✗'}`);
    if (r.status === 200 || r.status === 201) passed++; else failed++;
  } catch (e) { console.log(`  POST /api/backups -> ERROR: ${e.message}`); failed++; }

  // POST /api/client-classifications
  try {
    const r = await request('POST', '/api/client-classifications', { name: 'VIP', discount_percentage: 10, credit_limit: 50000 });
    console.log(`  POST /api/client-classifications -> ${r.status} ${r.status === 200 || r.status === 201 ? '✓' : '✗'}`);
    if (r.status === 200 || r.status === 201) passed++; else failed++;
  } catch (e) { console.log(`  POST /api/client-classifications -> ERROR: ${e.message}`); failed++; }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed of ${endpoints.length + 2} ===`);
}

test().catch(e => { console.log('FATAL:', e.message); process.exit(1); });
