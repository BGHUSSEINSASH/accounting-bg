# Deployment

## Free hosting stack

The simplest free setup for this project is:

- Frontend: Vercel free tier
- Backend: Render free tier
- Files and backups: Supabase free storage bucket
- Database: local SQLite on Render free tier for a lightweight demo, or migrate later to a managed database if you need persistence beyond the free tier

This repository now includes `render.yaml` for the backend, `frontend/vercel.json` for the frontend, and a frontend env template at `frontend/.env.production.example`.

## Container setup

The repository now includes a single container image that builds the frontend and backend together and serves the compiled frontend from the backend app.

## Environment variables

Set the backend values in `backend/.env.production` before starting the stack. The important deployment variables are:

- `PORT=3000`
- `NODE_ENV=production`
- `TRUST_PROXY=1`
- `APP_URL`, `PUBLIC_URL`, `FRONTEND_ORIGIN`, `CORS_ORIGIN`
- `DB_PATH=/app/backend/data/accounting.db`
- `UPLOAD_DIR=/app/backend/uploads`
- `BACKUP_DIR=/app/backend/backups`
- `CLOUD_PROVIDER=supabase` or `CLOUD_PROVIDER=s3`
- `CLOUD_SYNC_INTERVAL_MS`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`
- `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL`

## Nginx

The repository now includes an nginx reverse proxy template in [nginx/default.conf](nginx/default.conf) with:

- HTTP to HTTPS redirect
- TLS termination on port 443
- reverse proxy to the app container on port 3000
- an ACME challenge location for Let's Encrypt

Replace `example.com` with your real domain and mount your certificates under `nginx/certs/`.

Automatic renewal is handled by the `certbot` service in `docker-compose.yml`. It renews certificates every 12 hours and reloads nginx after a successful renewal.

## First certificate issue

Before the `certbot` loop can renew anything, run an initial issuance against your domain once DNS is pointing to this server. Use the same `DOMAIN_NAME` and `WWW_DOMAIN` values from `backend/.env.production`.

The repository includes [nginx/init-letsencrypt.sh](nginx/init-letsencrypt.sh) for that first issuance. Set `LETSENCRYPT_EMAIL` in `backend/.env.production`, then run the script from the server where Docker Compose is available.

## Run

```bash
docker compose up -d --build
```

The app will be available through nginx on ports `80` and `443`. If you want direct access during local debugging, you can still publish the app port separately.

## Free deployment steps

1. Create a Render web service from this repo using `render.yaml` or the Render dashboard.
2. Create a Vercel project from the `frontend` folder and set `VITE_API_BASE_URL` to your Render backend URL plus `/api`.
3. Create a Supabase project, then set `CLOUD_PROVIDER=supabase` and fill the storage credentials in Render.
4. Set the backend CORS origin to the Vercel URL so the browser can call the API cross-origin.
5. Keep uploads and backups in Supabase storage so file assets survive free-host restarts more reliably than local disk.

## Important limitation

The free tier on Render is good for demos and light usage, but its local disk is not a durable production database. For a truly permanent free setup, the next step is moving the SQLite data layer to a hosted free database service.