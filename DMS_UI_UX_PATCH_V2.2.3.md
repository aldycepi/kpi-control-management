# KPI Management Control — V2.2.3 Multiple Select / Bulk Approval

V2.2.3 adds controlled multiple selection to the existing Approval Queue without changing Supabase tables, approval routing, stage authorization, or existing KPI records.

## Scope

### Multiple Select
- Added a checkbox to every KPI currently visible in the authenticated user's Approval Queue.
- Added `Select` in the table header to select/deselect the loaded queue for the selected period.
- Selected rows receive a clear corporate gold highlight.
- Added `Clear Selection`.

### Bulk Approve
- Added `Approve Selected (N)` action.
- Bulk reject is intentionally not provided. Reject remains a one-document action because a specific rejection reason is required.
- Before processing, a confirmation modal shows:
  - number of selected KPI forms,
  - selected approval-stage counts,
  - a preview of the selected form numbers/employees,
  - an explicit audit/authorization notice.
- Processing status is displayed as `Processing X/Y`.

### Authorization and Audit Safety
- V2.2.3 reuses the existing `review_kpi_form` Supabase RPC for every selected KPI.
- Every form is processed individually, so the existing server-side `can_current_user_approve(...)` authorization remains authoritative.
- Existing stage sequencing remains unchanged (`Checked1 -> Approval1 -> Approval2 -> Approval3 -> Checked2 -> Approval4`).
- Existing approval history, audit log, next-stage routing, notification generation, and final-approval behavior are preserved per KPI.
- The frontend does not issue direct UPDATE operations against KPI forms for bulk approval.

### Partial Failure Handling
- A failure on one KPI does not silently cancel or hide the result of other KPI approvals.
- Successful KPI forms are removed from the queue after refresh.
- Failed KPI forms remain selected so the user can inspect/retry them.
- The UI reports the success count and the failed form numbers.

### Notification Synchronization
- Before each approval action, the UI snapshots the current user's unread `APPROVAL_PENDING` notification IDs for that KPI.
- After approval succeeds, only those pre-existing notification IDs are marked read. This avoids accidentally marking a newly created next-stage notification as read when the same user is assigned to consecutive approval stages.
- Notification RLS remains responsible for limiting updates to the authenticated user's own notifications.

## Database Impact

No Supabase migration is required for V2.2.3.

V2.2.3 does not modify:
- KPI records directly,
- KPI point records,
- approval matrix,
- approval route structure,
- approval history schema,
- audit log schema,
- notification schema.

Do not rerun `INSTALL_ALL.sql` for this patch.

## Updated Files

```text
src/pages/ApprovalPage.tsx
src/components/UI.tsx
src/styles.css
package.json
wrangler.jsonc
SOURCE_MANIFEST.txt
UPLOAD_MANIFEST.txt
DMS_UI_UX_PATCH_V2.2.3.md
UPLOAD_TO_GITHUB.md
```

## Deployment

Replace the updated source files, push to the GitHub branch connected to Cloudflare, and allow Cloudflare to redeploy. No Supabase action is required.
