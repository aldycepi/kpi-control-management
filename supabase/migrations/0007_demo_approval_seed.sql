-- V2.1.5 - Controlled demo workflow seeding.
-- Only ADMIN users may call this function and only forms prefixed DEMO-KPI- are accepted.

create or replace function public.seed_demo_approval_states_v1(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_role text := public.current_app_role();
  v_item jsonb;
  v_form public.kpi_forms%rowtype;
  v_route jsonb;
  v_stage jsonb;
  v_submitter record;
  v_stage_actor record;
  v_target text;
  v_processed_order int;
  v_next_order int;
  v_imported int := 0;
  v_failed jsonb := '[]'::jsonb;
  v_row int := 1;
  v_base_time timestamptz;
begin
  if v_actor is null or v_role <> 'ADMIN' then
    raise exception 'Hanya ADMIN yang dapat memuat status approval dummy.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Payload demo approval harus berupa array.';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_row := v_row + 1;
    begin
      v_target := upper(trim(coalesce(v_item->>'approval_state', '')));
      v_processed_order := case v_target
        when 'SUBMITTED' then 0
        when 'CHECKED1' then 1
        when 'APPROVAL1' then 2
        when 'APPROVAL2' then 3
        when 'APPROVAL3' then 4
        when 'CHECKED2' then 5
        when 'APPROVAL4' then 6
        when 'APPROVED' then 6
        when 'APPROVED_BOD_BEI' then 6
        else -1
      end;
      if v_processed_order < 0 then
        raise exception 'approval_state % tidak valid.', coalesce(v_item->>'approval_state', '(kosong)');
      end if;

      select * into v_form
      from public.kpi_forms
      where upper(form_no) = upper(trim(v_item->>'form_no'))
      limit 1;
      if not found then raise exception 'Form % tidak ditemukan.', coalesce(v_item->>'form_no', '(kosong)'); end if;
      if v_form.form_no not like 'DEMO-KPI-%' then
        raise exception 'Hanya form DEMO-KPI-* yang boleh diberi status dummy.';
      end if;

      perform public.recalculate_kpi_form(v_form.id);
      v_route := public.build_approval_route(v_form.user_id);
      if jsonb_array_length(v_route) < 6 then
        raise exception 'Approval route form % belum lengkap 6 tahap.', v_form.form_no;
      end if;

      select u.id, u.full_name, u.role_code, d.department_name
      into v_submitter
      from public.users u
      left join public.departments d on d.id=u.department_id
      where u.id=v_form.user_id;
      if not found then raise exception 'Submitter form % tidak ditemukan.', v_form.form_no; end if;

      delete from public.approval_history where form_id=v_form.id;
      delete from public.revision_history where form_id=v_form.id;
      delete from public.notifications where form_id=v_form.id;
      delete from public.pdf_history where form_id=v_form.id and status='QUEUED';

      v_base_time := now() - interval '2 days';
      update public.kpi_forms set
        status='SUBMITTED', submitted_at=v_base_time, checked_at=null, approved_at=null,
        rejected_at=null, rejected_by=null, review_note=null,
        approval_route=v_route, last_action_by=v_form.user_id, last_action_at=v_base_time,
        updated_at=now()
      where id=v_form.id;

      insert into public.approval_history(
        form_id, period_key, stage_name, stage_order, action,
        actor_user_id, actor_name, actor_role_code, actor_department_name,
        note, snapshot, created_at
      ) values (
        v_form.id, v_form.period_key, 'SUBMIT', 0, 'SUBMIT',
        v_submitter.id, v_submitter.full_name, v_submitter.role_code, v_submitter.department_name,
        'Dummy workflow submit', jsonb_build_object('route',v_route,'source','demo_seed'), v_base_time
      );

      if v_processed_order > 0 then
        for v_stage in
          select elem from jsonb_array_elements(v_route) elem
          where (elem->>'order')::int <= v_processed_order
          order by (elem->>'order')::int
        loop
          select u.id, u.full_name, u.role_code, d.department_name
          into v_stage_actor
          from public.users u
          left join public.departments d on d.id=u.department_id
          where u.id=nullif(v_stage->>'user_id','')::uuid
          limit 1;
          if not found then
            raise exception 'Approver role % untuk stage % belum memiliki user aktif.', v_stage->>'role_code', v_stage->>'stage';
          end if;

          insert into public.approval_history(
            form_id, period_key, stage_name, stage_order, action,
            actor_user_id, actor_name, actor_role_code, actor_department_name,
            note, snapshot, created_at
          ) values (
            v_form.id, v_form.period_key, v_stage->>'stage', (v_stage->>'order')::int,
            case when v_stage->>'stage' in ('Checked1','Checked2') then 'CHECKED' else 'APPROVED' end,
            v_stage_actor.id, v_stage_actor.full_name, v_stage_actor.role_code, v_stage_actor.department_name,
            'Dummy approval completed', jsonb_build_object('source','demo_seed'),
            v_base_time + make_interval(hours => (v_stage->>'order')::int * 3)
          );
        end loop;
      end if;

      if v_processed_order >= 6 then
        update public.kpi_forms set
          status='APPROVED', approved_at=v_base_time + interval '18 hours',
          current_stage='FINAL', current_stage_order=null,
          current_approver_user_id=null, current_approver_role_code=null, current_approver_department_id=null,
          next_stage=null, next_approver_user_id=null, next_approver_role_code=null,
          last_action_at=v_base_time + interval '18 hours', updated_at=now()
        where id=v_form.id;
      elsif v_processed_order = 0 then
        v_stage := v_route->0;
        update public.kpi_forms set
          status='SUBMITTED', current_stage=v_stage->>'stage', current_stage_order=(v_stage->>'order')::int,
          current_approver_user_id=nullif(v_stage->>'user_id','')::uuid,
          current_approver_role_code=nullif(v_stage->>'role_code',''),
          current_approver_department_id=nullif(v_stage->>'department_id','')::uuid,
          next_stage=(v_route->1)->>'stage',
          next_approver_user_id=nullif((v_route->1)->>'user_id','')::uuid,
          next_approver_role_code=nullif((v_route->1)->>'role_code',''),
          updated_at=now()
        where id=v_form.id;
      else
        v_next_order := v_processed_order + 1;
        perform public.apply_current_approval_from_route(v_form.id, v_route, v_next_order);
        update public.kpi_forms set
          submitted_at=v_base_time,
          checked_at=case when v_processed_order >= 1 then v_base_time + interval '3 hours' else null end,
          last_action_at=v_base_time + make_interval(hours => v_processed_order * 3),
          updated_at=now()
        where id=v_form.id;
      end if;

      v_imported := v_imported + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object(
        'row', v_row,
        'identifier', coalesce(v_item->>'form_no','-'),
        'message', sqlerrm
      ));
    end;
  end loop;

  insert into public.audit_logs(user_id, actor_name, module, action, entity_table, new_value)
  select v_actor, u.full_name, 'ADMIN', 'SEED_DEMO_APPROVALS', 'kpi_forms',
    jsonb_build_object('requested',jsonb_array_length(p_rows),'imported',v_imported,'failed',jsonb_array_length(v_failed))
  from public.users u where u.id=v_actor;

  return jsonb_build_object(
    'ok', true,
    'imported', v_imported,
    'failed', v_failed
  );
end $$;

grant execute on function public.seed_demo_approval_states_v1(jsonb) to authenticated;
