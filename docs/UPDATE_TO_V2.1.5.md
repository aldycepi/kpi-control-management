# Update to V2.1.5

## Fixes

### 1. Cloudflare user import subrequest limit

User import is now executed automatically in batches of 5 users per Worker invocation. A 50-user file is processed as 10 sequential requests, preventing `Too many subrequests by single Worker invocation`.

The Import Center shows progress while each batch runs. Successful batches are retained even if a later row fails.

### 2. Official PDF and Browser Print

The PDF is no longer created by stamping data into a fixed spreadsheet PDF. Both Browser Print and Official PDF now use one compact A4-landscape layout drawn from scratch and visually referenced to `FRM-HRD-030 Rev.02`:

- only actual KPI rows are rendered;
- no second page or separate signature sheet;
- no fixed blank KPI rows;
- approval journey remains on the same page;
- Known, Approved, and Prepared digital signatures remain inside the page;
- preview documents have a DRAFT/SUBMITTED watermark;
- approved PDFs are archived in Supabase Storage as before.

### 3. Correlated dummy approval data

A new Import Center entity is available:

`Demo Approval Status`

It is restricted to `DEMO-KPI-*` forms. The included dataset has 20 workflow rows:

- 12 forms fully approved through BOD BEI;
- 2 forms through Checked 1;
- 2 forms through Approval 1;
- 2 forms through Approval 3;
- 2 forms still Submitted.

## Required database update

Existing databases must run:

`supabase/migrations/0007_demo_approval_seed.sql`

New databases can run the updated `supabase/INSTALL_ALL.sql`.

## Demo import order

1. Departments
2. Users
3. Approval Matrix
4. KPI Forms
5. KPI Points
6. Demo Approval Status

## Cloudflare configuration

No new runtime secret is required. Existing Supabase variables remain unchanged.
