# Update V2.1.6 - KPI Form Template and QR Approval

## Main changes

1. Removed the `APPROVAL JOURNEY` section from Browser Print and Official PDF.
2. Rebuilt the KPI document layout to follow the supplied `NEW_FORMAT_KPI.xlsx` / `FRM-HRD-030 Rev.02` visual structure:
   - Banshu logo at the upper left.
   - Form code at the upper right.
   - Light-blue KPI title band.
   - Employee data in left/right aligned rows.
   - Black KPI table header.
   - Columns: No., Subject, KPI (Objective), UOM, Bobot, Sumber Data, Target, Actual, Score.
   - Grey total/final-score row.
3. Browser Print and Generate Official PDF now use the same one-page native PDF renderer.
4. Digital approvals are represented by scannable QR codes containing the database signature token.
5. `Checked1` and `Checked2` are shown as compact `Checked by` records with initials/paraf, signer name, and date.
6. Main signature layout follows the template wording:
   - Known / Diketahui: Approval 4 / BOD BEI.
   - Approved / Disetujui: Approval 1, Approval 2, Approval 3.
   - Prepared / Dibuat: KPI submitter.
7. Table row height is calculated from the actual number of KPI points. Unused fixed rows are not generated.
8. The company logo is loaded from `public/logo-banshu.png` through the Cloudflare static-assets binding.

## Files changed

- `worker/officialPdf.ts`
- `worker/qrMatrix.ts`
- `worker/index.ts`
- `src/pages/ArchivePage.tsx`
- `public/logo-banshu.png`
- `package.json`
- `wrangler.jsonc`

## Deployment

No Supabase migration is required.

1. Replace the GitHub source with this package.
2. Commit to the production branch.
3. Wait for Cloudflare build and deployment to finish.
4. Refresh the application using `Ctrl + Shift + R`.
5. Confirm `/api/public-config` reports application version `2.1.6`.
6. Test Browser Print on a draft form and Official PDF on an approved form.

## QR notes

The QR code is generated locally inside the Cloudflare Worker. No signature data is sent to an external QR service. A scan returns a compact string containing the approval stage and database signature token.
