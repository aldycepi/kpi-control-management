# KPI Management Control — DMS UI/UX Revision V2.2

This revision keeps the existing KPI data model and workflow, while redesigning the application to follow the visual language of the PT Banshu Electric Indonesia Document Management System (DMS).

## Implemented

### Executive Dashboard
- DMS corporate palette and styling.
- `Top Performance` changed to `TOP 10 Performers`.
- Added `BOTTOM 10 Performance`.
- Removed `Recent Approval Activity` from the dashboard.
- Added Global Search for form number, employee, department, section, status, stage, form title and KPI objective/subject/source data.
- Search uses `global_kpi_search_v1` when migration `0008_dms_ui_global_search.sql` is installed, and automatically falls back to the existing archive search RPC if not yet installed.

### Approval Form / Official PDF
- Approval visual columns are now LEFT → RIGHT: `Dibuat | Diperiksa | Diketahui | Disetujui`.
- This means the approval reading/authorization direction is RIGHT → LEFT: `Disetujui → Diketahui → Diperiksa → Dibuat`.
- `Diperiksa` resolves Assman approval.
- `Diketahui` resolves Plant Manager approval.
- `Disetujui` resolves GM, BOD KI and BOD BEI.
- QR codes are centered.
- Signer name is directly below the QR code.
- Role/date/token hierarchy is centered and normalized.
- Typography was enlarged and aligned.

### My KPI Workspace
- Added `Import Template` CSV download.
- Added `Import / Upload KPI` supporting CSV and Excel (.xlsx/.xls).
- Added validation preview before applying data to the workspace.
- Invalid rows are flagged and cannot be applied.
- Total weight must equal 100% before data can be applied.
- Import does NOT immediately write to the database. Imported rows are loaded into the draft workspace first and only persist after `Save Draft`, protecting existing KPI data.

### Global UI/UX
- Corporate palette:
  - Gold `#FFB718`
  - Deep Navy `#071A2E`
  - Secondary Navy `#0B243D`
  - Warm White `#FFFDF5`
  - White `#FFFFFF`
  - Success `#168C7A`
- Redesigned navigation, top bar, buttons, cards, tables, forms, KPI cards, modals and spacing.
- Removed blue/purple SaaS-dashboard visual emphasis.
- Responsive desktop/laptop/tablet layout preserved.

## Supabase Update Required
For full KPI-objective global search, execute:

`supabase/migrations/0008_dms_ui_global_search.sql`

The UI remains functional before this migration because the dashboard has a compatibility fallback to `archive_search_v2`.

## Validation Note
The source was syntax-checked with TypeScript parser. Full package build could not be completed in the artifact environment because external npm registry access was unavailable, so dependencies could not be installed there.
