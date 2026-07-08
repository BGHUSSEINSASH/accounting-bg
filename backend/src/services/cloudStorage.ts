import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import logger from '../utils/logger';

export type CloudProvider = 'none' | 'supabase' | 's3' | 'backblaze';

export interface CloudStatus {
  provider: CloudProvider;
  configured: boolean;
  bucket?: string;
  endpoint?: string;
}

const s3ClientCache = new Map<string, S3Client>();

export function getCloudProvider(): CloudProvider {
  return (process.env.CLOUD_PROVIDER || 'none').toLowerCase() as CloudProvider;
}

export function isCloudConfigured(): boolean {
  return getCloudProvider() !== 'none';
}

export function getCloudStatus(): CloudStatus {
  const provider = getCloudProvider();
  if (provider === 'supabase') {
    return {
      provider,
      configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_BUCKET),
      bucket: process.env.SUPABASE_BUCKET,
      endpoint: process.env.SUPABASE_URL,
    };
  }

  if (provider === 's3' || provider === 'backblaze') {
    return {
      provider,
      configured: !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && (process.env.S3_ENDPOINT || provider === 's3')),
      bucket: process.env.S3_BUCKET,
      endpoint: process.env.S3_ENDPOINT || `https://s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com`,
    };
  }

  return { provider: 'none', configured: false };
}

function getS3Client(): S3Client {
  const provider = getCloudProvider();
  const region = process.env.S3_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || (provider === 'backblaze' ? undefined : undefined);
  const cacheKey = `${provider}:${region}:${endpoint || ''}`;
  const cached = s3ClientCache.get(cacheKey);
  if (cached) return cached;

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || 'true').toLowerCase() !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  });
  s3ClientCache.set(cacheKey, client);
  return client;
}

export function buildCloudKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\\/g, '/');
}

export async function uploadToCloud(key: string, filePath: string, contentType?: string): Promise<string | null> {
  const provider = getCloudProvider();
  const normalizedKey = buildCloudKey(key);
  if (provider === 'none') return null;

  const body = fs.readFileSync(filePath);

  if (provider === 'supabase') {
    const baseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_BUCKET;
    if (!baseUrl || !serviceRole || !bucket) throw new Error('Supabase storage is not configured');

    const url = `${baseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodeURIComponent(normalizedKey)}`;
    const response = await fetch(`${url}?upsert=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        'Content-Type': contentType || 'application/octet-stream',
      },
      body,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Supabase upload failed: ${response.status} ${message}`);
    }

    return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${normalizedKey}`;
  }

  if (provider === 's3' || provider === 'backblaze') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3 bucket is not configured');
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    });
    await getS3Client().send(command);
    return process.env.S3_PUBLIC_URL ? `${process.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${normalizedKey}` : null;
  }

  return null;
}

export async function deleteFromCloud(key: string): Promise<void> {
  const provider = getCloudProvider();
  const normalizedKey = buildCloudKey(key);
  if (provider === 'none') return;

  if (provider === 'supabase') {
    const baseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_BUCKET;
    if (!baseUrl || !serviceRole || !bucket) return;
    await fetch(`${baseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodeURIComponent(normalizedKey)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
      },
    });
    return;
  }

  if (provider === 's3' || provider === 'backblaze') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return;
    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: normalizedKey }));
  }
}

export function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.json') return 'application/json';
  return 'application/octet-stream';
}

export function getDefaultCloudPublicUrl(key: string): string | null {
  const provider = getCloudProvider();
  const normalizedKey = buildCloudKey(key);
  if (provider === 'supabase') {
    const baseUrl = process.env.SUPABASE_URL;
    const bucket = process.env.SUPABASE_BUCKET;
    if (!baseUrl || !bucket) return null;
    return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${normalizedKey}`;
  }
  if ((provider === 's3' || provider === 'backblaze') && process.env.S3_PUBLIC_URL) {
    return `${process.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${normalizedKey}`;
  }
  return null;
}

export function logCloudProviderWarning(): void {
  const status = getCloudStatus();
  if (status.provider !== 'none' && !status.configured) {
    logger.warn(`Cloud provider ${status.provider} is enabled but not fully configured`);
  }
}