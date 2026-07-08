import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { getApiBaseUrl } from '../utils/apiUrl';

type QueueMethod = 'post' | 'put' | 'patch' | 'delete';

interface QueuedRequest {
  id: string;
  method: QueueMethod;
  url: string;
  data: unknown;
  headers?: Record<string, string>;
  createdAt: string;
  attempts: number;
}

const STORAGE_KEY = 'pending_sync_requests_v1';
const listeners = new Set<() => void>();
let started = false;
let flushing = false;

function readQueue(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as QueuedRequest[] : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  listeners.forEach((listener) => listener());
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

function isSerializableData(data: unknown): boolean {
  if (!data) return true;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return false;
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) return false;
  return typeof data === 'object' || typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean';
}

export function isQueueableMethod(method?: string): method is QueueMethod {
  return !!method && ['post', 'put', 'patch', 'delete'].includes(method.toLowerCase());
}

export function isOfflineMutationError(error: any): boolean {
  return !error?.response && (error?.message?.toLowerCase?.().includes('network') || error?.message?.toLowerCase?.().includes('failed') || navigator.onLine === false);
}

export function getPendingSyncCount(): number {
  return readQueue().length;
}

export function subscribeSyncQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function enqueueRequest(config: AxiosRequestConfig): void {
  const method = (config.method || 'post').toLowerCase() as QueueMethod;
  if (!isQueueableMethod(method) || !isSerializableData(config.data)) return;

  const queue = readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    method,
    url: config.url || '',
    data: config.data,
    headers: {
      ...((config.headers as Record<string, string>) || {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  writeQueue(queue);
}

export async function flushSyncQueue(): Promise<{ processed: number; remaining: number }> {
  if (flushing) return { processed: 0, remaining: getPendingSyncCount() };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { processed: 0, remaining: getPendingSyncCount() };

  flushing = true;
  const client = axios.create({ baseURL: getApiBaseUrl(), headers: { 'Content-Type': 'application/json' } });
  const queue = readQueue();
  const remaining: QueuedRequest[] = [];
  let processed = 0;

  try {
    for (const item of queue) {
      try {
        await client.request({
          method: item.method,
          url: item.url,
          data: item.data,
          headers: item.headers,
          withCredentials: true,
        });
        processed += 1;
      } catch {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }
    writeQueue(remaining);
    return { processed, remaining: remaining.length };
  } finally {
    flushing = false;
  }
}

export function startSyncQueue(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const syncNow = () => { void flushSyncQueue(); };
  window.addEventListener('online', syncNow);
  window.addEventListener('focus', syncNow);
  void flushSyncQueue();
}