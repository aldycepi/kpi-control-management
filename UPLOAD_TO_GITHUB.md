# Upload KPI Management Control V2.2.3 to GitHub

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

## V2.2.3 patch scope

Primary changed files versus V2.2.2:

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

## Supabase

V2.2.3 introduces no new database migration and does not require `INSTALL_ALL.sql`.

The multiple approval action reuses the existing `review_kpi_form` RPC one form at a time. Existing server-side approval authorization, audit history, routing, and notification generation remain in control.

## Deploy

Commit/push the updated source to the GitHub branch connected to Cloudflare. Cloudflare can rebuild and redeploy with the existing runtime variables and existing Supabase project.

After deployment, test with 2–3 non-critical KPI forms first:
1. select multiple forms,
2. open the confirmation modal,
3. approve,
4. confirm each approved form advances to the next stage,
5. confirm audit history is created for each form,
6. confirm the current user's corresponding pending notification is read.
