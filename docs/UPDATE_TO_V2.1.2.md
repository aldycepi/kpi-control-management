# Update V2.1.2 — Session and Password Change Fix

## Fixed

1. Authenticated API requests now check token expiry and refresh the Supabase session automatically.
2. A Worker request that receives a session-related HTTP 401 is retried once with a refreshed JWT.
3. Mandatory password changes now use `supabase.auth.updateUser({ password })`, the supported self-service password flow for a signed-in user.
4. The Worker endpoint `/api/me/password-complete` only clears `must_change_password` after Supabase Auth succeeds.
5. If the session is truly invalid, the application clears only the local session and returns the user to login with a clear message.
6. Import Center keeps the V2.1.1 row-level failure table and downloadable failure report.

## Deployment

Replace the GitHub source with this package and allow Cloudflare to deploy the `main` branch. No SQL migration is required.
