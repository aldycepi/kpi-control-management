-- Executive + Manufacturing Cloudflare upgrade
-- Run after 0001_legacy_compatible_base.sql.

create extension if not exists pgcrypto;

create index if not exists idx_kpi_forms_pending_cursor
  on public.kpi_forms (coalesce(submitted_at, created_at), id)
  where status in ('SUBMITTED','CHECKED','VERIFIED');
create index if not exists idx_kpi_forms_period_status_dept
  on public.kpi_forms (period_key, status, department_id);
create index if not exists idx_kpi_forms_employee_form_no
  on public.kpi_forms (employee_code, form_no);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists idx_approval_history_form_stage_action
  on public.approval_history (form_id, stage_name, action, created_at);

create or replace function public.get_my_kpi_v2(p_period text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_form public.kpi_forms%rowtype;
  v_profile jsonb;
begin
  if v_user is null then raise exception 'User tidak valid.'; end if;

  select jsonb_build_object(
    'id',u.id,'auth_user_id',u.auth_user_id,'employee_code',u.employee_code,'username',u.username,
    'email',u.email,'full_name',u.full_name,'department_id',u.department_id,
    'department_name',d.department_name,'department_code',d.department_code,'section',u.section,
    'position_name',u.position_name,'role_code',u.role_code,'academic',u.academic,'join_date',u.join_date
  ) into v_profile
  from public.users u left join public.departments d on d.id=u.department_id
  where u.id=v_user and u.active=true;

  select * into v_form
  from public.kpi_forms
  where user_id=v_user and period_key=p_period
  limit 1;

  if not found then
    return jsonb_build_object('profile',v_profile,'form',null,'points','[]'::jsonb,'evidence','[]'::jsonb,'history','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'profile',v_profile,
    'form',to_jsonb(v_form),
    'points',coalesce((select jsonb_agg(to_jsonb(p) order by p.point_no) from public.kpi_points p where p.form_id=v_form.id),'[]'::jsonb),
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.uploaded_at desc) from public.evidence_files e where e.form_id=v_form.id and e.active=true),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.approval_history h where h.form_id=v_form.id),'[]'::jsonb)
  );
end $$;

create or replace function public.save_kpi_draft_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_user record;
  v_form_id uuid;
  v_period text := nullif(trim(p_payload->>'period_key'),'');
  v_year int;
  v_month int;
  v_status text;
  v_form_no text;
  v_point jsonb;
  v_no int := 0;
begin
  if v_user_id is null then raise exception 'User tidak valid.'; end if;
  if v_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Format periode harus YYYY-MM.'; end if;
  v_year := split_part(v_period,'-',1)::int;
  v_month := split_part(v_period,'-',2)::int;

  select u.*, d.department_name into v_user
  from public.users u left join public.departments d on d.id=u.department_id
  where u.id=v_user_id and u.active=true;
  if not found then raise exception 'Profil user aktif tidak ditemukan.'; end if;

  select id,status,form_no into v_form_id,v_status,v_form_no
  from public.kpi_forms where user_id=v_user_id and period_key=v_period for update;

  if found and v_status not in ('DRAFT','REJECTED') then
    raise exception 'Form dengan status % tidak dapat diedit.', v_status;
  end if;

  if v_form_id is null then
    v_form_no := upper(coalesce(nullif(v_user.department_name,''),'KPI')) || '-' || replace(v_period,'-','') || '-' || v_user.employee_code;
    v_form_no := regexp_replace(v_form_no,'[^A-Z0-9_-]+','-','g');
    insert into public.kpi_forms(
      form_no,period_year,period_month,period_key,user_id,employee_code,full_name,
      department_id,department_name,section,position_name,role_code,form_title,status,due_date
    ) values (
      v_form_no,v_year,v_month,v_period,v_user.id,v_user.employee_code,v_user.full_name,
      v_user.department_id,v_user.department_name,v_user.section,v_user.position_name,v_user.role_code,
      coalesce(nullif(trim(p_payload->>'form_title'),''),'KPI ' || v_period),'DRAFT',nullif(p_payload->>'due_date','')::date
    ) returning id into v_form_id;
  else
    update public.kpi_forms set
      form_title=coalesce(nullif(trim(p_payload->>'form_title'),''),form_title),
      due_date=nullif(p_payload->>'due_date','')::date,
      status='DRAFT', updated_at=now()
    where id=v_form_id;
    delete from public.kpi_points where form_id=v_form_id;
  end if;

  for v_point in select value from jsonb_array_elements(coalesce(p_payload->'points','[]'::jsonb)) loop
    v_no := v_no + 1;
    insert into public.kpi_points(
      form_id,point_no,subject,kpi_objective,uom,weight_percent,source_data,target,actual,calc_type,manual_score
    ) values (
      v_form_id,
      coalesce(nullif(v_point->>'point_no','')::int,v_no),
      nullif(trim(v_point->>'subject'),''),
      coalesce(nullif(trim(v_point->>'kpi_objective'),''),'KPI Point ' || v_no),
      nullif(trim(v_point->>'uom'),''),
      coalesce(nullif(v_point->>'weight_percent','')::numeric,0),
      nullif(trim(v_point->>'source_data'),''),
      nullif(v_point->>'target','')::numeric,
      nullif(v_point->>'actual','')::numeric,
      coalesce(nullif(upper(v_point->>'calc_type'),''),'HIGHER_BETTER'),
      nullif(v_point->>'manual_score','')::numeric
    );
  end loop;

  perform public.recalculate_kpi_form(v_form_id);
  insert into public.audit_logs(user_id,actor_name,module,action,entity_table,entity_id,new_value)
  values(v_user_id,v_user.full_name,'KPI','SAVE_DRAFT','kpi_forms',v_form_id,jsonb_build_object('period',v_period,'points',v_no));

  return jsonb_build_object('ok',true,'form_id',v_form_id,'form_no',v_form_no,'point_count',v_no);
end $$;

create or replace function public.get_form_detail_v2(p_form_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_form public.kpi_forms%rowtype;
begin
  select * into v_form from public.kpi_forms where id=p_form_id;
  if not found then raise exception 'Form KPI tidak ditemukan.'; end if;
  if not public.can_read_form(p_form_id) and not public.can_current_user_approve(p_form_id) then
    raise exception 'Anda tidak memiliki akses ke form ini.';
  end if;
  return jsonb_build_object(
    'form',to_jsonb(v_form),
    'points',coalesce((select jsonb_agg(to_jsonb(p) order by p.point_no) from public.kpi_points p where p.form_id=p_form_id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.approval_history h where h.form_id=p_form_id),'[]'::jsonb),
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.uploaded_at desc) from public.evidence_files e where e.form_id=p_form_id and e.active=true),'[]'::jsonb),
    'pdf',coalesce((select jsonb_agg(to_jsonb(ph) order by ph.created_at desc) from public.pdf_history ph where ph.form_id=p_form_id),'[]'::jsonb)
  );
end $$;

create or replace function public.dashboard_summary_v2(p_period text default null, p_department uuid default null)
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
      select jsonb_agg(jsonb_build_object('name',s.status,'value',s.total) order by s.status)
      from (
        select status,count(*) total
        from public.monthly_user_recap r
        where r.period_key=v_period
          and (p_department is null or r.department_id=p_department)
          and public.can_read_user_scope(r.user_id)
        group by status
      ) s
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
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select h.form_id,h.stage_name,h.action,h.actor_name,h.note,h.created_at,f.form_no,f.full_name,f.department_name
        from public.approval_history h join public.kpi_forms f on f.id=h.form_id
        where f.period_key=v_period and public.can_read_user_scope(f.user_id)
        order by h.created_at desc limit 12
      ) x
    ),'[]'::jsonb)
  );
end $$;

create or replace function public.archive_search_v2(
  p_period text default null,
  p_status text default null,
  p_department uuid default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit,50),1),200);
  v_offset int := greatest(coalesce(p_offset,0),0);
begin
  return jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select f.id,f.form_no,f.period_key,f.full_name,f.employee_code,f.department_name,f.section,
               f.position_name,f.role_code,f.form_title,f.status,f.current_stage,f.total_weight,
               f.achievement_score,f.final_score,f.submitted_at,f.approved_at,f.updated_at
        from public.kpi_forms f
        where public.can_read_user_scope(f.user_id)
          and (p_period is null or p_period='' or f.period_key=p_period)
          and (p_status is null or p_status='' or f.status=upper(p_status))
          and (p_department is null or f.department_id=p_department)
          and (p_search is null or p_search='' or
               f.form_no ilike '%'||p_search||'%' or f.full_name ilike '%'||p_search||'%' or
               f.employee_code ilike '%'||p_search||'%' or f.department_name ilike '%'||p_search||'%')
        order by f.updated_at desc limit v_limit offset v_offset
      ) x
    ),'[]'::jsonb),
    'total',(
      select count(*) from public.kpi_forms f
      where public.can_read_user_scope(f.user_id)
        and (p_period is null or p_period='' or f.period_key=p_period)
        and (p_status is null or p_status='' or f.status=upper(p_status))
        and (p_department is null or f.department_id=p_department)
        and (p_search is null or p_search='' or
             f.form_no ilike '%'||p_search||'%' or f.full_name ilike '%'||p_search||'%' or
             f.employee_code ilike '%'||p_search||'%' or f.department_name ilike '%'||p_search||'%')
    ),
    'limit',v_limit,'offset',v_offset
  );
end $$;

create or replace function public.mark_all_notifications_read_v2()
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_count int;
begin
  update public.notifications set read_at=now() where user_id=v_user and read_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.reroute_one_form_v2(p_form_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  f public.kpi_forms%rowtype;
  v_route jsonb;
  v_next jsonb;
  v_stage text;
  v_order int;
begin
  select * into f from public.kpi_forms where id=p_form_id for update;
  if not found then return jsonb_build_object('ok',false,'message','Form tidak ditemukan.'); end if;
  if f.status not in ('SUBMITTED','CHECKED','VERIFIED') then
    return jsonb_build_object('ok',false,'message','Status form bukan pending approval.');
  end if;

  v_route := public.build_approval_route(f.user_id);
  if jsonb_array_length(v_route)=0 then
    return jsonb_build_object('ok',false,'message','Approval Matrix aktif tidak ditemukan.');
  end if;

  select elem into v_next
  from jsonb_array_elements(v_route) elem
  where not exists (
    select 1 from public.approval_history h
    where h.form_id=f.id and h.stage_name=elem->>'stage' and h.action in ('CHECKED','APPROVED')
  )
  order by (elem->>'order')::int
  limit 1;

  update public.kpi_forms set approval_route=v_route,last_action_by=p_actor,last_action_at=now(),updated_at=now()
  where id=f.id;

  if v_next is null then
    perform public.apply_current_approval_from_route(f.id,v_route,99);
    v_stage := 'FINAL'; v_order := 99;
  else
    v_stage := v_next->>'stage'; v_order := (v_next->>'order')::int;
    perform public.apply_current_approval_from_route(f.id,v_route,v_order);
  end if;

  insert into public.approval_history(form_id,period_key,stage_name,stage_order,action,actor_user_id,note,snapshot)
  values(f.id,f.period_key,v_stage,v_order,'REROUTED',p_actor,'Scoped reroute via Cloudflare Control Center',jsonb_build_object('route',v_route));

  return jsonb_build_object('ok',true,'form_id',f.id,'form_no',f.form_no,'stage',v_stage,'route',v_route);
exception when others then
  return jsonb_build_object('ok',false,'form_id',p_form_id,'message',sqlerrm);
end $$;

create or replace function public.reroute_pending_kpi_v2(
  p_filters jsonb default '{}'::jsonb,
  p_cursor jsonb default null,
  p_batch_size int default 100
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_role text := public.current_app_role();
  v_batch int := least(greatest(coalesce(p_batch_size,100),1),500);
  v_cursor_ts timestamptz := nullif(p_cursor->>'ts','')::timestamptz;
  v_cursor_id uuid := nullif(p_cursor->>'id','')::uuid;
  r record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
  v_processed int := 0;
  v_updated int := 0;
  v_last_ts timestamptz;
  v_last_id uuid;
  v_ids uuid[];
begin
  if v_role <> 'ADMIN' then raise exception 'Hanya ADMIN yang dapat menjalankan reroute.'; end if;

  if jsonb_typeof(p_filters->'form_ids')='array' then
    select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(p_filters->'form_ids');
  end if;

  for r in
    select f.*
    from public.kpi_forms f
    where f.status in ('SUBMITTED','CHECKED','VERIFIED')
      and (v_ids is null or f.id=any(v_ids))
      and (coalesce(p_filters->>'period_key','')='' or f.period_key=p_filters->>'period_key')
      and (coalesce(p_filters->>'department_id','')='' or f.department_id=(p_filters->>'department_id')::uuid)
      and (coalesce(p_filters->>'status','')='' or f.status=upper(p_filters->>'status'))
      and (coalesce(p_filters->>'current_stage','')='' or f.current_stage=p_filters->>'current_stage')
      and (coalesce(p_filters->>'role_code','')='' or f.role_code=upper(p_filters->>'role_code'))
      and (coalesce(p_filters->>'section','')='' or lower(coalesce(f.section,''))=lower(p_filters->>'section'))
      and (coalesce(p_filters->>'employee_code','')='' or f.employee_code=p_filters->>'employee_code')
      and (coalesce(p_filters->>'form_no','')='' or f.form_no=p_filters->>'form_no')
      and (
        v_cursor_ts is null or
        (coalesce(f.submitted_at,f.created_at),f.id) > (v_cursor_ts,v_cursor_id)
      )
    order by coalesce(f.submitted_at,f.created_at),f.id
    limit v_batch
  loop
    v_processed := v_processed+1;
    v_last_ts := coalesce(r.submitted_at,r.created_at); v_last_id := r.id;
    v_result := public.reroute_one_form_v2(r.id,v_actor);
    if coalesce((v_result->>'ok')::boolean,false) then
      v_updated := v_updated+1;
      v_results := v_results || jsonb_build_array(v_result);
    else
      v_failed := v_failed || jsonb_build_array(v_result);
    end if;
  end loop;

  insert into public.audit_logs(user_id,module,action,entity_table,new_value)
  values(v_actor,'ADMIN','REROUTE_PENDING_KPI_V2','kpi_forms',jsonb_build_object(
    'filters',p_filters,'processed',v_processed,'updated',v_updated,'failed',jsonb_array_length(v_failed)
  ));

  return jsonb_build_object(
    'ok',true,'processed',v_processed,'updated',v_updated,'failed',v_failed,'items',v_results,
    'has_more',v_processed=v_batch,
    'next_cursor',case when v_last_id is null then null else jsonb_build_object('ts',v_last_ts,'id',v_last_id) end
  );
end $$;

grant execute on function public.get_my_kpi_v2(text) to authenticated;
grant execute on function public.save_kpi_draft_v2(jsonb) to authenticated;
grant execute on function public.get_form_detail_v2(uuid) to authenticated;
grant execute on function public.dashboard_summary_v2(text,uuid) to authenticated;
grant execute on function public.archive_search_v2(text,text,uuid,text,int,int) to authenticated;
grant execute on function public.mark_all_notifications_read_v2() to authenticated;
grant execute on function public.reroute_pending_kpi_v2(jsonb,jsonb,int) to authenticated;
