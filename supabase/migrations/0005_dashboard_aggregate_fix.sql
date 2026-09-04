-- Fix PostgreSQL error: aggregate function calls cannot be nested
-- Safe to run on an existing database after migration 0002.

create or replace function public.dashboard_summary_v2(
  p_period text default null,
  p_department uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_period text := coalesce(nullif(p_period,''),to_char(now(),'YYYY-MM'));
  v_base jsonb;
begin
  v_base := public.dashboard_summary(v_period,p_department);

  return v_base || jsonb_build_object(
    'statusDistribution',coalesce((
      select jsonb_agg(
        jsonb_build_object('name',status_summary.status,'value',status_summary.total)
        order by status_summary.status
      )
      from (
        select r.status,
               count(*)::int as total
        from public.monthly_user_recap r
        where r.period_key=v_period
          and (p_department is null or r.department_id=p_department)
          and public.can_read_user_scope(r.user_id)
        group by r.status
      ) status_summary
    ),'[]'::jsonb),

    'approvalStage',coalesce((
      select jsonb_agg(
        jsonb_build_object('name',stage_summary.stage_name,'value',stage_summary.total)
        order by stage_summary.stage_name
      )
      from (
        select coalesce(f.current_stage,'FINAL') as stage_name,
               count(*)::int as total
        from public.kpi_forms f
        where f.period_key=v_period
          and f.status in ('SUBMITTED','CHECKED','VERIFIED')
          and (p_department is null or f.department_id=p_department)
          and public.can_read_user_scope(f.user_id)
        group by coalesce(f.current_stage,'FINAL')
      ) stage_summary
    ),'[]'::jsonb),

    'recentActivity',coalesce((
      select jsonb_agg(to_jsonb(activity) order by activity.created_at desc)
      from (
        select h.form_id,
               h.stage_name,
               h.action,
               h.actor_name,
               h.note,
               h.created_at,
               f.form_no,
               f.full_name,
               f.department_name
        from public.approval_history h
        join public.kpi_forms f on f.id=h.form_id
        where f.period_key=v_period
          and public.can_read_user_scope(f.user_id)
        order by h.created_at desc
        limit 12
      ) activity
    ),'[]'::jsonb)
  );
end
$$;

comment on function public.dashboard_summary_v2(text,uuid)
is 'Executive dashboard summary. Aggregations are pre-grouped to avoid nested aggregate calls.';
