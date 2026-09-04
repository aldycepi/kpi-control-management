import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type PublicRuntimeConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  appName: string;
  companyName: string;
  appVersion: string;
};

let client: SupabaseClient | null = null;
let runtimeConfig: PublicRuntimeConfig | null = null;

export function configureSupabase(config: PublicRuntimeConfig) {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error('Konfigurasi publik Supabase belum lengkap.');
  }

  const normalizedUrl = config.supabaseUrl.replace(/\/+$/, '');
  runtimeConfig = { ...config, supabaseUrl: normalizedUrl };
  client = createClient(normalizedUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'banshu-kpi-v2-auth'
    },
    global: {
      headers: {
        'X-Client-Info': `banshu-kpi/${config.appVersion || '2.0.0'}`
      }
    }
  });
}

export function getRuntimeConfig() {
  return runtimeConfig;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase client belum diinisialisasi dari Cloudflare runtime config.');
  }
  return client;
}

// Existing application modules can keep using `supabase.from(...)`.
// The real client is attached before React renders.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const instance = getSupabase() as any;
    const value = instance[property as any];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});
