# Deployment Checklist

## GitHub

- [ ] Create a new Private repository
- [ ] Upload project files at repository root
- [ ] Confirm `package.json`, `pnpm-lock.yaml`, and `wrangler.jsonc` are visible at root
- [ ] Confirm `.dev.vars`, `node_modules`, `dist`, and `.wrangler` are absent

## Supabase

- [ ] Create a new Supabase project
- [ ] Run `supabase/INSTALL_ALL.sql`
- [ ] Run `supabase/VERIFY_INSTALL.sql`
- [ ] Copy Project URL
- [ ] Copy Publishable key
- [ ] Copy legacy `service_role` key for Worker secret only

## Cloudflare

- [ ] Create a new Worker using Connect to Git
- [ ] Production branch: `main`
- [ ] Root directory: empty
- [ ] Build command: `pnpm install --frozen-lockfile && pnpm run build`
- [ ] Add `NODE_VERSION=22.22.0`
- [ ] Add `PNPM_VERSION=10.11.1`
- [ ] Add `SKIP_DEPENDENCY_INSTALL=1`
- [ ] Add runtime plaintext variables
- [ ] Add runtime secrets
- [ ] Save and Deploy

## Runtime verification

- [ ] `/api/health` returns `ok: true`
- [ ] `/api/public-config` returns the correct Supabase URL
- [ ] `/api/setup/status` returns `needsSetup: true`
- [ ] `/setup` creates the first administrator
- [ ] Login works with email, username, and employee code

## Functional smoke test

- [ ] Create department
- [ ] Create staff and approver users
- [ ] Import CSV
- [ ] Import Excel
- [ ] Create KPI draft and submit
- [ ] Approve/reject a KPI
- [ ] Upload evidence
- [ ] Generate PDF
- [ ] Test scoped reroute on sample data
- [ ] Verify audit trail
- [ ] Test deactivate before any hard delete
