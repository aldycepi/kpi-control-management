# Migration from Apps Script

## Tujuan

Memindahkan UI dan proses berat dari Google Apps Script tanpa mengubah inti proses bisnis KPI.

## Mapping teknis

| Apps Script | Rebuild |
|---|---|
| HtmlService UI | React and Vite SPA |
| doGet and server functions | Cloudflare Worker API |
| Script Properties | Cloudflare secrets and system_settings |
| Spreadsheet or Apps Script processing | PostgreSQL RPC |
| Apps Script session logic | Supabase Auth |
| Manual access checks | RLS plus Worker authorization |
| Drive evidence and PDF | Supabase private Storage |
| Time-driven notification logic | Supabase Realtime and scheduled extension point |
| Long-running reroute | Cursor-batched PostgreSQL RPC |
| Apps Script logs | audit_logs and Cloudflare observability |

## Migration strategy

### Option A: Reuse existing Supabase project

Gunakan ini jika current production data sudah berada pada schema Supabase yang sama.

1. Export database backup.
2. Freeze perubahan approval matrix selama cutover.
3. Jalankan migration `0002`, `0003`, dan `0004`.
4. Pastikan setiap `users.auth_user_id` terhubung ke Supabase Auth user.
5. Deploy aplikasi ke staging Cloudflare.
6. Bandingkan dashboard, queue, dan approval route dengan aplikasi lama.
7. Jalankan scoped reroute hanya untuk form yang memang membutuhkan route baru.
8. Pindahkan user ke URL Cloudflare.
9. Pertahankan Apps Script lama dalam read-only mode selama masa verifikasi.

### Option B: New Supabase project

1. Jalankan seluruh migrations `0001` sampai `0004`.
2. Bootstrap admin pertama.
3. Import departments.
4. Buat users atau import profile lalu hubungkan Auth identities.
5. Import approval matrix.
6. Import KPI forms dan points.
7. Refresh monthly recap.
8. Validasi sample data per status dan department.

## Data validation minimum

Bandingkan nilai berikut antara sistem lama dan baru:

- Total active users
- Total departments
- Total matrix rows
- KPI count per period and status
- KPI points count per form
- Final score sample
- Current stage sample
- Approval queue per approver
- Not submitted count per department
- Evidence count
- Approval history count

## Cutover rule

Jangan menjalankan proses submit atau approval pada dua aplikasi secara bersamaan. Tentukan satu system of record pada saat cutover.
