import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { buildOfficialKpiPdf } from './officialPdf';

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SETUP_TOKEN: string;
  ALLOWED_ORIGIN?: string;
  APP_NAME?: string;
  APP_ENV?: string;
  COMPANY_NAME?: string;
  APP_VERSION?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
};

type Variables = {
  authUser: { id: string; email?: string };
  appUser: AppUser;
  accessToken: string;
};

type AppUser = {
  id: string;
  auth_user_id: string;
  employee_code: string;
  username: string;
  email: string;
  full_name: string;
  department_id: string | null;
  section: string | null;
  position_name: string | null;
  role_code: string;
  active: boolean;
  must_change_password: boolean;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

class RuntimeConfigError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Cloudflare runtime configuration is incomplete: ${missing.join(', ')}`);
    this.name = 'RuntimeConfigError';
    this.missing = missing;
  }
}

function missingRuntimeConfig(env: Bindings, includeServiceRole = true): string[] {
  const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
  if (includeServiceRole) required.push('SUPABASE_SERVICE_ROLE_KEY');
  return required.filter((name) => !String((env as any)[name] || '').trim());
}

function assertRuntimeConfig(env: Bindings, includeServiceRole = true) {
  const missing = missingRuntimeConfig(env, includeServiceRole);
  if (missing.length) throw new RuntimeConfigError(missing);
}

function supabaseBaseUrl(env: Bindings): string {
  assertRuntimeConfig(env, false);
  return String(env.SUPABASE_URL).trim().replace(/\/+$/, '');
}


app.use('*', async (c, next) => {
  const allowedOrigin = c.env.ALLOWED_ORIGIN || '*';
  const handler = cors({
    origin: allowedOrigin,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Setup-Token'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: allowedOrigin !== '*',
    maxAge: 86400
  });
  return handler(c, next);
});

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
});

function jsonHeaders(key: string, bearer?: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${bearer || key}`,
    'Content-Type': 'application/json'
  };
}

function isLegacyServiceRoleJwt(value: unknown): boolean {
  const key = String(value || '').trim();
  return key.startsWith('eyJ') && key.split('.').length === 3;
}

function serviceKeyType(value: unknown): 'legacy_service_role_jwt' | 'new_secret_key' | 'unknown' {
  const key = String(value || '').trim();
  if (isLegacyServiceRoleJwt(key)) return 'legacy_service_role_jwt';
  if (key.startsWith('sb_secret_')) return 'new_secret_key';
  return 'unknown';
}

function assertAuthAdminKey(env: Bindings) {
  assertRuntimeConfig(env, true);
  if (!isLegacyServiceRoleJwt(env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new RuntimeConfigError([
      'SUPABASE_SERVICE_ROLE_KEY harus berisi Legacy service_role JWT (diawali eyJ), bukan sb_secret_ key'
    ]);
  }
}

function authAdminHeaders(env: Bindings): HeadersInit {
  assertAuthAdminKey(env);
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

function upstreamErrorMessage(data: any, fallback: string): string {
  const raw = data?.message || data?.msg || data?.error_description || data?.error || data?.code;
  return String(raw || fallback);
}

async function readJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function rest(
  env: Bindings,
  path: string,
  init: RequestInit = {},
  mode: 'service' | 'anon' = 'service',
  bearer?: string
): Promise<{ response: Response; data: any }> {
  assertRuntimeConfig(env, mode === 'service');
  const key = mode === 'service' ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1/${path}`, {
    ...init,
    headers: { ...jsonHeaders(key, bearer), ...(init.headers || {}) }
  });
  const data = await readJsonSafe(response);
  return { response, data };
}

async function deleteAuthUser(env: Bindings, authUserId: string) {
  await fetch(`${supabaseBaseUrl(env)}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: 'DELETE',
    headers: authAdminHeaders(env)
  });
}

async function audit(env: Bindings, user: AppUser | null, action: string, entity: string, value: unknown) {
  try {
    await rest(env, 'audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user?.id || null,
        actor_name: user?.full_name || 'SYSTEM',
        module: 'CLOUDFLARE',
        action,
        entity_table: entity,
        new_value: value,
        result: 'SUCCESS'
      })
    });
  } catch {
    // Audit failure must not break the primary transaction.
  }
}

async function hardDeleteUserProfile(env: Bindings, actor: AppUser, profileId: string) {
  if (profileId === actor.id) {
    return { ok: false as const, status: 400, message: 'Administrator tidak dapat menghapus akun yang sedang digunakan.' };
  }

  const found = await rest(
    env,
    `users?id=eq.${encodeURIComponent(profileId)}&select=id,auth_user_id,employee_code,username,email,full_name&limit=1`,
    {},
    'service'
  );
  const profile = Array.isArray(found.data) ? found.data[0] : null;
  if (!found.response.ok || !profile) {
    return { ok: false as const, status: 404, message: 'User tidak ditemukan.' };
  }

  const deletion = await rest(env, `users?id=eq.${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  }, 'service');

  if (!deletion.response.ok) {
    return {
      ok: false as const,
      status: 409,
      message: deletion.data?.message || 'User memiliki histori atau relasi bisnis. Nonaktifkan user, jangan hard delete.'
    };
  }

  if (profile.auth_user_id) {
    const authResponse = await fetch(`${supabaseBaseUrl(env)}/auth/v1/admin/users/${encodeURIComponent(profile.auth_user_id)}`, {
      method: 'DELETE',
      headers: authAdminHeaders(env)
    });
    if (!authResponse.ok && authResponse.status !== 404) {
      await audit(env, actor, 'DELETE_USER_PROFILE_AUTH_FAILED', 'users', {
        id: profileId,
        auth_user_id: profile.auth_user_id,
        email: profile.email
      });
      return {
        ok: false as const,
        status: 500,
        message: 'Profil aplikasi terhapus, tetapi akun Supabase Auth gagal dihapus. Hapus akun Auth secara manual.'
      };
    }
  }

  await audit(env, actor, 'DELETE_USER', 'users', {
    id: profileId,
    employee_code: profile.employee_code,
    username: profile.username,
    email: profile.email
  });
  return { ok: true as const, profile };
}

function importAction(row: Record<string, any>): 'UPSERT' | 'DELETE' {
  const raw = String(row.action ?? row.__action ?? row._action ?? 'UPSERT').trim().toUpperCase();
  return raw === 'DELETE' || raw === 'REMOVE' ? 'DELETE' : 'UPSERT';
}

function withoutAction(row: Record<string, any>) {
  const copy = { ...row };
  delete copy.action;
  delete copy.__action;
  delete copy._action;
  return copy;
}

async function authenticate(c: any): Promise<Response | null> {
  assertRuntimeConfig(c.env, true);
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ ok: false, message: 'Session tidak ditemukan.' }, 401);

  const authResponse = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/user`, {
    headers: jsonHeaders(c.env.SUPABASE_PUBLISHABLE_KEY, token)
  });
  const authUser = await readJsonSafe(authResponse);
  if (!authResponse.ok || !authUser?.id) {
    return c.json({ ok: false, message: 'Session tidak valid atau sudah berakhir.' }, 401);
  }

  const { response, data } = await rest(
    c.env,
    `users?auth_user_id=eq.${encodeURIComponent(authUser.id)}&select=id,auth_user_id,employee_code,username,email,full_name,department_id,section,position_name,role_code,active,must_change_password&limit=1`,
    {},
    'service'
  );
  const profile = Array.isArray(data) ? data[0] : null;
  if (!response.ok || !profile?.active) {
    return c.json({ ok: false, message: 'Profil aplikasi tidak aktif.' }, 403);
  }

  c.set('authUser', authUser);
  c.set('appUser', profile);
  c.set('accessToken', token);
  return null;
}

async function requireAuth(c: any, next: () => Promise<void>) {
  const failure = await authenticate(c);
  if (failure) return failure;
  await next();
}

async function requireAdmin(c: any, next: () => Promise<void>) {
  const failure = await authenticate(c);
  if (failure) return failure;
  const profile = c.get('appUser') as AppUser;
  if (profile.role_code !== 'ADMIN') {
    return c.json({ ok: false, message: 'Akses hanya untuk ADMIN.' }, 403);
  }
  await next();
}

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(6)
});


function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

app.get('/api/public-config', (c) => {
  const missing = missingRuntimeConfig(c.env, false);
  if (missing.length) {
    return c.json({
      ok: false,
      code: 'RUNTIME_CONFIG_MISSING',
      message: 'Cloudflare runtime variables untuk koneksi Supabase belum lengkap.',
      missing
    }, 503);
  }

  return c.json({
    ok: true,
    supabaseUrl: supabaseBaseUrl(c.env),
    supabasePublishableKey: c.env.SUPABASE_PUBLISHABLE_KEY,
    appName: c.env.APP_NAME || 'Executive KPI Manufacturing Control Center',
    companyName: c.env.COMPANY_NAME || 'PT BANSHU ELECTRIC INDONESIA',
    appVersion: c.env.APP_VERSION || '2.0.0'
  }, 200, {
    'Cache-Control': 'no-store, max-age=0'
  });
});

app.get('/api/health', (c) => {
  const missing = missingRuntimeConfig(c.env, true);
  return c.json({
    ok: missing.length === 0,
    service: c.env.APP_NAME || 'KPI Control Center',
    version: c.env.APP_VERSION || '2.0.0',
    environment: c.env.APP_ENV || 'production',
    runtimeConfigured: missing.length === 0,
    missing,
    authAdminKeyType: serviceKeyType(c.env.SUPABASE_SERVICE_ROLE_KEY),
    authAdminReady: isLegacyServiceRoleJwt(c.env.SUPABASE_SERVICE_ROLE_KEY),
    timestamp: new Date().toISOString()
  }, missing.length ? 503 : 200, { 'Cache-Control': 'no-store' });
});

app.get('/api/setup/status', async (c) => {
  const { response, data } = await rest(c.env, 'users?select=id&limit=1', {}, 'service');
  if (!response.ok) return c.json({ ok: false, message: data?.message || 'Gagal membaca status setup.' }, 500);
  return c.json({ ok: true, needsSetup: !Array.isArray(data) || data.length === 0 });
});

app.get('/api/setup/diagnostics', async (c) => {
  if (!c.env.SETUP_TOKEN || c.req.header('X-Setup-Token') !== c.env.SETUP_TOKEN) {
    return c.json({ ok: false, message: 'Setup token tidak valid.' }, 403);
  }

  const missing = missingRuntimeConfig(c.env, true);
  const keyType = serviceKeyType(c.env.SUPABASE_SERVICE_ROLE_KEY);
  if (missing.length || keyType !== 'legacy_service_role_jwt') {
    return c.json({
      ok: false,
      runtimeConfigured: missing.length === 0,
      missing,
      authAdminKeyType: keyType,
      authAdminReady: false,
      message: keyType === 'new_secret_key'
        ? 'Gunakan Legacy service_role JWT (eyJ...) untuk SUPABASE_SERVICE_ROLE_KEY. Key sb_secret_ tidak dipakai untuk Auth Admin pada build ini.'
        : 'Konfigurasi Auth Admin belum lengkap.'
    }, 503);
  }

  const response = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: authAdminHeaders(c.env)
  });
  const data = await readJsonSafe(response);
  return c.json({
    ok: response.ok,
    authAdminReady: response.ok,
    authAdminKeyType: keyType,
    upstreamStatus: response.status,
    upstreamError: response.ok ? null : upstreamErrorMessage(data, 'Auth Admin API tidak dapat diakses.')
  }, response.ok ? 200 : 502);
});

app.post('/api/setup/bootstrap', async (c) => {
  assertRuntimeConfig(c.env, true);
  if (!isLegacyServiceRoleJwt(c.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return c.json({
      ok: false,
      code: 'AUTH_ADMIN_KEY_TYPE_INVALID',
      message: 'SUPABASE_SERVICE_ROLE_KEY harus diisi Legacy service_role JWT yang diawali eyJ. Jangan gunakan key sb_secret_ untuk bootstrap Auth.'
    }, 503);
  }
  if (!c.env.SETUP_TOKEN || c.req.header('X-Setup-Token') !== c.env.SETUP_TOKEN) {
    return c.json({ ok: false, message: 'Setup token tidak valid.' }, 403);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    employeeCode: z.string().min(1),
    username: z.string().min(1),
    fullName: z.string().min(1)
  }).safeParse(body);
  if (!parsed.success) return c.json({ ok: false, message: 'Data bootstrap tidak valid.', issues: parsed.error.issues }, 400);

  const existing = await rest(c.env, 'users?select=id&limit=1', {}, 'service');
  if (Array.isArray(existing.data) && existing.data.length) return c.json({ ok: false, message: 'Bootstrap sudah pernah dijalankan.' }, 409);

  const targetEmail = parsed.data.email.toLowerCase();
  const authResponse = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users`, {
    method: 'POST',
    headers: authAdminHeaders(c.env),
    body: JSON.stringify({
      email: targetEmail,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName, role_code: 'ADMIN' }
    })
  });
  let authUser = await readJsonSafe(authResponse);
  let createdAuthUser = authResponse.ok;

  if (!authResponse.ok) {
    const detail = upstreamErrorMessage(authUser, 'Gagal membuat user Auth.');
    const normalized = detail.toLowerCase();
    const duplicate = normalized.includes('already') || normalized.includes('exists') || normalized.includes('registered');

    if (duplicate) {
      const listResponse = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users?page=1&per_page=1000`, {
        headers: authAdminHeaders(c.env)
      });
      const listData = await readJsonSafe(listResponse);
      const users = Array.isArray(listData) ? listData : Array.isArray(listData?.users) ? listData.users : [];
      const existingAuthUser = users.find((item: any) => String(item?.email || '').toLowerCase() === targetEmail);
      if (!listResponse.ok || !existingAuthUser?.id) {
        return c.json({
          ok: false,
          code: authUser?.code || authUser?.error_code || 'AUTH_EMAIL_EXISTS',
          status: authResponse.status,
          message: 'Email sudah terdaftar di Supabase Authentication, tetapi akun tersebut tidak dapat dihubungkan otomatis. Hapus user itu dari Authentication > Users atau gunakan email lain.'
        }, 409);
      }
      authUser = existingAuthUser;
      createdAuthUser = false;
    } else {
      return c.json({
        ok: false,
        code: authUser?.code || authUser?.error_code || 'AUTH_CREATE_FAILED',
        status: authResponse.status,
        message: `Gagal membuat user Auth: ${detail}`
      }, authResponse.status >= 500 ? 502 : 400);
    }
  }

  const insert = await rest(c.env, 'users', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      auth_user_id: authUser.id,
      employee_code: parsed.data.employeeCode,
      username: parsed.data.username.toLowerCase(),
      email: parsed.data.email.toLowerCase(),
      full_name: parsed.data.fullName,
      role_code: 'ADMIN',
      position_name: 'System Administrator',
      active: true,
      must_change_password: false
    })
  });
  if (!insert.response.ok) {
    if (createdAuthUser) await deleteAuthUser(c.env, authUser.id);
    return c.json({ ok: false, message: insert.data?.message || 'Gagal membuat profil ADMIN.' }, 400);
  }
  return c.json({ ok: true, message: 'ADMIN pertama berhasil dibuat.' });
});

app.post('/api/auth/login', async (c) => {
  assertRuntimeConfig(c.env, true);
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Username dan password wajib diisi.' }, 400);

  const identifier = parsed.data.identifier.trim().toLowerCase();
  let email = identifier;
  if (!identifier.includes('@')) {
    const query = `username.eq.${encodeURIComponent(identifier)},employee_code.eq.${encodeURIComponent(identifier)}`;
    const { data } = await rest(c.env, `users?or=(${query})&active=eq.true&select=email&limit=1`, {}, 'service');
    email = Array.isArray(data) && data[0]?.email ? data[0].email : '';
  }
  if (!email) return c.json({ ok: false, message: 'Username/password tidak valid.' }, 401);

  const response = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: jsonHeaders(c.env.SUPABASE_PUBLISHABLE_KEY),
    body: JSON.stringify({ email, password: parsed.data.password })
  });
  const data = await readJsonSafe(response);
  if (!response.ok) return c.json({ ok: false, message: 'Username/password tidak valid.' }, 401);
  return c.json({ ok: true, session: data });
});

app.get('/api/me', requireAuth, async (c) => c.json({ ok: true, user: c.get('appUser') }));


async function completePasswordChange(c: any) {
  const user = c.get('appUser');
  const updated = await rest(c.env, `users?id=eq.${encodeURIComponent(user.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ must_change_password: false, updated_at: new Date().toISOString() })
  }, 'service');
  if (!updated.response.ok) {
    return c.json({ ok: false, message: updated.data?.message || 'Password Auth berubah, tetapi status aplikasi gagal diperbarui.' }, 500);
  }
  await audit(c.env, user, 'CHANGE_PASSWORD', 'users', { id: user.id, mode: 'self_service' });
  return c.json({ ok: true, message: 'Password berhasil diubah.' });
}

app.post('/api/me/password-complete', requireAuth, completePasswordChange);

// Backward-compatible endpoint. Password changes now use the signed-in user's
// Supabase session instead of the Admin API, then clear the application flag.
app.post('/api/me/password', requireAuth, async (c) => {
  const parsed = z.object({ password: z.string().min(8).max(128) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Password minimal 8 karakter.' }, 400);
  const accessToken = c.get('accessToken');
  const response = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/user`, {
    method: 'PUT',
    headers: jsonHeaders(c.env.SUPABASE_PUBLISHABLE_KEY, accessToken),
    body: JSON.stringify({ password: parsed.data.password })
  });
  const data = await readJsonSafe(response);
  if (!response.ok) return c.json({ ok: false, message: data?.message || 'Gagal mengubah password.' }, response.status === 401 ? 401 : 400);
  return completePasswordChange(c);
});




async function loadCompanyLogo(env: Bindings, requestUrl: string): Promise<Uint8Array | null> {
  try {
    const url = new URL('/logo-banshu.png', requestUrl);
    const response = await env.ASSETS.fetch(new Request(url.toString()));
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

app.get('/api/forms/:id/print-preview', requireAuth, async (c) => {
  const formId = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(formId)) return c.json({ ok: false, message: 'Form ID tidak valid.' }, 400);

  const user = c.get('appUser');
  const accessToken = c.get('accessToken');
  const detailResponse = await fetch(`${supabaseBaseUrl(c.env)}/rest/v1/rpc/get_form_detail_v2`, {
    method: 'POST',
    headers: { ...jsonHeaders(c.env.SUPABASE_PUBLISHABLE_KEY, accessToken), Prefer: 'return=representation' },
    body: JSON.stringify({ p_form_id: formId })
  });
  const detail = await readJsonSafe(detailResponse);
  if (!detailResponse.ok || !detail?.form) {
    return c.json({ ok: false, message: detail?.message || 'Form tidak ditemukan atau berada di luar scope Anda.' }, detailResponse.status === 404 ? 404 : 403);
  }

  const profileResult = await rest(
    c.env,
    `users?id=eq.${encodeURIComponent(detail.form.user_id)}&select=academic,join_date&limit=1`,
    {},
    'service'
  );
  detail.profile = Array.isArray(profileResult.data) ? profileResult.data[0] || null : null;

  let bytes: Uint8Array;
  try {
    bytes = await buildOfficialKpiPdf(detail, user, { logoBytes: await loadCompanyLogo(c.env, c.req.url) });
  } catch (error: any) {
    return c.json({ ok: false, message: error?.message || 'Gagal menyusun preview print.' }, 422);
  }

  const formNo = String(detail.form.form_no || formId).replace(/[^A-Za-z0-9_-]+/g, '-');
  return new Response(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="KPI_${formNo}_PREVIEW.pdf"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
});

app.post('/api/forms/:id/pdf', requireAuth, async (c) => {
  const formId = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(formId)) return c.json({ ok: false, message: 'Form ID tidak valid.' }, 400);

  const user = c.get('appUser');
  const accessToken = c.get('accessToken');
  const detailResponse = await fetch(`${supabaseBaseUrl(c.env)}/rest/v1/rpc/get_form_detail_v2`, {
    method: 'POST',
    headers: { ...jsonHeaders(c.env.SUPABASE_PUBLISHABLE_KEY, accessToken), Prefer: 'return=representation' },
    body: JSON.stringify({ p_form_id: formId })
  });
  const detail = await readJsonSafe(detailResponse);
  if (!detailResponse.ok || !detail?.form) {
    return c.json({ ok: false, message: detail?.message || 'Form tidak ditemukan atau berada di luar scope Anda.' }, detailResponse.status === 404 ? 404 : 403);
  }

  if (String(detail.form.status || '').toUpperCase() !== 'APPROVED') {
    return c.json({
      ok: false,
      message: 'Official PDF hanya dapat dibuat setelah KPI berstatus APPROVED. Gunakan Browser Print untuk preview draft.'
    }, 409);
  }

  const profileResult = await rest(
    c.env,
    `users?id=eq.${encodeURIComponent(detail.form.user_id)}&select=academic,join_date&limit=1`,
    {},
    'service'
  );
  detail.profile = Array.isArray(profileResult.data) ? profileResult.data[0] || null : null;

  let bytes: Uint8Array;
  try {
    bytes = await buildOfficialKpiPdf(detail, user, { logoBytes: await loadCompanyLogo(c.env, c.req.url) });
  } catch (error: any) {
    return c.json({ ok: false, message: error?.message || 'Gagal menyusun PDF resmi.' }, 422);
  }
  const pdfBuffer = Uint8Array.from(bytes).buffer;
  const digest = await crypto.subtle.digest('SHA-256', pdfBuffer);
  const signatureHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const formNo = String(detail.form.form_no || formId).replace(/[^A-Za-z0-9_-]+/g, '-');
  const fileName = `KPI_${formNo}_${detail.form.period_key || 'period'}_${Date.now()}.pdf`;
  const objectPath = `${detail.form.period_key || 'unknown'}/${formId}/${fileName}`;

  const uploadResponse = await fetch(`${supabaseBaseUrl(c.env)}/storage/v1/object/kpi-pdf/${encodeStoragePath(objectPath)}`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'false'
    },
    body: new Blob([pdfBuffer], { type: 'application/pdf' })
  });
  const uploadData = await readJsonSafe(uploadResponse);
  if (!uploadResponse.ok) return c.json({ ok: false, message: uploadData?.message || 'Gagal mengupload PDF ke Supabase Storage.' }, 500);

  const historyResult = await rest(c.env, 'pdf_history', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      form_id: formId,
      bucket_name: 'kpi-pdf',
      object_path: objectPath,
      file_name: fileName,
      status: 'READY',
      generated_by: user.id,
      generated_at: new Date().toISOString(),
      signature_hash: signatureHash
    })
  });
  if (!historyResult.response.ok) {
    return c.json({ ok: false, message: historyResult.data?.message || 'PDF dibuat, tetapi histori PDF gagal dicatat.' }, 500);
  }

  await rest(c.env, `kpi_forms?id=eq.${encodeURIComponent(formId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ archive_bucket: 'kpi-pdf', archive_path: objectPath, archived_at: new Date().toISOString() })
  });
  await rest(c.env, 'notifications', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: detail.form.user_id,
      form_id: formId,
      type: 'PDF_READY',
      title: 'KPI PDF Ready',
      message: `${detail.form.form_no} sudah tersedia dalam arsip PDF.`,
      priority: 'NORMAL',
      metadata: { object_path: objectPath, signature_hash: signatureHash }
    })
  });

  const signedResponse = await fetch(`${supabaseBaseUrl(c.env)}/storage/v1/object/sign/kpi-pdf/${encodeStoragePath(objectPath)}`, {
    method: 'POST',
    headers: authAdminHeaders(c.env),
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const signedData = await readJsonSafe(signedResponse);
  const relative = signedData?.signedURL || signedData?.signedUrl || '';
  const downloadUrl = relative.startsWith('http') ? relative : `${supabaseBaseUrl(c.env)}/storage/v1${relative}`;

  await audit(c.env, user, 'GENERATE_PDF', 'pdf_history', { form_id: formId, object_path: objectPath, signature_hash: signatureHash });
  return c.json({ ok: true, fileName, objectPath, signatureHash, downloadUrl });
});

app.get('/api/admin/health', requireAdmin, async (c) => {
  const tables = ['users', 'departments', 'approval_matrix', 'kpi_forms', 'kpi_points', 'notifications', 'audit_logs'];
  const counts: Record<string, number | null> = {};
  for (const table of tables) {
    const { response } = await rest(c.env, `${table}?select=*`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact', Range: '0-0' }
    });
    const range = response.headers.get('content-range');
    counts[table] = range?.includes('/') ? Number(range.split('/')[1]) : null;
  }
  return c.json({ ok: true, counts, timestamp: new Date().toISOString() });
});

const userSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  employee_code: z.string().min(1),
  username: z.string().min(1),
  full_name: z.string().min(1),
  department_id: z.string().uuid().nullable().optional(),
  section: z.string().nullable().optional(),
  position_name: z.string().nullable().optional(),
  role_code: z.enum(['STAFF','LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI','ADMIN']),
  manager_user_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  academic: z.string().nullable().optional(),
  join_date: z.string().nullable().optional(),
  department_access_ids: z.array(z.string().uuid()).max(100).optional()
});

app.post('/api/admin/users', requireAdmin, async (c) => {
  const parsed = userSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Data user tidak valid.', issues: parsed.error.issues }, 400);
  const input = parsed.data;
  const actor = c.get('appUser');

  let authUserId: string | null = null;
  let createdNewAuth = false;
  if (input.id) {
    const found = await rest(c.env, `users?id=eq.${input.id}&select=auth_user_id&limit=1`, {}, 'service');
    authUserId = found.data?.[0]?.auth_user_id || null;
    if (authUserId && (input.password || input.email)) {
      const response = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users/${authUserId}`, {
        method: 'PUT',
        headers: authAdminHeaders(c.env),
        body: JSON.stringify({
          email: input.email.toLowerCase(),
          ...(input.password ? { password: input.password } : {}),
          email_confirm: true,
          user_metadata: { full_name: input.full_name, role_code: input.role_code }
        })
      });
      if (!response.ok) return c.json({ ok: false, message: (await readJsonSafe(response))?.message || 'Gagal update Auth user.' }, 400);
    }
  } else {
    if (!input.password) return c.json({ ok: false, message: 'Password wajib untuk user baru.' }, 400);
    const response = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users`, {
      method: 'POST',
      headers: authAdminHeaders(c.env),
      body: JSON.stringify({
        email: input.email.toLowerCase(), password: input.password, email_confirm: true,
        user_metadata: { full_name: input.full_name, role_code: input.role_code }
      })
    });
    const data = await readJsonSafe(response);
    if (!response.ok) return c.json({ ok: false, message: data?.message || 'Gagal membuat Auth user.' }, 400);
    authUserId = data.id;
    createdNewAuth = true;
  }

  const payload = {
    auth_user_id: authUserId,
    employee_code: input.employee_code,
    username: input.username.toLowerCase(),
    email: input.email.toLowerCase(),
    full_name: input.full_name,
    department_id: input.department_id || null,
    section: input.section || null,
    position_name: input.position_name || null,
    role_code: input.role_code,
    manager_user_id: input.manager_user_id || null,
    academic: input.academic || null,
    join_date: input.join_date || null,
    active: input.active ?? true,
    must_change_password: !input.id,
    updated_by: actor.id,
    ...(input.id ? {} : { created_by: actor.id })
  };

  const result = input.id
    ? await rest(c.env, `users?id=eq.${input.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }, 'service')
    : await rest(c.env, 'users', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }, 'service');
  if (!result.response.ok) {
    if (createdNewAuth && authUserId) await deleteAuthUser(c.env, authUserId);
    return c.json({ ok: false, message: result.data?.message || 'Gagal menyimpan profil user.' }, 400);
  }

  const profileId = result.data?.[0]?.id || input.id;
  if (profileId && input.department_access_ids) {
    const deleteAccess = await rest(c.env, `user_department_access?user_id=eq.${encodeURIComponent(profileId)}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' }
    });
    if (!deleteAccess.response.ok) return c.json({ ok: false, message: deleteAccess.data?.message || 'Profil tersimpan, tetapi scope department gagal diperbarui.' }, 400);
    const relatedDepartments = [...new Set(input.department_access_ids)].filter((departmentId) => departmentId !== input.department_id);
    if (relatedDepartments.length) {
      const accessResult = await rest(c.env, 'user_department_access', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(relatedDepartments.map((departmentId) => ({
          user_id: profileId, department_id: departmentId, access_type: 'RELATED', active: true
        })))
      });
      if (!accessResult.response.ok) return c.json({ ok: false, message: accessResult.data?.message || 'Profil tersimpan, tetapi related department gagal ditambahkan.' }, 400);
    }
  }
  await audit(c.env, actor, input.id ? 'UPDATE_USER' : 'CREATE_USER', 'users', { ...payload, department_access_ids: input.department_access_ids || [] });
  return c.json({ ok: true, user: result.data?.[0] || result.data });
});

app.patch('/api/admin/users/:id/status', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const active = Boolean(body.active);
  const result = await rest(c.env, `users?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ active, updated_by: c.get('appUser').id, updated_at: new Date().toISOString() })
  });
  if (!result.response.ok) return c.json({ ok: false, message: result.data?.message || 'Gagal mengubah status user.' }, 400);
  await audit(c.env, c.get('appUser'), 'TOGGLE_USER', 'users', { id, active });
  return c.json({ ok: true, user: result.data?.[0] });
});


app.delete('/api/admin/users/:id', requireAdmin, async (c) => {
  const result = await hardDeleteUserProfile(c.env, c.get('appUser'), c.req.param('id'));
  if (!result.ok) return c.json({ ok: false, message: result.message }, result.status as any);
  return c.json({ ok: true, message: 'User dan akun Supabase Auth berhasil dihapus.', user: result.profile });
});

app.post('/api/admin/users/:id/reset-password', requireAdmin, async (c) => {
  const parsed = z.object({ password: z.string().min(8) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Password minimal 8 karakter.' }, 400);
  const id = c.req.param('id');
  const found = await rest(c.env, `users?id=eq.${encodeURIComponent(id)}&select=auth_user_id&limit=1`, {}, 'service');
  const authId = found.data?.[0]?.auth_user_id;
  if (!authId) return c.json({ ok: false, message: 'Auth user tidak ditemukan.' }, 404);
  const response = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users/${authId}`, {
    method: 'PUT', headers: authAdminHeaders(c.env),
    body: JSON.stringify({ password: parsed.data.password })
  });
  if (!response.ok) return c.json({ ok: false, message: (await readJsonSafe(response))?.message || 'Reset password gagal.' }, 400);
  await rest(c.env, `users?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ must_change_password: true })
  });
  await audit(c.env, c.get('appUser'), 'RESET_PASSWORD', 'users', { id });
  return c.json({ ok: true, message: 'Password berhasil direset.' });
});

app.post('/api/admin/departments', requireAdmin, async (c) => {
  const parsed = z.object({
    id: z.string().uuid().optional(), department_code: z.string().min(1), department_name: z.string().min(1),
    plant_code: z.string().nullable().optional(), sort_order: z.number().int().optional(), active: z.boolean().optional()
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Data department tidak valid.' }, 400);
  const payload = { ...parsed.data, department_code: parsed.data.department_code.toUpperCase(), updated_at: new Date().toISOString() };
  const result = parsed.data.id
    ? await rest(c.env, `departments?id=eq.${parsed.data.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    : await rest(c.env, 'departments', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  if (!result.response.ok) return c.json({ ok: false, message: result.data?.message || 'Gagal menyimpan department.' }, 400);
  await audit(c.env, c.get('appUser'), 'UPSERT_DEPARTMENT', 'departments', payload);
  return c.json({ ok: true, item: result.data?.[0] });
});

app.delete('/api/admin/departments/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const found = await rest(c.env, `departments?id=eq.${encodeURIComponent(id)}&select=id,department_code,department_name&limit=1`, {}, 'service');
  const department = Array.isArray(found.data) ? found.data[0] : null;
  if (!found.response.ok || !department) return c.json({ ok: false, message: 'Department tidak ditemukan.' }, 404);

  const deletion = await rest(c.env, `departments?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  }, 'service');
  if (!deletion.response.ok) {
    return c.json({
      ok: false,
      message: deletion.data?.message || 'Department masih dipakai oleh user, KPI, atau approval matrix. Nonaktifkan department terlebih dahulu.'
    }, 409);
  }
  await audit(c.env, c.get('appUser'), 'DELETE_DEPARTMENT', 'departments', department);
  return c.json({ ok: true, message: 'Department berhasil dihapus.', department });
});

app.post('/api/admin/matrix', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    id: z.string().uuid().optional(), matrix_code: z.string().min(1), department_id: z.string().uuid().nullable().optional(),
    section: z.string().nullable().optional(), submitter_role_code: z.string().default('*'), priority: z.number().int().optional(),
    checked1_role_code: z.string().nullable().optional(), checked1_user_id: z.string().uuid().nullable().optional(),
    approval1_role_code: z.string().nullable().optional(), approval1_user_id: z.string().uuid().nullable().optional(),
    approval2_role_code: z.string().nullable().optional(), approval2_user_id: z.string().uuid().nullable().optional(),
    approval3_role_code: z.string().nullable().optional(), approval3_user_id: z.string().uuid().nullable().optional(),
    checked2_role_code: z.string().nullable().optional(), checked2_user_id: z.string().uuid().nullable().optional(),
    approval4_role_code: z.string().nullable().optional(), approval4_user_id: z.string().uuid().nullable().optional(),
    note: z.string().nullable().optional(), active: z.boolean().optional()
  }).safeParse(body);
  if (!parsed.success) return c.json({ ok: false, message: 'Data approval matrix tidak valid.', issues: parsed.error.issues }, 400);
  const payload = { ...parsed.data, matrix_code: parsed.data.matrix_code.toUpperCase(), updated_by: c.get('appUser').id, updated_at: new Date().toISOString() };
  const result = parsed.data.id
    ? await rest(c.env, `approval_matrix?id=eq.${parsed.data.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    : await rest(c.env, 'approval_matrix', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...payload, created_by: c.get('appUser').id }) });
  if (!result.response.ok) return c.json({ ok: false, message: result.data?.message || 'Gagal menyimpan matrix.' }, 400);
  await audit(c.env, c.get('appUser'), 'UPSERT_MATRIX', 'approval_matrix', payload);
  return c.json({ ok: true, item: result.data?.[0] });
});

app.delete('/api/admin/matrix/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const result = await rest(c.env, `approval_matrix?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ active: false, updated_by: c.get('appUser').id, updated_at: new Date().toISOString() })
  });
  if (!result.response.ok) return c.json({ ok: false, message: result.data?.message || 'Gagal menonaktifkan matrix.' }, 400);
  await audit(c.env, c.get('appUser'), 'DISABLE_MATRIX', 'approval_matrix', { id });
  return c.json({ ok: true });
});

app.post('/api/admin/reroute', requireAdmin, async (c) => {
  const parsed = z.object({
    filters: z.record(z.string(), z.any()).default({}),
    cursor: z.record(z.string(), z.any()).nullable().optional(),
    batchSize: z.number().int().min(1).max(500).default(100)
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ ok: false, message: 'Parameter reroute tidak valid.' }, 400);

  const token = c.get('accessToken');
  const response = await fetch(`${supabaseBaseUrl(c.env)}/rest/v1/rpc/reroute_pending_kpi_v2`, {
    method: 'POST',
    headers: { ...jsonHeaders(c.env.SUPABASE_PUBLISHABLE_KEY, token), Prefer: 'return=representation' },
    body: JSON.stringify({ p_filters: parsed.data.filters, p_cursor: parsed.data.cursor || null, p_batch_size: parsed.data.batchSize })
  });
  const data = await readJsonSafe(response);
  if (!response.ok) return c.json({ ok: false, message: data?.message || 'Reroute gagal.' }, 400);
  return c.json(data);
});


const bulkUserImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())).min(1).max(5)
});

function importBoolean(value: unknown, fallback: boolean): boolean {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true','1','yes','y','active'].includes(normalized)) return true;
  if (['false','0','no','n','inactive'].includes(normalized)) return false;
  return fallback;
}

function relatedDepartmentCodes(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  return [...new Set(String(value).split(/[|;]/).map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function generatedUserEmail(username: string, employeeCode: string): string {
  const local = String(username || employeeCode || 'user')
    .trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^\.+|\.+$/g, '') || 'user';
  return `${local}@kpi.banshu.internal`;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

app.get('/api/admin/users/export', requireAdmin, async (c) => {
  const [usersResult, departmentsResult] = await Promise.all([
    rest(c.env, 'users?select=id,employee_code,username,full_name,department_id,section,position_name,role_code,active,must_change_password&order=employee_code.asc&limit=5000', {}, 'service'),
    rest(c.env, 'departments?select=id,department_code&limit=5000', {}, 'service')
  ]);
  if (!usersResult.response.ok) return c.json({ ok: false, message: usersResult.data?.message || 'Gagal membaca data user.' }, 400);
  const departmentCodeById = new Map<string,string>((departmentsResult.data || []).map((row: any) => [row.id, row.department_code]));
  const rows = (usersResult.data || []).map((user: any) => ({
    employee_code: user.employee_code,
    username: user.username,
    password: '',
    full_name: user.full_name,
    department_code: departmentCodeById.get(user.department_id) || '',
    section: user.section || '',
    position_name: user.position_name || '',
    role_code: user.role_code,
    active: user.active,
    must_change_password: user.must_change_password
  }));
  await audit(c.env, c.get('appUser'), 'EXPORT_USERS', 'users', { rows: rows.length, format: 'simplified' });
  return c.json({ ok: true, rows });
});

app.post('/api/admin/users/import', requireAdmin, async (c) => {
  const parsed = bulkUserImportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Payload import user tidak valid. Maksimal 5 user per batch agar tidak melewati batas subrequest Cloudflare.' }, 400);
  const actor = c.get('appUser');
  const departmentsResult = await rest(c.env, 'departments?select=id,department_code&limit=5000', {}, 'service');
  if (!departmentsResult.response.ok) return c.json({ ok: false, message: departmentsResult.data?.message || 'Master department tidak dapat dibaca.' }, 400);
  const departmentByCode = new Map<string,string>((departmentsResult.data || []).map((row: any) => [String(row.department_code).toUpperCase(), row.id]));
  const allowedRoles = new Set(['STAFF','LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI','ADMIN']);
  let created = 0;
  let updated = 0;
  const failed: Array<{ row: number; identifier?: string; employee_code?: string; message: string }> = [];

  for (let index = 0; index < parsed.data.rows.length; index += 1) {
    const raw = parsed.data.rows[index] || {};
    const rowNumber = index + 2;
    let createdAuthId: string | null = null;
    try {
      const employeeCode = String(raw.employee_code || '').trim();
      const username = String(raw.username || '').trim().toLowerCase();
      const fullName = String(raw.full_name || '').trim();
      const password = String(raw.password || '').trim();
      const roleCode = String(raw.role_code || 'STAFF').trim().toUpperCase();
      const departmentCode = String(raw.department_code || '').trim().toUpperCase();
      if (!employeeCode || !username || !fullName) throw new Error('employee_code, username, dan full_name wajib diisi.');
      if (!allowedRoles.has(roleCode)) throw new Error(`Role ${roleCode} tidak valid.`);
      const departmentId = departmentCode ? departmentByCode.get(departmentCode) : null;
      if (departmentCode && !departmentId) throw new Error(`Department code ${departmentCode} tidak ditemukan.`);

      const conditions = [
        `employee_code.eq.${encodeURIComponent(employeeCode)}`,
        `username.eq.${encodeURIComponent(username)}`,
        raw.email ? `email.eq.${encodeURIComponent(String(raw.email).trim().toLowerCase())}` : ''
      ].filter(Boolean);
      const lookup = await rest(c.env,
        `users?or=(${conditions.join(',')})&select=id,auth_user_id,email,must_change_password&limit=1`,
        {}, 'service');
      if (!lookup.response.ok) throw new Error(lookup.data?.message || 'Gagal mencari user existing.');
      const existing = lookup.data?.[0] || null;
      const email = String(raw.email || existing?.email || generatedUserEmail(username, employeeCode)).trim().toLowerCase();
      let authUserId: string | null = existing?.auth_user_id || null;

      if (authUserId) {
        const authResponse = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
          method: 'PUT',
          headers: authAdminHeaders(c.env),
          body: JSON.stringify({
            email,
            email_confirm: true,
            ...(password ? { password } : {}),
            user_metadata: { full_name: fullName, role_code: roleCode, employee_code: employeeCode, username }
          })
        });
        if (!authResponse.ok) throw new Error(upstreamErrorMessage(await readJsonSafe(authResponse), 'Gagal memperbarui Supabase Auth.'));
      } else {
        if (password.length < 8) throw new Error('Password minimal 8 karakter wajib untuk user baru.');
        const authResponse = await fetch(`${supabaseBaseUrl(c.env)}/auth/v1/admin/users`, {
          method: 'POST',
          headers: authAdminHeaders(c.env),
          body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role_code: roleCode, employee_code: employeeCode, username } })
        });
        const authData = await readJsonSafe(authResponse);
        if (!authResponse.ok || !authData?.id) throw new Error(upstreamErrorMessage(authData, 'Gagal membuat Supabase Auth.'));
        authUserId = authData.id;
        createdAuthId = authData.id;
      }

      const payload = {
        auth_user_id: authUserId,
        employee_code: employeeCode,
        username,
        email,
        full_name: fullName,
        department_id: departmentId || null,
        section: String(raw.section || '').trim() || null,
        position_name: String(raw.position_name || '').trim() || null,
        role_code: roleCode,
        active: importBoolean(raw.active, true),
        must_change_password: importBoolean(raw.must_change_password, existing ? Boolean(existing.must_change_password) : true),
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
        ...(existing ? {} : { created_by: actor.id })
      };
      const profileResult = existing
        ? await rest(c.env, `users?id=eq.${encodeURIComponent(existing.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }, 'service')
        : await rest(c.env, 'users', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }, 'service');
      if (!profileResult.response.ok) {
        if (createdAuthId) await deleteAuthUser(c.env, createdAuthId);
        throw new Error(profileResult.data?.message || 'Gagal menyimpan profil user.');
      }

      // Related departments are intentionally not part of the simple import template.
      // Legacy files can still update them when the optional column is present.
      if (Object.prototype.hasOwnProperty.call(raw, 'related_department_codes')) {
        const relatedCodes = relatedDepartmentCodes(raw.related_department_codes);
        const relatedIds = relatedCodes.map((code) => {
          const id = departmentByCode.get(code);
          if (!id) throw new Error(`Related department code ${code} tidak ditemukan.`);
          return id;
        }).filter((id) => id !== departmentId);
        const profileId = profileResult.data?.[0]?.id || existing?.id;
        if (!profileId) throw new Error('ID profil user tidak tersedia.');
        const clearAccess = await rest(c.env, `user_department_access?user_id=eq.${encodeURIComponent(profileId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, 'service');
        if (!clearAccess.response.ok) throw new Error(clearAccess.data?.message || 'Gagal menghapus scope department lama.');
        if (relatedIds.length) {
          const accessResult = await rest(c.env, 'user_department_access', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify([...new Set(relatedIds)].map((departmentId) => ({ user_id: profileId, department_id: departmentId, access_type: 'RELATED', active: true })))
          }, 'service');
          if (!accessResult.response.ok) throw new Error(accessResult.data?.message || 'Gagal menyimpan related department.');
        }
      }
      if (existing) updated += 1; else created += 1;
    } catch (error: any) {
      failed.push({ row: rowNumber, identifier: String(raw.employee_code || raw.username || raw.email || '').trim() || undefined, employee_code: String(raw.employee_code || ''), message: error?.message || 'Unknown error' });
    }
  }
  await audit(c.env, actor, 'IMPORT_USERS', 'users', { requested: parsed.data.rows.length, created, updated, failed: failed.length, simplified_template: true });
  return c.json({ ok: true, imported: created + updated, created, updated, deleted: 0, failed });
});

app.post('/api/admin/import', requireAdmin, async (c) => {
  const parsed = z.object({
    entity: z.enum(['departments','approval_matrix','kpi_forms','kpi_points','demo_approvals']),
    rows: z.array(z.record(z.string(), z.any())).min(1).max(500)
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Payload import tidak valid. Maksimal 500 baris per batch.' }, 400);

  const entity = parsed.data.entity;
  if (entity === 'demo_approvals') {
    const response = await fetch(`${supabaseBaseUrl(c.env)}/rest/v1/rpc/seed_demo_approval_states_v1`, {
      method: 'POST',
      headers: { ...jsonHeaders(c.env.SUPABASE_PUBLISHABLE_KEY, c.get('accessToken')), Prefer: 'return=representation' },
      body: JSON.stringify({ p_rows: parsed.data.rows })
    });
    const data = await readJsonSafe(response);
    if (!response.ok) return c.json({ ok: false, message: data?.message || 'Gagal memuat status approval dummy.' }, 400);
    return c.json({ ok: true, imported: Number(data?.imported || 0), failed: data?.failed || [] });
  }
  const failures: Array<{ row: number; identifier?: string; message: string }> = [];
  const transformed: Array<{ row: number; identifier: string; payload: Record<string, any> }> = [];
  const submitterRoles = new Set(['*','STAFF','LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI']);
  const approvalStageRoles = new Set(['LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI']);

  const departmentsResult = await rest(c.env, 'departments?select=id,department_code,department_name&limit=5000', {}, 'service');
  if (!departmentsResult.response.ok) return c.json({ ok: false, message: departmentsResult.data?.message || 'Master department tidak dapat dibaca.' }, 400);
  const departmentByCode = new Map<string,any>((departmentsResult.data || []).map((row: any) => [String(row.department_code).toUpperCase(), row]));

  let userByEmployee = new Map<string,any>();
  let formByNo = new Map<string,any>();
  if (entity === 'kpi_forms') {
    const usersResult = await rest(c.env, 'users?select=id,employee_code,full_name,department_id,section,position_name,role_code,active&limit=10000', {}, 'service');
    if (!usersResult.response.ok) return c.json({ ok: false, message: usersResult.data?.message || 'Master user tidak dapat dibaca.' }, 400);
    userByEmployee = new Map((usersResult.data || []).map((row: any) => [String(row.employee_code).toUpperCase(), row]));
  }
  if (entity === 'kpi_points') {
    const formsResult = await rest(c.env, 'kpi_forms?select=id,form_no&limit=10000', {}, 'service');
    if (!formsResult.response.ok) return c.json({ ok: false, message: formsResult.data?.message || 'KPI form tidak dapat dibaca.' }, 400);
    formByNo = new Map((formsResult.data || []).map((row: any) => [String(row.form_no).toUpperCase(), row]));
  }

  for (let index = 0; index < parsed.data.rows.length; index += 1) {
    const raw = withoutAction(parsed.data.rows[index] || {});
    try {
      if (entity === 'departments') {
        const departmentCode = String(raw.department_code || '').trim().toUpperCase();
        const departmentName = String(raw.department_name || '').trim();
        if (!departmentCode || !departmentName) throw new Error('department_code dan department_name wajib diisi.');
        transformed.push({ row: index + 2, identifier: departmentCode, payload: { department_code: departmentCode, department_name: departmentName, plant_code: String(raw.plant_code || '').trim() || null, sort_order: Number(raw.sort_order || 999), active: importBoolean(raw.active, true), updated_at: new Date().toISOString() } });
      }
      if (entity === 'approval_matrix') {
        const matrixCode = String(raw.matrix_code || '').trim().toUpperCase();
        const departmentCode = String(raw.department_code || '').trim().toUpperCase();
        const department = departmentCode ? departmentByCode.get(departmentCode) : null;
        if (!matrixCode || !departmentCode) throw new Error('matrix_code dan department_code wajib diisi.');
        if (!department) throw new Error(`Department code ${departmentCode} tidak ditemukan.`);
        const roleFields = ['submitter_role_code','checked1_role_code','approval1_role_code','approval2_role_code','approval3_role_code','checked2_role_code','approval4_role_code'];
        const rolePayload: Record<string,string|null> = {};
        for (const field of roleFields) {
          const fallback = field === 'submitter_role_code' ? '*' : '';
          const value = String(raw[field] || fallback).trim().toUpperCase();
          const allowed = field === 'submitter_role_code' ? submitterRoles : approvalStageRoles;
          if (value && !allowed.has(value)) throw new Error(`${field} berisi role tidak valid: ${value}`);
          rolePayload[field] = value || null;
        }
        transformed.push({ row: index + 2, identifier: matrixCode, payload: { matrix_code: matrixCode, department_id: department.id, section: String(raw.section || '*').trim() || '*', ...rolePayload, priority: Number(raw.priority || 100), active: importBoolean(raw.active, true), note: String(raw.note || '').trim() || null, updated_by: c.get('appUser').id, updated_at: new Date().toISOString() } });
      }
      if (entity === 'kpi_forms') {
        const formNo = String(raw.form_no || '').trim().toUpperCase();
        const employeeCode = String(raw.employee_code || '').trim().toUpperCase();
        const user = userByEmployee.get(employeeCode);
        const periodYear = Number(raw.period_year);
        const periodMonth = Number(raw.period_month);
        if (!formNo || !employeeCode || !String(raw.form_title || '').trim()) throw new Error('form_no, employee_code, dan form_title wajib diisi.');
        if (!user) throw new Error(`Employee code ${employeeCode} tidak ditemukan.`);
        if (!user.active) throw new Error(`User ${employeeCode} tidak aktif.`);
        if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) throw new Error('period_year tidak valid.');
        if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) throw new Error('period_month harus 1 sampai 12.');
        const department = [...departmentByCode.values()].find((row: any) => row.id === user.department_id);
        transformed.push({ row: index + 2, identifier: formNo, payload: {
          form_no: formNo,
          period_year: periodYear,
          period_month: periodMonth,
          period_key: `${periodYear}-${String(periodMonth).padStart(2,'0')}`,
          user_id: user.id,
          employee_code: user.employee_code,
          full_name: user.full_name,
          department_id: user.department_id || null,
          department_name: department?.department_name || null,
          section: user.section || null,
          position_name: user.position_name || null,
          role_code: user.role_code,
          form_title: String(raw.form_title).trim(),
          due_date: String(raw.due_date || '').trim() || null,
          updated_at: new Date().toISOString()
        } });
      }
      if (entity === 'kpi_points') {
        const formNo = String(raw.form_no || '').trim().toUpperCase();
        const form = formByNo.get(formNo);
        const calcType = String(raw.calc_type || 'HIGHER_BETTER').trim().toUpperCase();
        if (!formNo || !form) throw new Error(`form_no ${formNo || '(blank)'} tidak ditemukan.`);
        if (!['HIGHER_BETTER','LOWER_BETTER','MANUAL_SCORE'].includes(calcType)) throw new Error(`calc_type ${calcType} tidak valid.`);
        const pointNo = Number(raw.point_no);
        const weight = Number(raw.weight_percent);
        if (!Number.isInteger(pointNo) || pointNo < 1) throw new Error('point_no harus bilangan bulat minimal 1.');
        if (!String(raw.kpi_objective || '').trim()) throw new Error('kpi_objective wajib diisi.');
        if (!Number.isFinite(weight) || weight < 0 || weight > 100) throw new Error('weight_percent harus 0 sampai 100.');
        transformed.push({ row: index + 2, identifier: `${formNo} / point ${pointNo}`, payload: {
          form_id: form.id,
          point_no: pointNo,
          subject: String(raw.subject || '').trim() || null,
          kpi_objective: String(raw.kpi_objective).trim(),
          uom: String(raw.uom || '').trim() || null,
          weight_percent: weight,
          source_data: String(raw.source_data || '').trim() || null,
          target: calcType === 'MANUAL_SCORE' ? null : nullableNumber(raw.target),
          actual: calcType === 'MANUAL_SCORE' ? null : nullableNumber(raw.actual),
          calc_type: calcType,
          manual_score: calcType === 'MANUAL_SCORE' ? nullableNumber(raw.manual_score) : null,
          updated_at: new Date().toISOString()
        } });
      }
    } catch (error: any) {
      failures.push({ row: index + 2, identifier: String(raw.employee_code || raw.form_no || raw.matrix_code || raw.department_code || '').trim() || undefined, message: error?.message || 'Transformasi data gagal.' });
    }
  }

  if (!transformed.length) return c.json({ ok: true, imported: 0, deleted: 0, failed: failures });
  const conflictMap: Record<string,string> = { departments: 'department_code', approval_matrix: 'matrix_code', kpi_forms: 'form_no', kpi_points: 'form_id,point_no' };
  const endpoint = `${entity}?on_conflict=${encodeURIComponent(conflictMap[entity])}`;
  const result = await rest(c.env, endpoint, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(transformed.map((item) => item.payload))
  }, 'service');

  let imported = 0;
  if (result.response.ok) {
    imported = Array.isArray(result.data) ? result.data.length : transformed.length;
  } else {
    // A bulk database failure does not identify the bad row. Retry each valid row
    // individually so the Import Center can show an exact row and database reason.
    for (const item of transformed) {
      const single = await rest(c.env, endpoint, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([item.payload])
      }, 'service');
      if (single.response.ok) imported += Array.isArray(single.data) ? single.data.length : 1;
      else failures.push({ row: item.row, identifier: item.identifier, message: upstreamErrorMessage(single.data, 'Database menolak baris ini.') });
    }
  }
  await audit(c.env, c.get('appUser'), 'IMPORT_BATCH', entity, { requested: parsed.data.rows.length, imported, failed: failures.length, simplified_template: true });
  return c.json({ ok: true, imported, deleted: 0, failed: failures });
});

app.post('/api/admin/settings', requireAdmin, async (c) => {
  const parsed = z.object({ key: z.string().min(1), value: z.string(), description: z.string().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, message: 'Setting tidak valid.' }, 400);
  const result = await rest(c.env, `system_settings?on_conflict=key`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ ...parsed.data, updated_by: c.get('appUser').id, updated_at: new Date().toISOString() })
  });
  if (!result.response.ok) return c.json({ ok: false, message: result.data?.message || 'Gagal menyimpan setting.' }, 400);
  return c.json({ ok: true, item: result.data?.[0] });
});

app.notFound((c) => {
  const pathname = new URL(c.req.url).pathname;
  if (!pathname.startsWith('/api/')) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ ok: false, message: 'Endpoint tidak ditemukan.' }, 404);
});
app.onError((error, c) => {
  if (error instanceof RuntimeConfigError) {
    return c.json({
      ok: false,
      code: 'RUNTIME_CONFIG_MISSING',
      message: 'Cloudflare runtime variables belum lengkap. Tambahkan variable yang disebutkan lalu Save and Deploy.',
      missing: error.missing
    }, 503);
  }
  console.error(error);
  return c.json({ ok: false, message: error.message || 'Internal server error.' }, 500);
});

export default app;
