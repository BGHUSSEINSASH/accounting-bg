import { getDatabase } from '../config/database';

export function getWhatsAppConfig(): any {
  const db = getDatabase();
  const cfg = db.prepare('SELECT * FROM whatsapp_config LIMIT 1').get();
  return cfg || {};
}

function logMessage(db: any, to: string, message: string, status: string, provider: string | null, response: string | null, userId: number | null): void {
  db.prepare('INSERT INTO whatsapp_messages (to_number, message, status, provider, response, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(to, message.slice(0, 2000), status, provider || null, response || null, userId);
}

export async function sendWhatsAppMessage(to: string, message: string, userId?: number): Promise<{ ok: boolean; status: string; error?: string }> {
  const db = getDatabase();
  const cfg = getWhatsAppConfig();
  const provider = cfg.provider || 'meta';

  if (!cfg.is_active) {
    logMessage(db, to, message, 'not_configured', provider, 'واتساب غير مفعّل أو غير مهيأ', userId || null);
    return { ok: false, status: 'not_configured', error: 'واتساب غير مفعّل' };
  }
  if (!to || !message) return { ok: false, status: 'invalid', error: 'الرقم والرسالة مطلوبان' };

  const normalizedTo = String(to).replace(/[^0-9]/g, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let sentProvider = provider;
    let responseText = '';
    if (provider === 'twilio') {
      if (!cfg.account_sid || !cfg.api_token) throw new Error('بيانات Twilio غير مكتملة');
      const form = new URLSearchParams();
      form.append('To', 'whatsapp:+' + normalizedTo);
      form.append('From', cfg.business_phone || 'whatsapp:+14155238886');
      form.append('Body', message);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.account_sid}/Messages.json`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${cfg.account_sid}:${cfg.api_token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      responseText = await res.text();
      if (!res.ok) throw new Error('خطأ Twilio ' + res.status + ': ' + responseText.slice(0, 200));
    } else if (provider === 'meta') {
      if (!cfg.phone_number_id || !cfg.api_token) throw new Error('بيانات واتساب (Meta) غير مكتملة');
      const res = await fetch(`https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': 'Bearer ' + cfg.api_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizedTo, type: 'text', text: { body: message } }),
      });
      responseText = await res.text();
      if (!res.ok) throw new Error('خطأ Meta ' + res.status + ': ' + responseText.slice(0, 200));
    } else {
      if (!cfg.api_url) throw new Error('رابط API العام غير مكتمل');
      const res = await fetch(cfg.api_url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.api_token ? { 'Authorization': 'Bearer ' + cfg.api_token } : {}),
        },
        body: JSON.stringify({ to: normalizedTo, message, from: cfg.business_phone || null }),
      });
      responseText = await res.text();
      if (!res.ok) throw new Error('خطأ API ' + res.status + ': ' + responseText.slice(0, 200));
    }
    logMessage(db, to, message, 'sent', sentProvider, responseText.slice(0, 500), userId || null);
    return { ok: true, status: 'sent' };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'انتهت مهلة الاتصال' : (err?.message || 'خطأ غير معروف');
    logMessage(db, to, message, 'failed', provider, msg.slice(0, 500), userId || null);
    return { ok: false, status: 'failed', error: msg };
  } finally {
    clearTimeout(timer);
  }
}
