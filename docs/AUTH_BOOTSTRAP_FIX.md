# Auth Bootstrap Fix v2.0.1

## Penyebab umum

Endpoint Supabase Auth Admin membutuhkan Legacy `service_role` JWT pada konfigurasi build ini. Nilai Cloudflare `SUPABASE_SERVICE_ROLE_KEY` harus diawali `eyJ` dan memiliki tiga bagian JWT. Jangan isi dengan `sb_secret_...`.

## Cloudflare runtime variables

Plaintext:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `ALLOWED_ORIGIN`

Secret:
- `SUPABASE_SERVICE_ROLE_KEY`: Legacy service_role JWT (`eyJ...`)
- `SETUP_TOKEN`

## Diagnosis

Buka `/api/health`. Hasil yang benar:

```json
{
  "authAdminKeyType": "legacy_service_role_jwt",
  "authAdminReady": true
}
```

Jika email sudah pernah dibuat di Supabase Authentication, hapus user tersebut dari Authentication > Users atau gunakan email lain sebelum mengulangi `/setup`.
