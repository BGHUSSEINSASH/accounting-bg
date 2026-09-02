# ============================================================
# deploy.ps1 - Arabic Accounting System Deployment Script
# Usage: .\deploy.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; exit 1 }

Write-Host @"

  =====================================================
   نظام الحسابات العربي - Arabic Accounting System
   Deployment Script (Windows PowerShell)
  =====================================================

"@ -ForegroundColor Yellow

# ---- TASK 1: Validate required tools ----
Write-Step "Validating required tools..."

foreach ($tool in @("node", "npm", "git")) {
    try {
        $ver = & $tool --version 2>&1
        Write-OK "$tool : $ver"
    } catch {
        Write-Fail "$tool is not installed or not in PATH. Please install it first."
    }
}

# ---- TASK 2: Build Backend ----
Write-Step "Building backend..."

$backendDir = Join-Path $ProjectRoot "backend"
if (-not (Test-Path $backendDir)) { Write-Fail "backend/ directory not found at $backendDir" }

Push-Location $backendDir
try {
    Write-Host "  Installing backend dependencies (--ignore-scripts)..."
    npm install --ignore-scripts
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed for backend" }

    Write-Host "  Compiling TypeScript..."
    npx tsc
    if ($LASTEXITCODE -ne 0) { Write-Fail "tsc compilation failed for backend" }
    Write-OK "Backend built successfully"
} finally {
    Pop-Location
}

# ---- TASK 3: Build Frontend ----
Write-Step "Building frontend..."

$frontendDir = Join-Path $ProjectRoot "frontend"
if (-not (Test-Path $frontendDir)) { Write-Fail "frontend/ directory not found at $frontendDir" }

Push-Location $frontendDir
try {
    Write-Host "  Installing frontend dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed for frontend" }

    Write-Host "  Building frontend (Vite)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build failed for frontend" }
    Write-OK "Frontend built successfully"
} finally {
    Pop-Location
}

# ---- TASK 4: Print Supabase Setup Instructions ----
Write-Step "Supabase Setup Instructions"

$schemaPath = Join-Path $ProjectRoot "database\schema.postgresql.sql"
if (Test-Path $schemaPath) {
    Write-Host @"

  1. Go to https://supabase.com and create a new project.
  2. Open the SQL Editor in your Supabase dashboard.
  3. Copy and paste the contents of:
       $schemaPath
     then click "Run".
  4. After schema is applied, go to Settings > Database and copy:
       - Host
       - Port (usually 5432)
       - Database name
       - User
       - Password
  5. Build your DATABASE_URL as:
       postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require

"@ -ForegroundColor White
} else {
    Write-Host "  [WARNING] Schema file not found at $schemaPath" -ForegroundColor Yellow
}

# ---- TASK 5: Print Render Setup Instructions ----
Write-Step "Render.com Backend Deployment"

Write-Host @"

  1. Go to https://render.com and create a new Web Service.
  2. Connect your GitHub repository.
  3. Configure the service:
       - Name         : arabic-accounting-backend
       - Region       : Frankfurt (EU) or closest to your users
       - Branch       : main
       - Root Dir     : backend
       - Runtime      : Node
       - Build Cmd    : npm install --ignore-scripts && npx tsc
       - Start Cmd    : node dist/server.js
  4. Add the following Environment Variables:
       DATABASE_URL   = <your Supabase connection string>
       JWT_SECRET     = <a random 64-char string>
       NODE_ENV       = production
       PORT           = 3000
       CORS_ORIGIN    = <your Vercel frontend URL>
  5. Click "Create Web Service".
  6. Copy the service URL (e.g. https://arabic-accounting-backend.onrender.com)

"@ -ForegroundColor White

# ---- TASK 6: Print Vercel Setup Instructions ----
Write-Step "Vercel.com Frontend Deployment"

Write-Host @"

  1. Go to https://vercel.com and import your GitHub repository.
  2. Configure the project:
       - Framework Preset : Vite
       - Root Directory   : frontend
       - Build Command    : npm run build
       - Output Directory : dist
  3. Add the following Environment Variable:
       VITE_API_URL = <your Render backend URL>/api
  4. Click "Deploy".

"@ -ForegroundColor White

# ---- TASK 7: Create .env.production.ready template ----
Write-Step "Creating .env.production.ready template..."

$envTemplate = @"
# ============================================================
# .env.production.ready
# Copy this file to backend/.env and fill in real values.
# DO NOT commit this file with real secrets.
# ============================================================

# ---- Database (Supabase PostgreSQL) ----
# Get from: Supabase Dashboard > Settings > Database
DATABASE_URL=postgresql://postgres:<PASSWORD>@<HOST>:5432/<DBNAME>?sslmode=require

# ---- Authentication ----
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX_STRING
JWT_EXPIRES_IN=7d

# ---- Server ----
NODE_ENV=production
PORT=3000

# ---- CORS ----
# Your Vercel frontend URL (no trailing slash)
CORS_ORIGIN=https://your-app.vercel.app

# ---- Email (optional, for notifications) ----
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password

# ---- File Uploads ----
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10mb
"@

$envOut = Join-Path $ProjectRoot ".env.production.ready"
$envTemplate | Set-Content -Path $envOut -Encoding UTF8
Write-OK ".env.production.ready created at $envOut"

# ---- Done ----
Write-Host @"

  =====================================================
   Deployment preparation complete!
  =====================================================
   Next steps:
     1. Apply database schema in Supabase (see above)
     2. Deploy backend to Render
     3. Deploy frontend to Vercel
     4. Update CORS_ORIGIN and VITE_API_URL with real URLs
     5. (Optional) Run: cd backend && npx ts-node src/migrate.ts --seed
  =====================================================

"@ -ForegroundColor Green
