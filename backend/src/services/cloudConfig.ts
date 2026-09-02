import { getDatabase } from '../config/database';

export type CloudProvider = 'none' | 'supabase' | 's3' | 'backblaze' | 'gdrive' | 'onedrive';

const MASK = '••••••••••••';

const DB_KEYS: Record<string, string> = {
  CLOUD_PROVIDER: 'cloud_provider',
  SUPABASE_URL: 'cloud_supabase_url',
  SUPABASE_SERVICE_ROLE_KEY: 'cloud_supabase_service_role_key',
  SUPABASE_BUCKET: 'cloud_supabase_bucket',
  S3_BUCKET: 'cloud_s3_bucket',
  S3_ACCESS_KEY_ID: 'cloud_s3_access_key_id',
  S3_SECRET_ACCESS_KEY: 'cloud_s3_secret_access_key',
  S3_REGION: 'cloud_s3_region',
  S3_ENDPOINT: 'cloud_s3_endpoint',
  S3_FORCE_PATH_STYLE: 'cloud_s3_force_path_style',
  S3_PUBLIC_URL: 'cloud_s3_public_url',
  GOOGLE_DRIVE_ACCESS_TOKEN: 'cloud_gdrive_access_token',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'cloud_gdrive_refresh_token',
  GOOGLE_DRIVE_CLIENT_ID: 'cloud_gdrive_client_id',
  GOOGLE_DRIVE_CLIENT_SECRET: 'cloud_gdrive_client_secret',
  GOOGLE_DRIVE_FOLDER_ID: 'cloud_gdrive_folder_id',
  ONEDRIVE_ACCESS_TOKEN: 'cloud_onedrive_access_token',
  ONEDRIVE_REFRESH_TOKEN: 'cloud_onedrive_refresh_token',
  ONEDRIVE_CLIENT_ID: 'cloud_onedrive_client_id',
  ONEDRIVE_CLIENT_SECRET: 'cloud_onedrive_client_secret',
  ONEDRIVE_FOLDER: 'cloud_onedrive_folder',
  CLOUD_SYNC_INTERVAL_MS: 'cloud_sync_interval_ms',
};

const SECRET_DB_KEYS = new Set([
  'cloud_supabase_service_role_key',
  'cloud_s3_secret_access_key',
  'cloud_gdrive_access_token',
  'cloud_gdrive_refresh_token',
  'cloud_gdrive_client_secret',
  'cloud_onedrive_access_token',
  'cloud_onedrive_refresh_token',
  'cloud_onedrive_client_secret',
]);

let cache: Record<string, string> | null = null;

function loadAll(): Record<string, string> {
  if (cache) return cache;
  try {
    const db = getDatabase();
    const rows = db.prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'cloud_%'").all() as any[];
    cache = {};
    for (const row of rows) {
      cache[row.setting_key] = row.setting_value ?? '';
    }
  } catch {
    cache = {};
  }
  return cache;
}

export function invalidateCloudConfigCache(): void {
  cache = null;
}

export function getCloudConfigSetting(dbKey: string): string | null {
  const all = loadAll();
  return all[dbKey] ?? null;
}

export function setCloudConfigSetting(dbKey: string, value: string): void {
  const db = getDatabase();
  db.prepare("INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
    .run(dbKey, value);
  if (cache) cache[dbKey] = value;
}

export function getMergedEnv(envKey: string): string | undefined {
  if (process.env[envKey]) return process.env[envKey];
  const dbKey = DB_KEYS[envKey];
  if (!dbKey) return undefined;
  const value = getCloudConfigSetting(dbKey);
  return value || undefined;
}

export interface CloudConfigResponse {
  provider: CloudProvider;
  supabase: { url: string; serviceRoleKey: string; bucket: string };
  s3: { bucket: string; accessKeyId: string; secretAccessKey: string; region: string; endpoint: string; forcePathStyle: string; publicUrl: string };
  gdrive: { accessToken: string; refreshToken: string; clientId: string; clientSecret: string; folderId: string };
  onedrive: { accessToken: string; refreshToken: string; clientId: string; clientSecret: string; folder: string };
  syncIntervalMs: string;
}

function masked(value: string | undefined): string {
  return value ? MASK : '';
}

export function getCloudConfig(): CloudConfigResponse {
  const provider = (getMergedEnv('CLOUD_PROVIDER') || 'none').toLowerCase() as CloudProvider;
  return {
    provider,
    supabase: {
      url: getMergedEnv('SUPABASE_URL') || '',
      serviceRoleKey: masked(getMergedEnv('SUPABASE_SERVICE_ROLE_KEY')),
      bucket: getMergedEnv('SUPABASE_BUCKET') || '',
    },
    s3: {
      bucket: getMergedEnv('S3_BUCKET') || '',
      accessKeyId: getMergedEnv('S3_ACCESS_KEY_ID') || '',
      secretAccessKey: masked(getMergedEnv('S3_SECRET_ACCESS_KEY')),
      region: getMergedEnv('S3_REGION') || 'us-east-1',
      endpoint: getMergedEnv('S3_ENDPOINT') || '',
      forcePathStyle: getMergedEnv('S3_FORCE_PATH_STYLE') || 'true',
      publicUrl: getMergedEnv('S3_PUBLIC_URL') || '',
    },
    gdrive: {
      accessToken: masked(getMergedEnv('GOOGLE_DRIVE_ACCESS_TOKEN')),
      refreshToken: masked(getMergedEnv('GOOGLE_DRIVE_REFRESH_TOKEN')),
      clientId: getMergedEnv('GOOGLE_DRIVE_CLIENT_ID') || '',
      clientSecret: masked(getMergedEnv('GOOGLE_DRIVE_CLIENT_SECRET')),
      folderId: getMergedEnv('GOOGLE_DRIVE_FOLDER_ID') || '',
    },
    onedrive: {
      accessToken: masked(getMergedEnv('ONEDRIVE_ACCESS_TOKEN')),
      refreshToken: masked(getMergedEnv('ONEDRIVE_REFRESH_TOKEN')),
      clientId: getMergedEnv('ONEDRIVE_CLIENT_ID') || '',
      clientSecret: masked(getMergedEnv('ONEDRIVE_CLIENT_SECRET')),
      folder: getMergedEnv('ONEDRIVE_FOLDER') || 'backups',
    },
    syncIntervalMs: getMergedEnv('CLOUD_SYNC_INTERVAL_MS') || String(15 * 60 * 1000),
  };
}

function saveSecret(dbKey: string, value: any): void {
  if (value === undefined || value === null || value === '') return;
  if (value === MASK) return;
  setCloudConfigSetting(dbKey, String(value));
}

export function saveCloudConfig(payload: any): void {
  const provider = String(payload?.provider || 'none').toLowerCase();
  setCloudConfigSetting('cloud_provider', provider);

  const supabase = payload?.supabase || {};
  saveSecret('cloud_supabase_url', supabase.url);
  saveSecret('cloud_supabase_service_role_key', supabase.serviceRoleKey);
  saveSecret('cloud_supabase_bucket', supabase.bucket);

  const s3 = payload?.s3 || {};
  saveSecret('cloud_s3_bucket', s3.bucket);
  saveSecret('cloud_s3_access_key_id', s3.accessKeyId);
  saveSecret('cloud_s3_secret_access_key', s3.secretAccessKey);
  saveSecret('cloud_s3_region', s3.region);
  saveSecret('cloud_s3_endpoint', s3.endpoint);
  saveSecret('cloud_s3_force_path_style', s3.forcePathStyle);
  saveSecret('cloud_s3_public_url', s3.publicUrl);

  const gdrive = payload?.gdrive || {};
  saveSecret('cloud_gdrive_access_token', gdrive.accessToken);
  saveSecret('cloud_gdrive_refresh_token', gdrive.refreshToken);
  saveSecret('cloud_gdrive_client_id', gdrive.clientId);
  saveSecret('cloud_gdrive_client_secret', gdrive.clientSecret);
  saveSecret('cloud_gdrive_folder_id', gdrive.folderId);

  const onedrive = payload?.onedrive || {};
  saveSecret('cloud_onedrive_access_token', onedrive.accessToken);
  saveSecret('cloud_onedrive_refresh_token', onedrive.refreshToken);
  saveSecret('cloud_onedrive_client_id', onedrive.clientId);
  saveSecret('cloud_onedrive_client_secret', onedrive.clientSecret);
  saveSecret('cloud_onedrive_folder', onedrive.folder);

  if (payload?.syncIntervalMs) {
    setCloudConfigSetting('cloud_sync_interval_ms', String(payload.syncIntervalMs));
  }

  invalidateCloudConfigCache();
}

export function isSecret(dbKey: string): boolean {
  return SECRET_DB_KEYS.has(dbKey);
}
