# Feature Mapping

| Domain | Legacy behavior | Rebuild implementation |
|---|---|---|
| Authentication | Custom Apps Script session | Supabase Auth session |
| User identity | Users table | Auth identity plus users profile |
| KPI draft | Apps Script function | `save_kpi_draft_v2` RPC |
| KPI calculation | Server function | PostgreSQL trigger and calculation function |
| Submit | Apps Script orchestration | `submit_kpi_form` RPC |
| Approval route | approval_matrix lookup | Database route snapshot |
| Review | Apps Script approve or reject | `review_kpi_form` RPC |
| Approval queue | Apps Script filtered query | `get_approval_queue` RPC |
| Dashboard | Server aggregation | `dashboard_summary_v2` RPC |
| Not submitted | Apps Script monitoring | `monitoring_not_submitted` RPC |
| Archive | Data explorer | `archive_search_v2` with pagination |
| Evidence | Drive or storage adapter | Supabase private Storage |
| PDF | Apps Script PDF | Cloudflare Worker PDF generator |
| Notifications | Apps Script polling | Supabase Realtime |
| Audit | Logger and sheets | `audit_logs` |
| Health check | Script diagnostics | Worker and database health views |
| Import | Apps Script batch import | Worker controlled upsert batches |
| Reroute | Apps Script execution batches | Cursor-batched `reroute_pending_kpi_v2` |
| UI | HtmlService | Responsive React manufacturing control center |
