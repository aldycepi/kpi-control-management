# Legacy Project Audit Summary

## Project footprint reviewed

- Google Apps Script source files
- HtmlService frontend
- Supabase SQL installer and storage policies
- Approval matrix workflow
- KPI calculation and submission functions
- Evidence and PDF handling
- Dashboard and monitoring functions
- Admin, migration, audit, health, and reroute modules

The uploaded project contained approximately 202 files and 366 active Apps Script functions.

## Core business flow retained

```text
User login
  → KPI draft
  → KPI points and calculation
  → Submit
  → Approval route resolution
  → Multi-stage approve or reject
  → Final approval
  → Archive and PDF
  → Dashboard, monitoring, notification, and audit
```

## Main technical risks found in the legacy model

1. Apps Script execution time limits affected large reroute operations.
2. Frontend and business logic were tightly coupled to Apps Script RPC.
3. Heavy list processing and filtering could occur outside PostgreSQL.
4. Service operations depended on Apps Script runtime availability.
5. Selective reroute needed stronger scope control and resumable batches.

## Rebuild response

- Database-side aggregation and reroute
- Cursor-based batches
- Explicit form selection
- Cloudflare edge API for privileged operations
- Supabase Auth and RLS
- Private evidence and PDF storage
- GitHub-based source control and deployment
- Responsive Executive and Manufacturing Hybrid interface
