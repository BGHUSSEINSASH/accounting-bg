# ============================================
# Multi-stage Docker build for Accounting System
# PostgreSQL version (no SQLite)
# ============================================

# Stage 1: Build Frontend
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Stage 2: Build Backend (no native modules needed for pg)
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
# Use --ignore-scripts to skip better-sqlite3 native build (we use pg now)
RUN npm install --ignore-scripts
COPY backend/ ./
COPY database/ /app/database/
RUN npm run build

# Stage 3: Production Runtime
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3000

# Copy built backend
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package.json ./package.json

# Copy PostgreSQL schema
COPY --from=backend-build /app/database /app/database

# Copy built frontend (served as static files)
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Create required directories
RUN mkdir -p /app/backend/uploads /app/backend/backups /app/backend/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000
CMD ["node", "dist/app.js"]
