import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const SESSION_EXPIRY_BUFFER_SECONDS = 60;

function sessionStillValid(session: Session | null): session is Session {
  if (!session?.access_token || !session?.refresh_token) return false;
  if (!session.expires_at) return true;
  return session.expires_at > Math.floor(Date.now() / 1000) + SESSION_EXPIRY_BUFFER_SECONDS;
}

export async function ensureValidSession(forceRefresh = false): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || 'Gagal membaca session login.');

  if (!forceRefresh && sessionStillValid(data.session)) return data.session;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session?.access_token) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    throw new Error('Session tidak valid atau sudah berakhir. Silakan login kembali.');
  }
  return refreshed.session;
}

async function request<T>(path: string, init: RequestInit, accessToken: string): Promise<{ response: Response; data: any }> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'Respons server tidak valid.' }));
  return { response, data };
}

function isSessionFailure(response: Response, data: any) {
  if (response.status !== 401) return false;
  const message = String(data?.message || '').toLowerCase();
  return message.includes('session') || message.includes('jwt') || message.includes('token');
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let session = await ensureValidSession(false);
  let result = await request<T>(path, init, session.access_token);

  if (isSessionFailure(result.response, result.data)) {
    session = await ensureValidSession(true);
    result = await request<T>(path, init, session.access_token);
  }

  if (!result.response.ok || result.data?.ok === false) {
    throw new Error(result.data?.message || `HTTP ${result.response.status}`);
  }
  return result.data as T;
}

export async function loginWithIdentifier(identifier: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || 'Login gagal.');
  const accessToken = data.session?.access_token;
  const refreshToken = data.session?.refresh_token;
  if (!accessToken || !refreshToken) throw new Error('Session login tidak lengkap.');
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
  return data.session;
}
