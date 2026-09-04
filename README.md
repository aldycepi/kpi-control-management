# Banshu KPI Control Center V2.1.3

Aplikasi monitoring KPI PT Banshu Electric Indonesia berbasis:

- React + TypeScript + Vite
- Cloudflare Worker + Hono
- Supabase PostgreSQL, Auth, RLS, Realtime, dan Storage
- GitHub deployment

## Perubahan utama V2

V2 dibangun ulang untuk menghapus masalah konfigurasi lama seperti:

```text
Invalid URL: undefined/auth/v1/token
```

Frontend **tidak lagi membutuhkan `VITE_SUPABASE_URL` atau `VITE_SUPABASE_PUBLISHABLE_KEY` saat build**. Browser mengambil konfigurasi publik Supabase dari endpoint runtime Cloudflare:

```text
/api/public-config
```

Jika Cloudflare belum dikonfigurasi, aplikasi menampilkan layar konfigurasi yang menyebutkan nama variable yang masih kurang. Aplikasi tidak lagi membuat URL `undefined`.

## Tema UI

Tema **Fluent Executive Industrial** menggabungkan:

- Apple: clean layout, whitespace, typography
- Linear: sidebar, navigation, icon language
- Microsoft Fluent Design: acrylic, depth, rounded corner, motion
- Power BI: executive KPI cards dan chart
- Siemens Industrial: operational monitoring
- Glassmorphism: floating acrylic surfaces

Logo perusahaan tersedia di:

```text
public/brand/banshu-logo.png
public/brand/banshu-icon.png
```

## Fitur

- Executive dashboard
- KPI worksheet
- Draft dan submission
- Evidence upload
- Multi-stage approval
- Monitoring belum submit
- Archive, popup-free Browser Print, and compact one-page Official PDF
- Notifications
- User Management
- Simplified Import Center: CSV/Excel templates contain only essential business fields
- Automatic database resolution for email, IDs, user snapshot, period key, status, form ID, and calculated scores
- Correlated demo dataset: 10 Departments, 50 Users, 10 Approval Matrices, 50 KPI Forms, 250 KPI Points, and 20 workflow states
- Excel KPI Point template with calc_type dropdown
- Export User CSV and Excel using the simplified column set
- Collapsible sidebar with saved user preference
- Improved My KPI summary contrast and calendar month picker
- Safe hard delete user dan department dengan database protection
- Department Management
- Approval Matrix
- Scoped Reroute
- Audit Trail
- System Health
- Settings
- Bootstrap administrator pertama

## Instalasi baru

Gunakan dokumen berikut:

```text
docs/DEPLOYMENT_NEW_PROJECT.md
```

Urutan ringkas:

1. Upload repository ke GitHub Private.
2. Buat Supabase baru.
3. Jalankan `supabase/INSTALL_ALL.sql`.
4. Buat Cloudflare Worker baru dan connect ke GitHub.
5. Tambahkan runtime variables Cloudflare.
6. Buka `/setup` untuk membuat admin pertama.

## Build Cloudflare

```text
Build command:
pnpm install --frozen-lockfile && pnpm run build

Root directory:
kosong

Production branch:
main
```

Build variables:

```text
NODE_VERSION=22.22.0
PNPM_VERSION=10.11.1
SKIP_DEPENDENCY_INSTALL=1
```

Tidak perlu memasukkan variable `VITE_SUPABASE_*`.

## Runtime variables Cloudflare

Plaintext:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
ALLOWED_ORIGIN
```

Secret:

```text
SUPABASE_SERVICE_ROLE_KEY
SETUP_TOKEN
```

`wrangler.jsonc` sudah memiliki:

```json
"keep_vars": true
```

## Database

Untuk Supabase baru, jalankan satu file:

```text
supabase/INSTALL_ALL.sql
```

Setelah selesai, jalankan:

```text
supabase/VERIFY_INSTALL.sql
```

## Validasi source

Versi paket ini sudah diuji dengan:

```text
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

Laporan tersedia di:

```text
docs/VALIDATION_REPORT.md
```


## V2.1.1 Import diagnostics

Import Center now shows row number, data reference, exact failure reason, and provides a downloadable CSV failure report.

## V2.1.2 session fix

Authenticated requests refresh expiring JWTs automatically. Mandatory password changes use the signed-in Supabase user flow and no longer depend on an Admin API password update. Import failures remain visible per row in the Import Result panel.

## V2.1.5 Cloudflare-safe import and compact KPI PDF

- User imports are processed automatically in batches of five users per Worker invocation.
- Import progress and row-level failure reasons remain visible in Import Center.
- Browser Print and Official PDF now use a compact one-page A4 landscape layout drawn from scratch.
- The layout visually refers to `FRM-HRD-030 Rev.02` without stamping values into a fixed spreadsheet PDF.
- Only actual KPI rows are printed; no second signature page and no unused fixed KPI rows.
- The same one-page layout is used for Browser Print and archived Official PDF.
- Dummy workflow data includes 12 forms approved through BOD BEI and 8 forms at intermediate stages.
- Existing databases must run `supabase/migrations/0007_demo_approval_seed.sql` before importing Demo Approval Status.

Implementation notes:

```text
docs/UPDATE_TO_V2.1.5.md
docs/VALIDATION_REPORT_V2.1.5.md
```


## V2.1.6

Official KPI PDF and Browser Print now follow FRM-HRD-030 Rev.02 styling, omit Approval Journey, and include QR approvals plus checked-by initials.
