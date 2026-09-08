import { query, queryOne, execute } from '../config/database';

export async function getWhatsAppConfig(): Promise<any> {
  try {
    const cfg = await queryOne('SELECT * FROM whatsapp_config LIMIT 1');
    return cfg || {};
  } catch {
    return {};
  }
}

async function logMessage(to: string, message: string, status: string, provider: string | null, response: string | null, userId: number | null): Promise<void> {
  try {
    await execute(
      'INSERT INTO whatsapp_messages (to_number, message, status, provider, response, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [to, message, status, provider, response, userId]
    );
  } catch { /* non-critical */ }
}

export async function sendWhatsAppMessage(to: string, message: string, userId: number | null = null): Promise<{ success: boolean; message?: string; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config || !config.is_active) {
    return { success: false, error: 'WhatsApp not configured' };
  }
  return { success: false, error: 'WhatsApp sending not yet implemented in this version' };
}
