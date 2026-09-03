/**
 * طابور مزامنة بدون اتصال — يخزن العمليات محلياً ويعيد إرسالها عند عودة الشبكة
 * (نسخة مكيّفة من frontend/src/services/syncQueue.ts للـReact Native)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

type NetworkState = {
  isConnected?: boolean | null;
};

const QUEUE_KEY = 'sync_queue_v1';

interface QueueItem {
  id: string;
  method: 'post' | 'put' | 'delete';
  url: string;
  data?: any;
  createdAt: number;
  attempts: number;
}

let listeners: Array<(count: number) => void> = [];
let queue: QueueItem[] = [];
let flushing = false;

export function subscribeSyncQueue(fn: (count: number) => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
  const pending = queue.length;
  listeners.forEach(fn => fn(pending));
}

async function loadQueue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue = raw ? JSON.parse(raw) : [];
  } catch { queue = []; }
}

async function saveQueue(): Promise<void> {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* ignore */ }
  notify();
}

export async function getPendingCount(): Promise<number> {
  if (queue.length === 0) await loadQueue();
  return queue.length;
}

/** يحاول الإرسال فوراً؛ عند الفشل الشبكي يضيف للطابور ويرجع {queued:true} */
export async function request(method: 'post' | 'put' | 'delete', url: string, data?: any): Promise<any> {
  try {
    const res = await api[method](url, data);
    return res;
  } catch (err: any) {
    const isNetworkError = !err.response; // لا رد = مشكلة شبكة
    if (!isNetworkError) throw err; // أخطاء الخادم الحقيقية تُمرر
    // حفظ في الطابور
    if (queue.length === 0) await loadQueue();
    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      method, url, data,
      createdAt: Date.now(),
      attempts: 0,
    });
    await saveQueue();
    return { data: { queued: true }, status: 202 };
  }
}

/** إعادة إرسال كل العمليات المعلقة (تُستدعى عند عودة الاتصال) */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;
  if (queue.length === 0) await loadQueue();
  let sent = 0, failed = 0;

  const remaining: QueueItem[] = [];
  for (const item of queue) {
    try {
      await api[item.method](item.url, item.data);
      sent++;
    } catch (err: any) {
      if (!err.response) {
        // ما زال بدون اتصال — أبقه مع حد أقصى للمحاولات
        item.attempts++;
        if (item.attempts < 20) remaining.push(item);
        else failed++;
      } else {
        // خطأ خادم حقيقي — لا تعيد المحاولة (تجنب التكرار)
        failed++;
      }
    }
  }
  queue = remaining;
  await saveQueue();
  flushing = false;
  return { sent, failed };
}

/** استمع لعودة الاتصال وامسح الطابور تلقائياً */
export function startAutoFlush(): void {
  import('@react-native-community/netinfo')
    .then(({ default: NetInfo }) => {
      NetInfo.addEventListener((state: NetworkState) => {
        if (state.isConnected) {
          flushQueue().then(({ sent }) => {
            if (sent > 0) console.log(`[sync] flushed ${sent} queued operations`);
          }).catch(() => {});
        }
      });
    })
    .catch(() => {
      // NetInfo غير مثبت — تجاهل
    });
}

// تهيئة أولية
loadQueue();
