# Architecture V2

## Runtime flow

```text
Browser
  ├─ GET /api/public-config
  ├─ React UI
  ├─ Supabase Auth session
  ├─ Direct Supabase RPC/table/storage under RLS
  └─ Privileged /api/* requests
          ↓
Cloudflare Worker
  ├─ Runtime configuration guard
  ├─ Login by email/username/employee code
  ├─ Session validation
  ├─ Admin authorization
  ├─ Supabase Auth Admin operations
  ├─ Controlled bulk import
  ├─ Official PDF generation
  └─ Audit logging
          ↓
Supabase
  ├─ Auth
  ├─ PostgreSQL
  ├─ RLS
  ├─ RPC
  ├─ Realtime
  └─ Private Storage
```

## Configuration model

V2 does not compile Supabase URL or publishable key into the Vite build. The browser requests public configuration from Cloudflare at runtime.

```text
Cloudflare runtime variable
  → /api/public-config
  → configureSupabase()
  → render React
```

When configuration is missing, the Worker returns HTTP 503 with exact missing variable names. React shows a controlled configuration screen instead of constructing an undefined URL.

## Privilege boundary

Browser:

- publishable key
- authenticated access token
- RLS-scoped data

Worker only:

- service-role key
- setup token
- Auth Admin API
- bulk user creation
- privileged reroute and PDF operations
