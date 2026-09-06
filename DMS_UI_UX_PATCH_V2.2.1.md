# KPI Management Control — DMS UI/UX Patch V2.2.1

This patch is UI/PDF only. It does not change the Supabase data model, KPI records, approval history, or approval route logic.

## 1. Sidebar
- Replaced the blue/navy visual cast with a neutral graphite/charcoal corporate sidebar.
- Gold `#FFB718` remains the active/accent color.
- Warm neutral text, hover, footer, context card, avatar, and collapsed-state styling now align with the DMS visual language.
- Workspace, cards, forms, tables, and the existing V2.2 DMS theme are otherwise unchanged.

## 2. KPI Official Form Approval Columns
The approval form is restored to the seven-stage legacy structure.

### Business reading direction — RIGHT → LEFT
1. Dibuat — user Staff/Leader
2. Checked 1 — paraf/nama
3. Diperiksa — Approval 1
4. Diketahui — Approval 2
5. Disetujui — Approval 3
6. Checked 2 — paraf/nama
7. Disetujui — Approval 4

### Visual column order — LEFT → RIGHT
`Disetujui (Approval 4) | Checked 2 | Disetujui (Approval 3) | Diketahui (Approval 2) | Diperiksa (Approval 1) | Checked 1 | Dibuat`

- `Checked 1` and `Checked 2` use initials/paraf plus signer name, role, and date.
- `Dibuat` and Approval 1–4 retain digital QR verification.
- Signer name, role, and date are centered and aligned inside each column.
- Existing database stages remain unchanged: `Checked1`, `Approval1`, `Approval2`, `Approval3`, `Checked2`, `Approval4`.

## Deployment
No new Supabase migration is required for this patch. Deploy the updated source to GitHub/Cloudflare as an application revision only.
