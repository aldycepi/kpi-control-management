# Runtime Configuration Architecture

## Prinsip V2

Frontend tidak membaca Supabase config dari Vite build environment.

Alur:

```text
Browser
  ↓ GET /api/public-config
Cloudflare Worker runtime variables
  ↓
Supabase public URL + publishable key
  ↓
Supabase JavaScript client initialization
```

Login username atau employee code menggunakan:

```text
POST /api/auth/login
```

Worker mencari email profil menggunakan service role, kemudian mengirim autentikasi password ke Supabase Auth. Service-role key tidak pernah dikirim ke browser.

## Variable wajib

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SETUP_TOKEN
ALLOWED_ORIGIN
```

## Endpoint diagnosis

```text
/api/health
/api/public-config
/api/setup/status
```

`/api/health` mengembalikan daftar variable runtime yang belum tersedia tanpa menampilkan nilai secret.
