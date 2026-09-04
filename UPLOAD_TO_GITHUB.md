# Upload V2.1.5 to GitHub

Upload the contents of this folder directly to the repository root.

The repository root must show:

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

Do not upload:

```text
node_modules/
dist/
.dev.vars
.env.local
.wrangler/
*.tsbuildinfo
```

## Important V2.1.5 files

```text
worker/officialPdf.ts
worker/index.ts
src/lib/officialPrint.ts
src/pages/AdminPages.tsx
src/pages/ArchivePage.tsx
supabase/migrations/0007_demo_approval_seed.sql
public/templates/demo_approvals_template.xlsx
public/templates/demo_approvals_dummy_50.xlsx
```

Existing Supabase databases must run:

```text
supabase/migrations/0007_demo_approval_seed.sql
```

No new Cloudflare runtime variable is required.
