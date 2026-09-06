# Upload KPI Management Control V2.2.2 to GitHub

Upload the contents of this folder directly to the repository root.

Repository root must contain:

```text
package.json
pnpm-lock.yaml
wrangler.jsonc
src/
worker/
public/
supabase/
templates/
```

Do not upload local/runtime-only files:

```text
node_modules/
dist/
.dev.vars
.env.local
.wrangler/
*.tsbuildinfo
```

## V2.2.2 patch scope

Primary changed files:

```text
worker/officialPdf.ts
worker/index.ts
src/app/App.tsx
src/components/Layout.tsx
src/lib/types.ts
src/pages/AdminPages.tsx
src/pages/ApprovalPage.tsx
src/pages/ChangePasswordPage.tsx
src/pages/NotificationsPage.tsx
src/pages/PersonalSettingsPage.tsx
src/styles.css
package.json
wrangler.jsonc
DMS_UI_UX_PATCH_V2.2.2.md
```

## Supabase

V2.2.2 introduces no new database migration and does not require `INSTALL_ALL.sql`.

If the existing production database already contains the V2.2 global-search function (`global_kpi_search_v1`), do not run any SQL for this patch.

## Deploy

Commit/push the updated source to the GitHub branch connected to Cloudflare. Cloudflare can then rebuild and redeploy the application using the existing runtime variables and Supabase project.
