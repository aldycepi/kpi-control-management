# Update to V2.1

No Supabase schema migration is required.

## GitHub

Replace the repository source with the contents of the V2.1 package, or at minimum update:

```text
src/components/Layout.tsx
src/pages/MyKpiPage.tsx
src/pages/AdminPages.tsx
src/styles.css
worker/index.ts
public/templates/
templates/
package.json
wrangler.jsonc
```

Commit to `main` and wait for Cloudflare deployment.

## Cloudflare

The Worker name in `wrangler.jsonc` is:

```text
kpi-executive-manufacturing
```

Existing runtime variables remain unchanged:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SETUP_TOKEN
ALLOWED_ORIGIN
```

## Dummy data

Use Import Center → Load Dummy 20 and execute in this order:

1. Departments
2. Users
3. Approval Matrix
4. KPI Forms
5. KPI Points

Dummy users use password:

```text
DemoPass123!
```

They are created with mandatory password change enabled.
