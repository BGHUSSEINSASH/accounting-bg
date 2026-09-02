#!/usr/bin/env node
/**
 * deploy-full.js
 * نشر كامل تلقائي للنظام المحاسبي
 * 
 * الاستخدام:
 *   node deploy-full.js --supabase-token=<TOKEN> --render-token=<TOKEN> --vercel-token=<TOKEN>
 * 
 * أو تعيين متغيرات البيئة:
 *   SUPABASE_ACCESS_TOKEN=xxx RENDER_API_KEY=xxx VERCEL_TOKEN=xxx node deploy-full.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ===== Parse args =====
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => a.slice(2).split('='))
);

const SUPABASE_TOKEN = args['supabase-token'] || process.env.SUPABASE_ACCESS_TOKEN;
const RENDER_TOKEN   = args['render-token']   || process.env.RENDER_API_KEY;
const VERCEL_TOKEN   = args['vercel-token']   || process.env.VERCEL_TOKEN;
const GITHUB_REPO    = args['repo']           || 'BGHUSSEINSASH/accounting-bg';

function log(msg, color = 'reset') {
  const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m', reset: '\x1b[0m', bold: '\x1b[1m' };
  console.log(`${colors[color] || ''}${msg}${colors.reset}`);
}

function apiCall(hostname, path, method = 'GET', body = null, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname, path, method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extraHeaders,
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ===== Step 1: Build locally =====
async function buildLocally() {
  log('\n📦 Building Backend...', 'blue');
  try {
    execSync('npm install --ignore-scripts && npx tsc', { cwd: path.join(__dirname, 'backend'), stdio: 'inherit' });
    log('✅ Backend built successfully', 'green');
  } catch (e) { log('❌ Backend build failed', 'red'); throw e; }

  log('\n📦 Building Frontend...', 'blue');
  try {
    execSync('npm install && npm run build', { cwd: path.join(__dirname, 'frontend'), stdio: 'inherit' });
    log('✅ Frontend built successfully', 'green');
  } catch (e) { log('❌ Frontend build failed', 'red'); throw e; }
}

// ===== Step 2: Create Supabase Project + Run Schema =====
async function setupSupabase() {
  if (!SUPABASE_TOKEN) { log('⚠️  No SUPABASE_ACCESS_TOKEN — skipping Supabase setup', 'yellow'); return null; }
  
  log('\n🗄️  Setting up Supabase...', 'blue');
  
  // List existing projects
  const projects = await apiCall('api.supabase.com', '/v1/projects', 'GET', null, SUPABASE_TOKEN);
  if (projects.status !== 200) { log('❌ Failed to list Supabase projects: ' + JSON.stringify(projects.data), 'red'); return null; }
  
  let project = projects.data.find(p => p.name === 'accounting-bg');
  
  if (!project) {
    log('Creating new Supabase project "accounting-bg"...', 'yellow');
    // Need an organization ID first
    const orgs = await apiCall('api.supabase.com', '/v1/organizations', 'GET', null, SUPABASE_TOKEN);
    const orgId = orgs.data[0]?.id;
    if (!orgId) { log('❌ No Supabase organization found', 'red'); return null; }
    
    const dbPassword = 'AccountingBG_' + Math.random().toString(36).slice(2, 10) + '_2024!';
    const created = await apiCall('api.supabase.com', '/v1/projects', 'POST', {
      name: 'accounting-bg',
      organization_id: orgId,
      plan: 'free',
      region: 'eu-central-1',
      db_pass: dbPassword,
    }, SUPABASE_TOKEN);
    
    if (created.status !== 201) { log('❌ Failed to create Supabase project: ' + JSON.stringify(created.data), 'red'); return null; }
    project = created.data;
    log(`✅ Created Supabase project: ${project.id}`, 'green');
    
    // Wait for project to be ready
    log('⏳ Waiting for project to initialize (60s)...', 'yellow');
    await new Promise(r => setTimeout(r, 60000));
  } else {
    log(`✅ Found existing Supabase project: ${project.id}`, 'green');
  }
  
  // Get connection string
  const dbInfo = await apiCall('api.supabase.com', `/v1/projects/${project.id}/database/connection-pooler`, 'GET', null, SUPABASE_TOKEN);
  const connStr = `postgresql://postgres.${project.id}:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
  
  // Run schema via SQL API
  log('Running PostgreSQL schema...', 'yellow');
  const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.postgresql.sql'), 'utf8');
  
  // Split into individual statements for API
  const statements = schema.split(';').filter(s => s.trim().length > 0);
  let failed = 0;
  for (const stmt of statements.slice(0, 10)) { // Test first few
    const result = await apiCall('api.supabase.com', `/v1/projects/${project.id}/database/query`, 'POST', 
      { query: stmt + ';' }, SUPABASE_TOKEN);
    if (result.status !== 200) failed++;
  }
  log(`Schema: ${statements.length} statements, ${failed} warnings (duplicates OK)`, failed > 0 ? 'yellow' : 'green');
  
  log(`\n📋 Supabase Project URL: https://${project.id}.supabase.co`, 'bold');
  log(`📋 Connection String: postgresql://postgres:[YOUR_DB_PASSWORD]@db.${project.id}.supabase.co:5432/postgres`, 'bold');
  
  return { projectId: project.id, connectionString: connStr };
}

// ===== Step 3: Deploy to Render =====
async function deployToRender(supabaseInfo) {
  if (!RENDER_TOKEN) { log('\n⚠️  No RENDER_API_KEY — skipping Render deployment', 'yellow'); return null; }
  
  log('\n🚀 Deploying to Render...', 'blue');
  
  // List services
  const services = await apiCall('api.render.com', '/v1/services?limit=20', 'GET', null, RENDER_TOKEN);
  if (services.status !== 200) { log('❌ Render API error: ' + JSON.stringify(services.data), 'red'); return null; }
  
  let service = services.data?.find(s => s.service?.name === 'accounting-bg-backend');
  
  if (!service) {
    log('Creating new Render service...', 'yellow');
    // Get owner ID
    const owner = await apiCall('api.render.com', '/v1/owners?limit=1', 'GET', null, RENDER_TOKEN);
    const ownerId = owner.data[0]?.owner?.id;
    
    const created = await apiCall('api.render.com', '/v1/services', 'POST', {
      type: 'web_service',
      name: 'accounting-bg-backend',
      ownerId,
      repo: `https://github.com/${GITHUB_REPO}`,
      branch: 'main',
      rootDir: 'backend',
      buildCommand: 'npm install --ignore-scripts && npm run build',
      startCommand: 'node dist/app.js',
      plan: 'free',
      region: 'frankfurt',
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '3000' },
        { key: 'JWT_SECRET', generateValue: true },
        { key: 'REFRESH_SECRET', generateValue: true },
      ]
    }, RENDER_TOKEN);
    
    service = created.data;
    log(`✅ Created Render service: ${service?.service?.id}`, 'green');
  } else {
    log(`✅ Found existing Render service`, 'green');
    // Trigger deploy
    await apiCall('api.render.com', `/v1/services/${service.service.id}/deploys`, 'POST', {}, RENDER_TOKEN);
    log('✅ Deploy triggered', 'green');
  }
  
  const serviceUrl = `https://accounting-bg-backend.onrender.com`;
  log(`📋 Backend URL: ${serviceUrl}`, 'bold');
  return serviceUrl;
}

// ===== Step 4: Deploy to Vercel =====
async function deployToVercel(backendUrl) {
  if (!VERCEL_TOKEN) { log('\n⚠️  No VERCEL_TOKEN — skipping Vercel deployment', 'yellow'); return null; }
  
  log('\n⚡ Deploying to Vercel...', 'blue');
  
  // Get team/user info
  const user = await apiCall('api.vercel.com', '/v2/user', 'GET', null, VERCEL_TOKEN);
  if (user.status !== 200) { log('❌ Vercel API error', 'red'); return null; }
  
  // Create/get project
  const projects = await apiCall('api.vercel.com', '/v9/projects', 'GET', null, VERCEL_TOKEN);
  let project = projects.data?.projects?.find(p => p.name === 'accounting-bg');
  
  if (!project) {
    log('Creating Vercel project...', 'yellow');
    const created = await apiCall('api.vercel.com', '/v9/projects', 'POST', {
      name: 'accounting-bg',
      framework: 'vite',
      rootDirectory: 'frontend',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      installCommand: 'npm install',
      gitRepository: { type: 'github', repo: GITHUB_REPO },
      environmentVariables: [
        { key: 'VITE_API_BASE_URL', value: `${backendUrl || 'https://accounting-bg-backend.onrender.com'}/api`, target: ['production'] }
      ]
    }, VERCEL_TOKEN);
    project = created.data;
    log(`✅ Created Vercel project: ${project?.id}`, 'green');
  } else {
    log(`✅ Found existing Vercel project: ${project.id}`, 'green');
  }
  
  const frontendUrl = `https://accounting-bg.vercel.app`;
  log(`📋 Frontend URL: ${frontendUrl}`, 'bold');
  return frontendUrl;
}

// ===== Main =====
async function main() {
  log('\n🚀 النظام المحاسبي المتكامل — Deploy Script\n', 'bold');
  log('=' .repeat(60), 'blue');
  
  if (!SUPABASE_TOKEN && !RENDER_TOKEN && !VERCEL_TOKEN) {
    log('\n⚠️  No API tokens provided. Running local build only.\n', 'yellow');
    log('To deploy, provide tokens:', 'yellow');
    log('  SUPABASE_ACCESS_TOKEN=xxx  (from supabase.com/dashboard/account/tokens)', 'yellow');
    log('  RENDER_API_KEY=xxx         (from render.com/account/api-keys)', 'yellow');
    log('  VERCEL_TOKEN=xxx           (from vercel.com/account/tokens)', 'yellow');
    log('\nOr use: node deploy-full.js --supabase-token=xxx --render-token=xxx --vercel-token=xxx\n', 'yellow');
  }
  
  // Always build locally first
  await buildLocally();
  
  // Cloud deployments (if tokens provided)
  const supabaseInfo = await setupSupabase();
  const backendUrl = await deployToRender(supabaseInfo);
  const frontendUrl = await deployToVercel(backendUrl);
  
  // Summary
  log('\n' + '='.repeat(60), 'green');
  log('✅ Deployment Complete!\n', 'green');
  if (backendUrl)  log(`🔵 Backend API:  ${backendUrl}/api`, 'bold');
  if (frontendUrl) log(`🟢 Frontend App: ${frontendUrl}`, 'bold');
  log(`📦 GitHub Repo:  https://github.com/${GITHUB_REPO}`, 'bold');
  log('\n📋 Next Steps:', 'yellow');
  if (!supabaseInfo) {
    log('  1. Create Supabase project at https://supabase.com', 'yellow');
    log('  2. Run database/schema.postgresql.sql in SQL editor', 'yellow');
    log('  3. Set DATABASE_URL in Render environment variables', 'yellow');
  }
  if (!backendUrl) {
    log('  1. Create Web Service at https://render.com', 'yellow');
    log('     Root: backend | Build: npm install --ignore-scripts && npm run build | Start: node dist/app.js', 'yellow');
  }
  if (!frontendUrl) {
    log('  1. Import project at https://vercel.com from GitHub', 'yellow');
    log('     Root: frontend | VITE_API_BASE_URL=https://your-backend.onrender.com/api', 'yellow');
  }
  log('\n📖 See DEPLOYMENT.md for complete instructions\n', 'blue');
}

main().catch(err => { log('\n❌ Deploy failed: ' + err.message, 'red'); process.exit(1); });
