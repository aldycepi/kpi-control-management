-- DMS UI/UX revision support: global executive KPI search.
-- Safe additive migration. Existing KPI data and workflow are not modified.

create or replace function public.global_kpi_search_v1(
  p_query text,
  p_period text default null,
  p_department uuid default null,
  p_limit int default 100
)
returns table(
  id uuid,
  form_no text,
  period_key text,
  full_name text,
  employee_code text,
  department_name text,
  section text,
  form_title text,
  status text,
  current_stage text,
  final_score numeric,
  matched_kpi text
)
language sql
security definer
set search_path=public
stable
as $$
  with params as (
    select trim(coalesce(p_query,'')) as q,
           least(greatest(coalesce(p_limit,100),1),200) as lim
  )
  select
    f.id, f.form_no, f.period_key, f.full_name, f.employee_code,
    f.department_name, f.section, f.form_title, f.status, f.current_stage,
    f.final_score,
    (
      select string_agg(distinct coalesce(nullif(k.subject,''), k.kpi_objective), ' · ' order by coalesce(nullif(k.subject,''), k.kpi_objective))
      from public.kpi_points k, params p2
      where k.form_id=f.id
        and (k.subject ilike '%'||p2.q||'%' or k.kpi_objective ilike '%'||p2.q||'%' or k.source_data ilike '%'||p2.q||'%')
    ) as matched_kpi
  from public.kpi_forms f, params p
  where p.q <> ''
    and public.can_read_user_scope(f.user_id)
    and (p_period is null or p_period='' or f.period_key=p_period)
    and (p_department is null or f.department_id=p_department)
    and (
      f.form_no ilike '%'||p.q||'%' or
      f.full_name ilike '%'||p.q||'%' or
      f.employee_code ilike '%'||p.q||'%' or
      coalesce(f.department_name,'') ilike '%'||p.q||'%' or
      coalesce(f.section,'') ilike '%'||p.q||'%' or
      coalesce(f.form_title,'') ilike '%'||p.q||'%' or
      coalesce(f.status,'') ilike '%'||p.q||'%' or
      coalesce(f.current_stage,'') ilike '%'||p.q||'%' or
      exists (
        select 1 from public.kpi_points k
        where k.form_id=f.id
          and (k.subject ilike '%'||p.q||'%' or k.kpi_objective ilike '%'||p.q||'%' or k.source_data ilike '%'||p.q||'%')
      )
    )
  order by f.updated_at desc
  limit (select lim from params);
$$;

revoke execute on function public.global_kpi_search_v1(text,text,uuid,int) from public, anon;
grant execute on function public.global_kpi_search_v1(text,text,uuid,int) to authenticated;

comment on function public.global_kpi_search_v1(text,text,uuid,int)
is 'RLS-scoped global KPI search for executive dashboard across form identity, employee, department, status, stage, KPI subject/objective, and source data.';
