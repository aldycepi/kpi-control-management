-- Realtime notification feed and stricter object upload policies.

create or replace function public.set_evidence_uploaded_by()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.uploaded_by is null then
    new.uploaded_by := public.current_app_user_id();
  end if;
  return new;
end $$;

drop trigger if exists trg_evidence_uploaded_by on public.evidence_files;
create trigger trg_evidence_uploaded_by
before insert on public.evidence_files
for each row execute function public.set_evidence_uploaded_by();

drop policy if exists storage_kpi_insert on storage.objects;
create policy storage_kpi_insert on storage.objects
for insert to authenticated
with check (
  case
    when bucket_id = 'kpi-evidence'
      and name ~ '^[0-9]{4}-(0[1-9]|1[0-2])/[0-9a-fA-F-]{36}/'
    then exists (
      select 1
      from public.kpi_forms f
      where f.id = ((storage.foldername(name))[2])::uuid
        and f.user_id = public.current_app_user_id()
        and f.status in ('DRAFT','REJECTED','SUBMITTED','CHECKED','VERIFIED','APPROVED')
    )
    when bucket_id in ('kpi-pdf','kpi-archive')
    then public.current_app_role() = 'ADMIN'
    else false
  end
);

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

-- Restrict callable database APIs to authenticated sessions.
revoke execute on function public.current_app_user_id() from public, anon;
revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.current_app_department_id() from public, anon;
revoke execute on function public.submit_kpi_form(uuid) from public, anon;
revoke execute on function public.review_kpi_form(uuid,text,text) from public, anon;
revoke execute on function public.re_route_pending_kpi(uuid[]) from public, anon;
revoke execute on function public.get_approval_queue(text) from public, anon;
revoke execute on function public.dashboard_summary(text,uuid) from public, anon;
revoke execute on function public.monitoring_not_submitted(text) from public, anon;
revoke execute on function public.system_health() from public, anon;
revoke execute on function public.admin_exec_sql(text) from public, anon;
revoke execute on function public.get_my_kpi_v2(text) from public, anon;
revoke execute on function public.save_kpi_draft_v2(jsonb) from public, anon;
revoke execute on function public.get_form_detail_v2(uuid) from public, anon;
revoke execute on function public.dashboard_summary_v2(text,uuid) from public, anon;
revoke execute on function public.archive_search_v2(text,text,uuid,text,int,int) from public, anon;
revoke execute on function public.mark_all_notifications_read_v2() from public, anon;
revoke execute on function public.reroute_pending_kpi_v2(jsonb,jsonb,int) from public, anon;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_app_department_id() to authenticated;
grant execute on function public.submit_kpi_form(uuid) to authenticated;
grant execute on function public.review_kpi_form(uuid,text,text) to authenticated;
grant execute on function public.get_approval_queue(text) to authenticated;
grant execute on function public.dashboard_summary(text,uuid) to authenticated;
grant execute on function public.monitoring_not_submitted(text) to authenticated;
grant execute on function public.get_my_kpi_v2(text) to authenticated;
grant execute on function public.save_kpi_draft_v2(jsonb) to authenticated;
grant execute on function public.get_form_detail_v2(uuid) to authenticated;
grant execute on function public.dashboard_summary_v2(text,uuid) to authenticated;
grant execute on function public.archive_search_v2(text,text,uuid,text,int,int) to authenticated;
grant execute on function public.mark_all_notifications_read_v2() to authenticated;
grant execute on function public.reroute_pending_kpi_v2(jsonb,jsonb,int) to authenticated;
grant execute on function public.admin_exec_sql(text) to service_role;

insert into public.system_settings(key,value,description)
values ('APP_VERSION','1.0.0-cloudflare-executive-manufacturing','Cloudflare rebuild application version')
on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=now();
