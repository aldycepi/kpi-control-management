# Deployment Baru: GitHub + Supabase + Cloudflare

Gunakan deployment baru. Jangan hubungkan repository ini ke Worker lama.

---

## A. GitHub

1. Buat repository baru.
2. Pilih **Private**.
3. Jangan membuat README otomatis.
4. Upload seluruh isi folder project.
5. Pastikan file berikut terlihat langsung di root repository:

```text
package.json
pnpm-lock.yaml
wrangler.jsonc
vite.config.ts
src/
worker/
supabase/
public/
```

Jangan upload:

```text
node_modules/
dist/
.dev.vars
.wrangler/
```

---

## B. Supabase Baru

1. Buat project Supabase baru.
2. Buka **SQL Editor**.
3. Buka file:

```text
supabase/INSTALL_ALL.sql
```

4. Salin seluruh isi file.
5. Tempel ke SQL Editor.
6. Klik **Run**.
7. Jalankan:

```text
supabase/VERIFY_INSTALL.sql
```

Ambil data berikut dari Supabase Project Settings:

```text
Project URL
Publishable key
Legacy service_role key
```

`service_role` tidak boleh ditempatkan di GitHub atau frontend.

---

## C. Cloudflare Worker Baru

Buka:

```text
Cloudflare Dashboard
→ Workers & Pages
→ Create
→ Connect to Git
```

Pilih repository GitHub baru.

### Build configuration

```text
Production branch: main
Root directory: kosong
Build command: pnpm install --frozen-lockfile && pnpm run build
```

### Build variables

```text
NODE_VERSION=22.22.0
PNPM_VERSION=10.11.1
SKIP_DEPENDENCY_INSTALL=1
```

Tidak perlu menambahkan:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Klik deploy. Deployment pertama boleh menampilkan layar konfigurasi karena runtime variables belum dimasukkan.

---

## D. Cloudflare Runtime Variables

Masuk ke:

```text
Worker
→ Settings
→ Variables and Secrets
```

### Plaintext

```text
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
ALLOWED_ORIGIN=https://NAMA-WORKER.SUBDOMAIN.workers.dev
```

`ALLOWED_ORIGIN` tidak menggunakan slash `/` di belakang.

### Secret

```text
SUPABASE_SERVICE_ROLE_KEY=service_role_key
SETUP_TOKEN=token_acak_panjang
```

Klik **Save and Deploy**.

Deployment berikutnya tidak menghapus runtime variables karena `wrangler.jsonc` menggunakan:

```json
"keep_vars": true
```

---

## E. Verifikasi Runtime

Buka:

```text
https://URL-WORKER/api/health
```

Hasil normal:

```json
{
  "ok": true,
  "runtimeConfigured": true,
  "missing": []
}
```

Buka:

```text
https://URL-WORKER/api/public-config
```

Hasil normal mengandung:

```text
supabaseUrl
supabasePublishableKey
appVersion
```

Publishable key memang digunakan browser. `service_role` tidak pernah dikirim ke browser.

---

## F. Buat Administrator Pertama

Buka:

```text
https://URL-WORKER/setup
```

Isi:

```text
Setup Token: sama dengan SETUP_TOKEN Cloudflare
Email: email admin
Password: minimal 8 karakter
Employee Code: ADMIN001
Username: admin
Full Name: System Administrator
```

Klik **Create First Administrator**.

Setelah berhasil, login melalui:

```text
https://URL-WORKER/login
```

Login mendukung:

```text
email
username
employee code
```

---

## G. Import Data

Masuk sebagai ADMIN:

```text
Admin → Import Center
```

Entity yang didukung:

```text
Users
Departments
Approval Matrix
KPI Forms
KPI Points
```

Format:

```text
CSV
Excel .xlsx / .xls
```

Semua template memiliki kolom `action`. Gunakan `UPSERT` untuk create/update dan `DELETE` untuk penghapusan terkendali. Untuk user baru, password sementara wajib diisi. Untuk user lama, password boleh dikosongkan.

---

## H. Jika Runtime Variable Belum Lengkap

Aplikasi menampilkan layar:

```text
Cloudflare belum terhubung ke Supabase
```

Layar tersebut akan menampilkan variable yang hilang. Contoh:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

V2 tidak akan menghasilkan URL seperti:

```text
undefined/auth/v1/token
```
