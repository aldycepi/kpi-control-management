# Security Model

## Secrets

Tidak boleh berada di browser atau repository:

- SUPABASE_SERVICE_ROLE_KEY
- SETUP_TOKEN
- CLOUDFLARE_API_TOKEN

Publishable key memang dirancang untuk client, tetapi seluruh data tetap harus dilindungi RLS.

## Authentication

- Supabase Auth memvalidasi email dan password.
- Worker mendukung identifier berupa email, username, atau employee code.
- Worker memvalidasi access token melalui Supabase Auth.
- User profile harus aktif.
- Password sementara memaksa perubahan password.

## Authorization

- Browser queries dilindungi PostgreSQL RLS.
- Admin endpoints memeriksa `role_code=ADMIN` di Worker.
- Service role hanya digunakan server-side.
- Private storage read bergantung pada form scope.
- Cross-department access disimpan secara eksplisit.

## Hardening

- Security headers ditambahkan oleh Worker.
- CORS dibatasi menggunakan ALLOWED_ORIGIN.
- Admin input divalidasi dengan Zod.
- Import dibatasi 500 rows per request.
- Official PDF diberi SHA-256 hash.
- Sensitive RPC execute permission dicabut dari anonymous role.
- Audit event dicatat untuk privileged operations.

## Recommended production controls

- Gunakan Cloudflare Access bila aplikasi hanya untuk internal.
- Aktifkan Supabase network restrictions bila tersedia pada plan.
- Rotasi service role key jika pernah terekspos.
- Gunakan Cloudflare API token dengan permission minimum.
- Aktifkan branch protection dan secret scanning.
- Review audit log secara berkala.
