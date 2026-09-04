import type { PublicRuntimeConfig } from './supabase';

export class RuntimeConfigurationError extends Error {
  missing: string[];

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = 'RuntimeConfigurationError';
    this.missing = missing;
  }
}

export async function loadRuntimeConfig(): Promise<PublicRuntimeConfig> {
  let response: Response;
  try {
    response = await fetch('/api/public-config', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
  } catch {
    throw new RuntimeConfigurationError('Cloudflare Worker tidak dapat dihubungi. Periksa deployment Worker dan route /api/*.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const missing = Array.isArray(payload?.missing) ? payload.missing : [];
    throw new RuntimeConfigurationError(
      payload?.message || 'Konfigurasi runtime aplikasi belum lengkap.',
      missing
    );
  }

  return {
    supabaseUrl: String(payload.supabaseUrl || ''),
    supabasePublishableKey: String(payload.supabasePublishableKey || ''),
    appName: String(payload.appName || 'Executive KPI Manufacturing Control Center'),
    companyName: String(payload.companyName || 'PT BANSHU ELECTRIC INDONESIA'),
    appVersion: String(payload.appVersion || '2.0.0')
  };
}
