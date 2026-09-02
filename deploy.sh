#!/bin/bash
# ============================================================
# deploy.sh - Arabic Accounting System Deployment Script
# Usage: bash deploy.sh
# ============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

step() { echo -e "\n${CYAN}==> $1${NC}"; }
ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; exit 1; }

echo -e "${YELLOW}
  =====================================================
   نظام الحسابات العربي - Arabic Accounting System
   Deployment Script (bash)
  =====================================================${NC}
"

# ---- TASK 1: Validate required tools ----
step "Validating required tools..."
for tool in node npm git; do
    if command -v "$tool" &>/dev/null; then
        ok "$tool: $($tool --version 2>&1 | head -1)"
    else
        fail "$tool is not installed. Please install it first."
    fi
done

# ---- TASK 2: Build Backend ----
step "Building backend..."
BACKEND_DIR="$PROJECT_ROOT/backend"
[ -d "$BACKEND_DIR" ] || fail "backend/ directory not found at $BACKEND_DIR"

cd "$BACKEND_DIR"
echo "  Installing backend dependencies (--ignore-scripts)..."
npm install --ignore-scripts || fail "npm install failed for backend"

echo "  Compiling TypeScript..."
npx tsc || fail "tsc compilation failed for backend"
ok "Backend built successfully"

# ---- TASK 3: Build Frontend ----
step "Building frontend..."
FRONTEND_DIR="$PROJECT_ROOT/frontend"
[ -d "$FRONTEND_DIR" ] || fail "frontend/ directory not found at $FRONTEND_DIR"

cd "$FRONTEND_DIR"
echo "  Installing frontend dependencies..."
npm install || fail "npm install failed for frontend"

echo "  Building frontend (Vite)..."
npm run build || fail "npm run build failed for frontend"
ok "Frontend built successfully"

# ---- TASK 4: Print Supabase Setup Instructions ----
step "Supabase Setup Instructions"
SCHEMA_PATH="$PROJECT_ROOT/database/schema.postgresql.sql"
if [ -f "$SCHEMA_PATH" ]; then
  echo -e "
  1. Go to https://supabase.com and create a new project.
  2. Open the SQL Editor in your Supabase dashboard.
  3. Copy and paste the contents of:
       $SCHEMA_PATH
     then click 'Run'.
  4. Go to Settings > Database and copy:
       - Host, Port (5432), Database name, User, Password
  5. Build your DATABASE_URL as:
       postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require
"
else
    echo "  [WARNING] Schema file not found at $SCHEMA_PATH"
fi

# ---- TASK 5: Print Render Setup Instructions ----
step "Render.com Backend Deployment"
echo -e "
  1. Go to https://render.com and create a new Web Service.
  2. Connect your GitHub repository.
  3. Configure the service:
       - Name        : arabic-accounting-backend
       - Root Dir    : backend
       - Runtime     : Node
       - Build Cmd   : npm install --ignore-scripts && npx tsc
       - Start Cmd   : node dist/server.js
  4. Add Environment Variables:
       DATABASE_URL  = <your Supabase connection string>
       JWT_SECRET    = <random 64-char hex>
       NODE_ENV      = production
       PORT          = 3000
       CORS_ORIGIN   = <your Vercel frontend URL>
  5. Click 'Create Web Service' and copy the service URL.
"

# ---- TASK 6: Print Vercel Setup Instructions ----
step "Vercel.com Frontend Deployment"
echo -e "
  1. Go to https://vercel.com and import your GitHub repository.
  2. Configure:
       - Framework   : Vite
       - Root Dir    : frontend
       - Build Cmd   : npm run build
       - Output Dir  : dist
  3. Add Environment Variable:
       VITE_API_URL  = <your Render backend URL>/api
  4. Click 'Deploy'.
"

# ---- TASK 7: Create .env.production.ready template ----
step "Creating .env.production.ready template..."

cat > "$PROJECT_ROOT/.env.production.ready" << 'EOF'
# ============================================================
# .env.production.ready
# Copy this file to backend/.env and fill in real values.
# DO NOT commit this file with real secrets.
# ============================================================

# ---- Database (Supabase PostgreSQL) ----
DATABASE_URL=postgresql://postgres:<PASSWORD>@<HOST>:5432/<DBNAME>?sslmode=require

# ---- Authentication ----
JWT_SECRET=REPLACE_WITH_RANDOM_64_CHAR_HEX_STRING
JWT_EXPIRES_IN=7d

# ---- Server ----
NODE_ENV=production
PORT=3000

# ---- CORS ----
CORS_ORIGIN=https://your-app.vercel.app

# ---- Email (optional) ----
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password

# ---- File Uploads ----
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10mb
EOF

ok ".env.production.ready created"

echo -e "${GREEN}
  =====================================================
   Deployment preparation complete!
  =====================================================
   Next steps:
     1. Apply database schema in Supabase (see above)
     2. Deploy backend to Render
     3. Deploy frontend to Vercel
     4. Update CORS_ORIGIN and VITE_API_URL with real URLs
     5. (Optional) cd backend && npx ts-node src/migrate.ts --seed
  =====================================================${NC}
"
