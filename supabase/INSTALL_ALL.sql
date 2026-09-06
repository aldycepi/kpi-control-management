-- PT BANSHU ELECTRIC INDONESIA
-- KPI Executive Manufacturing Control Center V2
-- Run this entire file once in a NEW Supabase project.
-- Generated from ordered migrations 0001-0006.


-- ============================================================
-- 0001_legacy_compatible_base.sql
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.roles (
  role_code text primary key check (role_code in ('STAFF','LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI','ADMIN')),
  role_name text not null,
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.roles(role_code, role_name, sort_order) values
('STAFF','Staff',10),('LEADER','Leader',20),('ASSMAN','Assistant Manager',30),('PLANT_MANAGER','Plant Manager',40),
('GENERAL_MANAGER','General Manager',50),('BOD_KI','BOD KI',60),('BOD_BEI','BOD BEI',70),('ADMIN','Administrator',90)
on conflict (role_code) do update set role_name=excluded.role_name, sort_order=excluded.sort_order, active=true;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  department_code text not null unique,
  department_name text not null,
  plant_code text,
  active boolean not null default true,
  sort_order int not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  position_code text not null unique,
  position_name text not null,
  role_code text not null references public.roles(role_code),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  employee_code text not null unique,
  username text not null unique,
  email text not null unique,
  full_name text not null,
  department_id uuid references public.departments(id),
  section text,
  position_id uuid references public.positions(id),
  position_name text,
  academic text,
  join_date date,
  role_code text not null references public.roles(role_code),
  manager_user_id uuid references public.users(id),
  active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_department_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  access_type text not null default 'RELATED' check (access_type in ('PRIMARY','RELATED','FULL')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, department_id, access_type)
);

create table if not exists public.approval_matrix (
  id uuid primary key default gen_random_uuid(),
  matrix_code text not null unique,
  department_id uuid references public.departments(id),
  section text,
  submitter_role_code text not null default '*' check (submitter_role_code in ('*','STAFF','LEADER','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI')),
  checked1_role_code text references public.roles(role_code),
  checked1_user_id uuid references public.users(id),
  approval1_role_code text references public.roles(role_code),
  approval1_user_id uuid references public.users(id),
  approval2_role_code text references public.roles(role_code),
  approval2_user_id uuid references public.users(id),
  approval3_role_code text references public.roles(role_code),
  approval3_user_id uuid references public.users(id),
  checked2_role_code text references public.roles(role_code),
  checked2_user_id uuid references public.users(id),
  approval4_role_code text references public.roles(role_code),
  approval4_user_id uuid references public.users(id),
  active boolean not null default true,
  priority int not null default 100,
  note text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kpi_forms (
  id uuid primary key default gen_random_uuid(),
  form_no text not null unique,
  period_year int not null check (period_year between 2000 and 2100),
  period_month int not null check (period_month between 1 and 12),
  period_key text not null,
  user_id uuid not null references public.users(id),
  employee_code text not null,
  full_name text not null,
  department_id uuid references public.departments(id),
  department_name text,
  section text,
  position_name text,
  role_code text not null references public.roles(role_code),
  form_title text not null,
  total_weight numeric(7,2) not null default 0,
  achievement_score numeric(7,2) not null default 0,
  final_score numeric(7,2) not null default 0,
  weighted_score numeric(7,2) not null default 0,
  due_date date,
  submitted_at timestamptz,
  checked_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','CHECKED','VERIFIED','APPROVED','REJECTED','ARCHIVED')),
  current_stage text check (current_stage is null or current_stage in ('Checked1','Approval1','Approval2','Approval3','Checked2','Approval4','FINAL','REJECTED')),
  current_stage_order int,
  current_approver_user_id uuid references public.users(id),
  current_approver_role_code text references public.roles(role_code),
  current_approver_department_id uuid references public.departments(id),
  next_stage text,
  next_approver_user_id uuid references public.users(id),
  next_approver_role_code text references public.roles(role_code),
  approval_route jsonb not null default '[]'::jsonb,
  review_note text,
  rejected_by uuid references public.users(id),
  last_action_by uuid references public.users(id),
  last_action_at timestamptz,
  archive_bucket text,
  archive_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_year, period_month, user_id)
);

create table if not exists public.kpi_points (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.kpi_forms(id) on delete cascade,
  point_no int not null,
  subject text,
  kpi_objective text not null,
  uom text,
  weight_percent numeric(7,2) not null check (weight_percent >= 0 and weight_percent <= 100),
  source_data text,
  target numeric(18,2),
  actual numeric(18,2),
  calc_type text not null check (calc_type in ('HIGHER_BETTER','LOWER_BETTER','MANUAL_SCORE')),
  manual_score numeric(7,2),
  achievement_percent numeric(7,2) not null default 0,
  score_percent numeric(7,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(form_id, point_no)
);

create table if not exists public.approval_history (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.kpi_forms(id) on delete cascade,
  period_key text not null,
  stage_name text not null,
  stage_order int not null,
  action text not null check (action in ('SUBMIT','CHECKED','APPROVED','REJECTED','REVISED','REROUTED')),
  actor_user_id uuid references public.users(id),
  actor_name text,
  actor_role_code text,
  actor_department_name text,
  note text,
  signature_token text not null default encode(gen_random_bytes(18),'hex'),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.revision_history (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.kpi_forms(id) on delete cascade,
  period_key text not null,
  revision_no int not null,
  action text not null,
  actor_user_id uuid references public.users(id),
  actor_name text,
  note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  form_id uuid references public.kpi_forms(id) on delete cascade,
  type text not null check (type in ('APPROVAL_PENDING','PROGRESS','NOT_SUBMITTED','SYSTEM','PDF_READY','MIGRATION')),
  title text not null,
  message text not null,
  read_at timestamptz,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  user_id uuid references public.users(id),
  actor_name text,
  module text not null,
  action text not null,
  entity_table text,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  result text not null default 'SUCCESS' check (result in ('SUCCESS','FAILED')),
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.kpi_forms(id) on delete cascade,
  point_id uuid references public.kpi_points(id) on delete set null,
  bucket_name text not null default 'kpi-evidence',
  object_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz not null default now(),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique(bucket_name, object_path)
);

create table if not exists public.pdf_history (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.kpi_forms(id) on delete cascade,
  bucket_name text not null default 'kpi-pdf',
  object_path text,
  file_name text,
  status text not null default 'QUEUED' check (status in ('QUEUED','GENERATING','READY','ERROR','ARCHIVED')),
  generated_by uuid references public.users(id),
  generated_at timestamptz,
  error_message text,
  signature_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_user_recap (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  period_year int not null,
  period_month int not null,
  user_id uuid not null references public.users(id) on delete cascade,
  employee_code text not null,
  full_name text not null,
  department_id uuid references public.departments(id),
  department_name text,
  role_code text not null,
  form_id uuid references public.kpi_forms(id) on delete set null,
  status text not null,
  submitted_at timestamptz,
  approved_at timestamptz,
  total_weight numeric(7,2) not null default 0,
  achievement_score numeric(7,2) not null default 0,
  final_score numeric(7,2) not null default 0,
  point_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique(period_key, user_id)
);

create table if not exists public.system_health_check (
  id uuid primary key default gen_random_uuid(),
  check_name text not null,
  status text not null check (status in ('OK','WARNING','ERROR')),
  message text not null,
  metric_value numeric(18,2),
  metadata jsonb not null default '{}'::jsonb,
  checked_by uuid references public.users(id),
  checked_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  description text,
  encrypted boolean not null default false,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

insert into public.system_settings(key, value, description) values
('APP_VERSION','17.1.1-plant-manager-full-access-sql-compat','Application version'),
('COMPANY_NAME','PT BANSHU ELECTRIC INDONESIA','Company name shown on official PDF'),
('DEFAULT_DUE_DAY','10','Monthly KPI submit deadline day'),
('PDF_SIGNATURE_COLUMNS','BOD,GENERAL_MANAGER,PLANT_MANAGER,ASSMAN,SUBMITTER','Official PDF signature columns'),
('NUMBER_FORMAT','0.00','Numeric format')
on conflict (key) do update set value=excluded.value, description=excluded.description, updated_at=now();
create index if not exists idx_users_auth_user_id on public.users(auth_user_id);
create index if not exists idx_users_department_role on public.users(department_id, role_code) where active=true;
create index if not exists idx_users_manager on public.users(manager_user_id) where active=true;
create index if not exists idx_users_username_trgm on public.users using gin(username gin_trgm_ops);
create index if not exists idx_kpi_forms_period_status on public.kpi_forms(period_key, status);
create index if not exists idx_kpi_forms_user_period on public.kpi_forms(user_id, period_year, period_month);
create index if not exists idx_kpi_forms_current_approver_user on public.kpi_forms(current_approver_user_id) where status in ('SUBMITTED','CHECKED','VERIFIED');
create index if not exists idx_kpi_forms_current_approver_role_dept on public.kpi_forms(current_approver_role_code, current_approver_department_id) where status in ('SUBMITTED','CHECKED','VERIFIED');
create index if not exists idx_kpi_forms_department_period on public.kpi_forms(department_id, period_key);
create index if not exists idx_kpi_points_form on public.kpi_points(form_id, point_no);
create index if not exists idx_approval_history_form_created on public.approval_history(form_id, created_at);
create index if not exists idx_revision_history_form_created on public.revision_history(form_id, created_at);
create index if not exists idx_notifications_user_read_created on public.notifications(user_id, read_at, created_at desc);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_module_action on public.audit_logs(module, action, created_at desc);
create index if not exists idx_evidence_form_active on public.evidence_files(form_id, active, uploaded_at desc);
create index if not exists idx_pdf_history_status_created on public.pdf_history(status, created_at);
create index if not exists idx_monthly_recap_period_dept on public.monthly_user_recap(period_key, department_id);
create index if not exists idx_approval_matrix_lookup on public.approval_matrix(department_id, submitter_role_code, active, priority);
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.current_app_user_id()
returns uuid language sql stable security definer set search_path=public as $$
  select id from public.users where auth_user_id = auth.uid() and active = true limit 1
$$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path=public as $$
  select role_code from public.users where auth_user_id = auth.uid() and active = true limit 1
$$;

create or replace function public.current_app_department_id()
returns uuid language sql stable security definer set search_path=public as $$
  select department_id from public.users where auth_user_id = auth.uid() and active = true limit 1
$$;

create or replace function public.format_period(p_year int, p_month int)
returns text language sql immutable as $$
  select p_year::text || '-' || lpad(p_month::text, 2, '0')
$$;

create or replace function public.has_department_access(p_actor uuid, p_department uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.user_department_access uda
    where uda.user_id = p_actor and uda.department_id = p_department and uda.active = true
  )
$$;

create or replace function public.can_read_user_scope(p_target_user uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_role text := public.current_app_role();
  v_actor_dept uuid := public.current_app_department_id();
  v_target record;
begin
  if v_actor is null then return false; end if;
  if v_role in ('ADMIN','PLANT_MANAGER') then return true; end if;
  if p_target_user = v_actor then return true; end if;
  select id, department_id, manager_user_id into v_target from public.users where id = p_target_user;
  if not found then return false; end if;
  if v_role = 'LEADER' then return v_target.manager_user_id = v_actor; end if;
  if v_role = 'ASSMAN' then return v_target.department_id = v_actor_dept; end if;
  if v_role = 'PLANT_MANAGER' then return true; end if;
  if v_role in ('GENERAL_MANAGER','BOD_KI','BOD_BEI') then return true; end if;
  return false;
end $$;

create or replace function public.can_read_form(p_form_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  v_form record;
begin
  select user_id into v_form from public.kpi_forms where id = p_form_id;
  if not found then return false; end if;
  return public.can_read_user_scope(v_form.user_id);
end $$;

create or replace function public.can_current_user_approve(p_form_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_role text := public.current_app_role();
  v_dept uuid := public.current_app_department_id();
  f public.kpi_forms%rowtype;
begin
  if v_actor is null then return false; end if;
  if v_role in ('ADMIN') then return true; end if;
  select * into f from public.kpi_forms where id = p_form_id;
  if not found then return false; end if;
  if f.status not in ('SUBMITTED','CHECKED','VERIFIED') then return false; end if;
  if f.current_approver_user_id is not null and f.current_approver_user_id = v_actor then return true; end if;
  if f.current_approver_role_code = v_role then
    if v_role in ('PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI') then return true; end if;
    return f.current_approver_department_id = v_dept;
  end if;
  return false;
end $$;

create or replace function public.calc_kpi_point(p_calc_type text, p_target numeric, p_actual numeric, p_manual numeric, p_weight numeric)
returns table(achievement numeric, score numeric) language plpgsql immutable as $$
declare
  v_achievement numeric := 0;
  v_score numeric := 0;
begin
  if p_calc_type = 'MANUAL_SCORE' then
    v_achievement := greatest(0, least(coalesce(p_manual,0), 100));
  elsif p_calc_type = 'LOWER_BETTER' then
    if coalesce(p_actual,0) = 0 and coalesce(p_target,0) > 0 then
      v_achievement := 100;
    elsif coalesce(p_actual,0) > 0 then
      v_achievement := (coalesce(p_target,0) / p_actual) * 100;
    else
      v_achievement := 0;
    end if;
  else
    if coalesce(p_target,0) > 0 then
      v_achievement := (coalesce(p_actual,0) / p_target) * 100;
    else
      v_achievement := 0;
    end if;
  end if;
  v_achievement := round(greatest(0, least(coalesce(v_achievement,0), 100)), 2);
  v_score := round(coalesce(p_weight,0) * v_achievement / 100, 2);
  return query select v_achievement, v_score;
end $$;

create or replace function public.before_kpi_point_write()
returns trigger language plpgsql as $$
declare
  c record;
begin
  select * into c from public.calc_kpi_point(new.calc_type, new.target, new.actual, new.manual_score, new.weight_percent);
  new.achievement_percent = c.achievement;
  new.score_percent = c.score;
  new.updated_at = now();
  return new;
end $$;

create or replace function public.recalculate_kpi_form(p_form_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_total_weight numeric;
  v_score numeric;
  v_achievement numeric;
begin
  select coalesce(round(sum(weight_percent),2),0), coalesce(round(sum(score_percent),2),0)
  into v_total_weight, v_score
  from public.kpi_points where form_id = p_form_id;
  if v_total_weight > 0 then
    v_achievement := round(v_score / v_total_weight * 100, 2);
  else
    v_achievement := 0;
  end if;
  update public.kpi_forms
  set total_weight = v_total_weight,
      achievement_score = v_achievement,
      final_score = v_achievement,
      weighted_score = v_achievement,
      updated_at = now()
  where id = p_form_id;
end $$;

create or replace function public.after_kpi_point_change()
returns trigger language plpgsql as $$
begin
  perform public.recalculate_kpi_form(coalesce(new.form_id, old.form_id));
  return coalesce(new, old);
end $$;

create or replace function public.validate_kpi_quality(p_form_id uuid)
returns text[] language plpgsql stable as $$
declare
  errors text[] := array[]::text[];
  v_count int;
  v_weight numeric;
  bad_count int;
begin
  select count(*), coalesce(round(sum(weight_percent),2),0) into v_count, v_weight from public.kpi_points where form_id = p_form_id;
  if v_count < 1 then errors := array_append(errors, 'Minimal 1 KPI Point wajib diisi.'); end if;
  if v_weight <> 100 then errors := array_append(errors, 'Total bobot harus 100.00%. Nilai saat ini ' || to_char(v_weight,'FM999990.00') || '%.'); end if;
  select count(*) into bad_count from public.kpi_points
  where form_id = p_form_id and (calc_type is null or (calc_type <> 'MANUAL_SCORE' and (target is null or actual is null)) or score_percent > 100);
  if bad_count > 0 then errors := array_append(errors, 'Target, Actual, Calc Type wajib valid dan Score tidak boleh lebih dari 100.00.'); end if;
  return errors;
end $$;

create or replace function public.resolve_stage_user(p_role text, p_user uuid, p_submitter_dept uuid)
returns jsonb language plpgsql stable as $$
declare
  u record;
begin
  if p_role is null and p_user is null then return null; end if;
  if p_user is not null then
    select id, role_code, department_id, full_name into u from public.users where id = p_user and active = true;
    if found then return jsonb_build_object('user_id', u.id, 'role_code', u.role_code, 'department_id', u.department_id, 'full_name', u.full_name); end if;
  end if;
  if p_role is not null then
    select id, role_code, department_id, full_name into u
    from public.users
    where active = true and role_code = p_role
      and (department_id = p_submitter_dept or p_role in ('PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI'))
    order by case when department_id = p_submitter_dept then 0 else 1 end, created_at
    limit 1;
    if found then return jsonb_build_object('user_id', u.id, 'role_code', u.role_code, 'department_id', coalesce(u.department_id, p_submitter_dept), 'full_name', u.full_name); end if;
    return jsonb_build_object('user_id', null, 'role_code', p_role, 'department_id', p_submitter_dept, 'full_name', null);
  end if;
  return null;
end $$;

create or replace function public.build_approval_route(p_submitter_user_id uuid)
returns jsonb language plpgsql stable as $$
declare
  submitter record;
  m public.approval_matrix%rowtype;
  route jsonb := '[]'::jsonb;
  stage jsonb;
  slot_names text[] := array['Checked1','Approval1','Approval2','Approval3','Checked2','Approval4'];
  slot_roles text[];
  slot_users uuid[];
  i int;
begin
  select u.id, u.role_code, u.department_id, u.section into submitter from public.users u where u.id = p_submitter_user_id and u.active = true;
  if not found then return route; end if;
  select * into m from public.approval_matrix
  where active = true
    and (department_id = submitter.department_id or department_id is null)
    and (submitter_role_code = submitter.role_code or submitter_role_code = '*')
    and (section is null or section = '' or lower(section) = lower(coalesce(submitter.section,'')) or section = '*')
  order by
    case when department_id = submitter.department_id then 0 else 1 end,
    case when submitter_role_code = submitter.role_code then 0 else 1 end,
    case when section = submitter.section then 0 else 1 end,
    priority asc,
    updated_at desc
  limit 1;
  if not found then return route; end if;
  slot_roles := array[m.checked1_role_code,m.approval1_role_code,m.approval2_role_code,m.approval3_role_code,m.checked2_role_code,m.approval4_role_code];
  slot_users := array[m.checked1_user_id,m.approval1_user_id,m.approval2_user_id,m.approval3_user_id,m.checked2_user_id,m.approval4_user_id];
  for i in 1..array_length(slot_names, 1) loop
    stage := public.resolve_stage_user(slot_roles[i], slot_users[i], submitter.department_id);
    if stage is not null then
      route := route || jsonb_build_array(stage || jsonb_build_object('stage', slot_names[i], 'order', i));
    end if;
  end loop;
  return route;
end $$;

create or replace function public.apply_current_approval_from_route(p_form_id uuid, p_route jsonb, p_order int)
returns void language plpgsql security definer set search_path=public as $$
declare
  cur jsonb;
  nxt jsonb;
begin
  cur := (select elem from jsonb_array_elements(p_route) elem where (elem->>'order')::int = p_order limit 1);
  nxt := (select elem from jsonb_array_elements(p_route) elem where (elem->>'order')::int > p_order order by (elem->>'order')::int limit 1);
  if cur is null then
    update public.kpi_forms
      set status='APPROVED', current_stage='FINAL', current_stage_order=null,
          current_approver_user_id=null, current_approver_role_code=null, current_approver_department_id=null,
          next_stage=null, next_approver_user_id=null, next_approver_role_code=null,
          approved_at=now(), last_action_at=now(), updated_at=now()
      where id=p_form_id;
  else
    update public.kpi_forms set
      status = case when cur->>'stage' in ('Checked1','Checked2') then 'CHECKED' else 'VERIFIED' end,
      current_stage = cur->>'stage',
      current_stage_order = (cur->>'order')::int,
      current_approver_user_id = nullif(cur->>'user_id','')::uuid,
      current_approver_role_code = nullif(cur->>'role_code',''),
      current_approver_department_id = nullif(cur->>'department_id','')::uuid,
      next_stage = nxt->>'stage',
      next_approver_user_id = nullif(nxt->>'user_id','')::uuid,
      next_approver_role_code = nullif(nxt->>'role_code',''),
      updated_at=now()
    where id=p_form_id;
  end if;
end $$;

create or replace function public.create_approval_notifications(p_form_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  f record;
  target record;
begin
  select * into f from public.kpi_forms where id = p_form_id;
  if not found or f.status not in ('SUBMITTED','CHECKED','VERIFIED') then return; end if;
  if f.current_approver_user_id is not null then
    insert into public.notifications(user_id, form_id, type, title, message, priority)
    values(f.current_approver_user_id, p_form_id, 'APPROVAL_PENDING', 'Pending Approval KPI', f.full_name || ' - ' || f.period_key || ' menunggu ' || f.current_stage, 'HIGH');
  else
    for target in select u.id from public.users u where u.active=true and u.role_code=f.current_approver_role_code
      and (u.department_id=f.current_approver_department_id or f.current_approver_role_code in ('GENERAL_MANAGER','BOD_KI','BOD_BEI')) loop
      insert into public.notifications(user_id, form_id, type, title, message, priority)
      values(target.id, p_form_id, 'APPROVAL_PENDING', 'Pending Approval KPI', f.full_name || ' - ' || f.period_key || ' menunggu ' || f.current_stage, 'HIGH');
    end loop;
  end if;
end $$;

create or replace function public.submit_kpi_form(p_form_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := public.current_app_user_id();
  f public.kpi_forms%rowtype;
  route jsonb;
  errors text[];
  first_stage jsonb;
begin
  if v_actor is null then raise exception 'User tidak valid.'; end if;
  select * into f from public.kpi_forms where id = p_form_id for update;
  if not found then raise exception 'Form KPI tidak ditemukan.'; end if;
  if f.user_id <> v_actor then raise exception 'STAFF hanya dapat submit KPI milik sendiri.'; end if;
  if f.status not in ('DRAFT','REJECTED') then raise exception 'Form hanya dapat submit dari status DRAFT atau REJECTED.'; end if;
  perform public.recalculate_kpi_form(p_form_id);
  errors := public.validate_kpi_quality(p_form_id);
  if array_length(errors,1) is not null then raise exception '%', array_to_string(errors, ' '); end if;
  route := public.build_approval_route(f.user_id);
  if jsonb_array_length(route) = 0 then raise exception 'Approval Matrix belum memiliki route aktif untuk user ini.'; end if;
  first_stage := route->0;
  update public.kpi_forms set
    status='SUBMITTED', submitted_at=now(), rejected_at=null, rejected_by=null, review_note=null,
    approval_route=route,
    current_stage=first_stage->>'stage', current_stage_order=(first_stage->>'order')::int,
    current_approver_user_id=nullif(first_stage->>'user_id','')::uuid,
    current_approver_role_code=first_stage->>'role_code',
    current_approver_department_id=nullif(first_stage->>'department_id','')::uuid,
    last_action_by=v_actor, last_action_at=now(), updated_at=now()
  where id=p_form_id;
  -- v16: submit keeps status SUBMITTED. Status CHECKED/VERIFIED is applied only after an actual approver action.
  insert into public.approval_history(form_id, period_key, stage_name, stage_order, action, actor_user_id, actor_name, actor_role_code, actor_department_name, note, snapshot)
  select p_form_id, f.period_key, 'SUBMIT', 0, 'SUBMIT', u.id, u.full_name, u.role_code, d.department_name, 'Submit KPI', jsonb_build_object('route', route)
  from public.users u left join public.departments d on d.id=u.department_id where u.id=v_actor;
  insert into public.audit_logs(user_id, actor_name, module, action, entity_table, entity_id, new_value)
  select u.id, u.full_name, 'KPI', 'SUBMIT', 'kpi_forms', p_form_id, jsonb_build_object('period', f.period_key, 'route', route) from public.users u where u.id=v_actor;
  perform public.create_approval_notifications(p_form_id);
  return jsonb_build_object('ok', true, 'message', 'KPI berhasil disubmit.', 'route', route);
end $$;

create or replace function public.review_kpi_form(p_form_id uuid, p_action text, p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := public.current_app_user_id();
  actor record;
  f public.kpi_forms%rowtype;
  route jsonb;
  next_order int;
  current_action text;
  rev_no int;
begin
  if v_actor is null then raise exception 'User tidak valid.'; end if;
  select * into actor from public.users u left join public.departments d on d.id=u.department_id where u.id=v_actor;
  select * into f from public.kpi_forms where id=p_form_id for update;
  if not found then raise exception 'Form KPI tidak ditemukan.'; end if;
  if not public.can_current_user_approve(p_form_id) then raise exception 'Form ini tidak berada pada antrean approval Anda.'; end if;
  if upper(p_action) not in ('APPROVE','REJECT') then raise exception 'Action approval tidak valid.'; end if;
  if upper(p_action) = 'REJECT' then
    select coalesce(max(revision_no),0)+1 into rev_no from public.revision_history where form_id=p_form_id;
    update public.kpi_forms set status='REJECTED', current_stage='REJECTED', current_stage_order=null,
      current_approver_user_id=null, current_approver_role_code=null, current_approver_department_id=null,
      next_stage=null, next_approver_user_id=null, next_approver_role_code=null,
      rejected_by=v_actor, rejected_at=now(), review_note=coalesce(nullif(p_note,''),'Perlu revisi'),
      last_action_by=v_actor, last_action_at=now(), updated_at=now()
    where id=p_form_id;
    insert into public.approval_history(form_id, period_key, stage_name, stage_order, action, actor_user_id, actor_name, actor_role_code, actor_department_name, note)
    values(p_form_id, f.period_key, coalesce(f.current_stage,'REJECTED'), coalesce(f.current_stage_order,0), 'REJECTED', v_actor, actor.full_name, actor.role_code, actor.department_name, p_note);
    insert into public.revision_history(form_id, period_key, revision_no, action, actor_user_id, actor_name, note, snapshot)
    values(p_form_id, f.period_key, rev_no, 'REJECTED', v_actor, actor.full_name, p_note, to_jsonb(f));
    insert into public.notifications(user_id, form_id, type, title, message, priority)
    values(f.user_id, p_form_id, 'PROGRESS', 'KPI Rejected', 'KPI ' || f.period_key || ' perlu revisi. ' || coalesce(p_note,''), 'HIGH');
    current_action := 'REJECTED';
  else
    current_action := case when f.current_stage in ('Checked1','Checked2') then 'CHECKED' else 'APPROVED' end;
    insert into public.approval_history(form_id, period_key, stage_name, stage_order, action, actor_user_id, actor_name, actor_role_code, actor_department_name, note)
    values(p_form_id, f.period_key, f.current_stage, coalesce(f.current_stage_order,0), current_action, v_actor, actor.full_name, actor.role_code, actor.department_name, p_note);
    route := f.approval_route;
    next_order := (select min((elem->>'order')::int) from jsonb_array_elements(route) elem where (elem->>'order')::int > coalesce(f.current_stage_order,0));
    if next_order is null then
      update public.kpi_forms set status='APPROVED', approved_at=now(), current_stage='FINAL', current_stage_order=null,
        current_approver_user_id=null, current_approver_role_code=null, current_approver_department_id=null,
        next_stage=null, next_approver_user_id=null, next_approver_role_code=null,
        last_action_by=v_actor, last_action_at=now(), updated_at=now()
      where id=p_form_id;
      insert into public.pdf_history(form_id, status, generated_by) values(p_form_id, 'QUEUED', v_actor);
      insert into public.notifications(user_id, form_id, type, title, message, priority)
      values(f.user_id, p_form_id, 'PROGRESS', 'KPI Approved', 'KPI ' || f.period_key || ' sudah final approved.', 'NORMAL');
    else
      perform public.apply_current_approval_from_route(p_form_id, route, next_order);
      update public.kpi_forms set last_action_by=v_actor, last_action_at=now(), updated_at=now() where id=p_form_id;
      perform public.create_approval_notifications(p_form_id);
    end if;
  end if;
  insert into public.audit_logs(user_id, actor_name, module, action, entity_table, entity_id, new_value)
  values(v_actor, actor.full_name, 'APPROVAL', current_action, 'kpi_forms', p_form_id, jsonb_build_object('note',p_note));
  return jsonb_build_object('ok', true, 'message', 'Approval berhasil diproses.', 'action', current_action);
end $$;

create or replace function public.re_route_pending_kpi(p_form_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid := public.current_app_user_id();
  actor_role text := public.current_app_role();
  f record;
  route jsonb;
  current_order int;
  counter int := 0;
begin
  if actor_role <> 'ADMIN' then raise exception 'Hanya ADMIN yang dapat menjalankan Re-route Pending KPI.'; end if;
  for f in select * from public.kpi_forms
    where status in ('SUBMITTED','CHECKED','VERIFIED') and (p_form_ids is null or id = any(p_form_ids)) loop
    route := public.build_approval_route(f.user_id);
    if jsonb_array_length(route) > 0 then
      current_order := coalesce(f.current_stage_order, 1);
      update public.kpi_forms set approval_route=route, updated_at=now(), last_action_by=actor, last_action_at=now() where id=f.id;
      perform public.apply_current_approval_from_route(f.id, route, current_order);
      insert into public.approval_history(form_id, period_key, stage_name, stage_order, action, actor_user_id, note, snapshot)
      values(f.id, f.period_key, 'REROUTE', current_order, 'REROUTED', actor, 'Re-route Pending KPI from Approval Matrix', jsonb_build_object('route',route));
      counter := counter + 1;
    end if;
  end loop;
  insert into public.audit_logs(user_id, module, action, entity_table, new_value) values(actor, 'ADMIN', 'REROUTE_PENDING_KPI', 'kpi_forms', jsonb_build_object('count',counter));
  return jsonb_build_object('ok',true,'rerouted',counter);
end $$;

create or replace function public.get_approval_queue(p_period text default null)
returns table(
  id uuid, form_no text, period_key text, full_name text, employee_code text, department_name text, section text,
  position_name text, form_title text, status text, current_stage text, submitted_at timestamptz,
  achievement_score numeric, final_score numeric, total_weight numeric
) language sql stable as $$
  select f.id, f.form_no, f.period_key, f.full_name, f.employee_code, f.department_name, f.section, f.position_name,
         f.form_title, f.status, f.current_stage, f.submitted_at, f.achievement_score, f.final_score, f.total_weight
  from public.kpi_forms f
  where f.status in ('SUBMITTED','CHECKED','VERIFIED')
    and (p_period is null or p_period = '' or f.period_key = p_period)
    and public.can_current_user_approve(f.id)
  order by f.submitted_at asc nulls last, f.updated_at asc
$$;

create or replace function public.refresh_monthly_user_recap(p_period text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  y int := split_part(p_period,'-',1)::int;
  m int := split_part(p_period,'-',2)::int;
  counter int;
begin
  insert into public.monthly_user_recap(period_key, period_year, period_month, user_id, employee_code, full_name, department_id, department_name, role_code, form_id, status, submitted_at, approved_at, total_weight, achievement_score, final_score, point_count, updated_at)
  select p_period, y, m, u.id, u.employee_code, u.full_name, u.department_id, d.department_name, u.role_code,
         f.id, coalesce(f.status,'NOT_SUBMITTED'), f.submitted_at, f.approved_at,
         coalesce(f.total_weight,0), coalesce(f.achievement_score,0), coalesce(f.final_score,0), coalesce(pc.point_count,0), now()
  from public.users u
  left join public.departments d on d.id=u.department_id
  left join public.kpi_forms f on f.user_id=u.id and f.period_key=p_period
  left join lateral (select count(*) point_count from public.kpi_points p where p.form_id=f.id) pc on true
  where u.active=true and u.role_code in ('STAFF','LEADER','ASSMAN')
  on conflict(period_key, user_id) do update set
    form_id=excluded.form_id, status=excluded.status, submitted_at=excluded.submitted_at, approved_at=excluded.approved_at,
    total_weight=excluded.total_weight, achievement_score=excluded.achievement_score, final_score=excluded.final_score,
    point_count=excluded.point_count, updated_at=now();
  get diagnostics counter = row_count;
  return jsonb_build_object('ok',true,'period',p_period,'rows',counter);
end $$;

create or replace function public.dashboard_summary(p_period text default null, p_department uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_period text := coalesce(nullif(p_period,''), to_char(now(), 'YYYY-MM'));
  result jsonb;
begin
  perform public.refresh_monthly_user_recap(v_period);
  with base as (
    select * from public.monthly_user_recap r
    where r.period_key=v_period and (p_department is null or r.department_id=p_department)
      and public.can_read_user_scope(r.user_id)
  ), dept as (
    select department_name, count(*) total_user,
           count(*) filter(where status <> 'NOT_SUBMITTED') submitted,
           count(*) filter(where status = 'APPROVED') approved,
           count(*) filter(where status in ('SUBMITTED','CHECKED','VERIFIED')) pending,
           round(avg(nullif(achievement_score,0)),2) avg_achievement,
           round(avg(nullif(final_score,0)),2) avg_final
    from base group by department_name order by department_name
  ), roletrend as (
    select role_code, count(*) total_user, count(*) filter(where status <> 'NOT_SUBMITTED') submitted,
           round(avg(nullif(final_score,0)),2) avg_final
    from base group by role_code order by role_code
  ), top_perf as (
    select full_name, department_name, final_score from base where status='APPROVED' order by final_score desc nulls last limit 10
  ), bottom_perf as (
    select full_name, department_name, final_score from base where status='APPROVED' order by final_score asc nulls last limit 10
  )
  select jsonb_build_object(
    'period', v_period,
    'totalUser', count(*),
    'submittedKpi', count(*) filter(where status <> 'NOT_SUBMITTED'),
    'notSubmittedKpi', count(*) filter(where status = 'NOT_SUBMITTED'),
    'approvedKpi', count(*) filter(where status='APPROVED'),
    'pendingKpi', count(*) filter(where status in ('SUBMITTED','CHECKED','VERIFIED')),
    'completionRate', round(case when count(*)=0 then 0 else count(*) filter(where status <> 'NOT_SUBMITTED')::numeric / count(*) * 100 end, 2),
    'averageAchievement', round(avg(nullif(achievement_score,0)),2),
    'averageFinalScore', round(avg(nullif(final_score,0)),2),
    'departmentTrend', (select coalesce(jsonb_agg(to_jsonb(dept)), '[]'::jsonb) from dept),
    'roleTrend', (select coalesce(jsonb_agg(to_jsonb(roletrend)), '[]'::jsonb) from roletrend),
    'topPerformer', (select coalesce(jsonb_agg(to_jsonb(top_perf)), '[]'::jsonb) from top_perf),
    'bottomPerformer', (select coalesce(jsonb_agg(to_jsonb(bottom_perf)), '[]'::jsonb) from bottom_perf)
  ) into result from base;
  return result;
end $$;

create or replace function public.monitoring_not_submitted(p_period text)
returns table(user_id uuid, employee_code text, full_name text, department_name text, section text, position_name text, role_code text)
language sql stable as $$
  select u.id, u.employee_code, u.full_name, d.department_name, u.section, u.position_name, u.role_code
  from public.users u left join public.departments d on d.id=u.department_id
  where u.active=true and u.role_code in ('STAFF','LEADER','ASSMAN')
    and public.can_read_user_scope(u.id)
    and not exists(select 1 from public.kpi_forms f where f.user_id=u.id and f.period_key=p_period and f.status <> 'DRAFT')
  order by d.department_name, u.full_name
$$;

create or replace function public.system_health()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid := public.current_app_user_id();
  payload jsonb;
begin
  payload := jsonb_build_object(
    'checkedAt', now(),
    'users', (select count(*) from public.users),
    'forms', (select count(*) from public.kpi_forms),
    'points', (select count(*) from public.kpi_points),
    'auditLogs', (select count(*) from public.audit_logs),
    'pendingPdf', (select count(*) from public.pdf_history where status in ('QUEUED','ERROR')),
    'status', 'OK'
  );
  insert into public.system_health_check(check_name, status, message, metadata, checked_by)
  values('SYSTEM_HEALTH','OK','Health check completed', payload, actor);
  return payload;
end $$;

create or replace function public.admin_exec_sql(p_sql text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'admin_exec_sql requires service role.';
  end if;
  execute p_sql;
  return jsonb_build_object('ok', true, 'executedAt', now());
end $$;
drop trigger if exists trg_departments_touch on public.departments;
create trigger trg_departments_touch before update on public.departments for each row execute function public.touch_updated_at();

drop trigger if exists trg_positions_touch on public.positions;
create trigger trg_positions_touch before update on public.positions for each row execute function public.touch_updated_at();

drop trigger if exists trg_users_touch on public.users;
create trigger trg_users_touch before update on public.users for each row execute function public.touch_updated_at();

drop trigger if exists trg_approval_matrix_touch on public.approval_matrix;
create trigger trg_approval_matrix_touch before update on public.approval_matrix for each row execute function public.touch_updated_at();

drop trigger if exists trg_kpi_forms_touch on public.kpi_forms;
create trigger trg_kpi_forms_touch before update on public.kpi_forms for each row execute function public.touch_updated_at();

drop trigger if exists trg_kpi_points_calc_before on public.kpi_points;
create trigger trg_kpi_points_calc_before before insert or update on public.kpi_points for each row execute function public.before_kpi_point_write();

drop trigger if exists trg_kpi_points_recalc_after on public.kpi_points;
create trigger trg_kpi_points_recalc_after after insert or update or delete on public.kpi_points for each row execute function public.after_kpi_point_change();

drop trigger if exists trg_pdf_history_touch on public.pdf_history;
create trigger trg_pdf_history_touch before update on public.pdf_history for each row execute function public.touch_updated_at();
create or replace view public.v_kpi_forms_full as
select f.*, u.username, u.email, d.department_code, d.department_name as current_department_name,
       coalesce(pc.point_count,0) point_count,
       coalesce(ev.evidence_count,0) evidence_count,
       pdf.status as latest_pdf_status,
       pdf.object_path as latest_pdf_path
from public.kpi_forms f
join public.users u on u.id=f.user_id
left join public.departments d on d.id=f.department_id
left join lateral (select count(*) point_count from public.kpi_points p where p.form_id=f.id) pc on true
left join lateral (select count(*) evidence_count from public.evidence_files e where e.form_id=f.id and e.active=true) ev on true
left join lateral (select status, object_path from public.pdf_history ph where ph.form_id=f.id order by created_at desc limit 1) pdf on true;

create or replace view public.v_global_pending_approval as
select id, form_no, period_key, full_name, employee_code, department_name, section, role_code, status,
       current_stage, current_stage_order, current_approver_user_id, current_approver_role_code, current_approver_department_id,
       submitted_at, updated_at
from public.kpi_forms
where status in ('SUBMITTED','CHECKED','VERIFIED');

create or replace view public.v_not_submitted_current_month as
select u.id user_id, u.employee_code, u.full_name, d.department_name, u.section, u.position_name, u.role_code,
       to_char(now(),'YYYY-MM') period_key
from public.users u
left join public.departments d on d.id=u.department_id
where u.active=true and u.role_code in ('STAFF','LEADER','ASSMAN')
  and not exists(select 1 from public.kpi_forms f where f.user_id=u.id and f.period_key=to_char(now(),'YYYY-MM') and f.status <> 'DRAFT');
alter table public.roles enable row level security;
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.users enable row level security;
alter table public.user_department_access enable row level security;
alter table public.approval_matrix enable row level security;
alter table public.kpi_forms enable row level security;
alter table public.kpi_points enable row level security;
alter table public.approval_history enable row level security;
alter table public.revision_history enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.evidence_files enable row level security;
alter table public.pdf_history enable row level security;
alter table public.monthly_user_recap enable row level security;
alter table public.system_health_check enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists roles_read_authenticated on public.roles;
create policy roles_read_authenticated on public.roles for select to authenticated using (true);
drop policy if exists departments_read_authenticated on public.departments;
create policy departments_read_authenticated on public.departments for select to authenticated using (true);
drop policy if exists positions_read_authenticated on public.positions;
create policy positions_read_authenticated on public.positions for select to authenticated using (true);

drop policy if exists users_read_scope on public.users;
create policy users_read_scope on public.users for select to authenticated using (public.can_read_user_scope(id));
drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users for all to authenticated using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');
drop policy if exists user_department_access_read on public.user_department_access;
create policy user_department_access_read on public.user_department_access for select to authenticated using (user_id=public.current_app_user_id() or public.current_app_role() in ('ADMIN','GENERAL_MANAGER','BOD_KI','BOD_BEI'));
drop policy if exists user_department_access_admin on public.user_department_access;
create policy user_department_access_admin on public.user_department_access for all to authenticated using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');

drop policy if exists approval_matrix_read on public.approval_matrix;
create policy approval_matrix_read on public.approval_matrix for select to authenticated using (public.current_app_role() in ('ADMIN','ASSMAN','PLANT_MANAGER','GENERAL_MANAGER','BOD_KI','BOD_BEI'));
drop policy if exists approval_matrix_admin on public.approval_matrix;
create policy approval_matrix_admin on public.approval_matrix for all to authenticated using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');

drop policy if exists kpi_forms_read_scope on public.kpi_forms;
create policy kpi_forms_read_scope on public.kpi_forms for select to authenticated using (public.can_read_user_scope(user_id) or public.can_current_user_approve(id));
drop policy if exists kpi_forms_insert_own on public.kpi_forms;
create policy kpi_forms_insert_own on public.kpi_forms for insert to authenticated with check (user_id=public.current_app_user_id());
drop policy if exists kpi_forms_update_own_draft on public.kpi_forms;
create policy kpi_forms_update_own_draft on public.kpi_forms for update to authenticated using (user_id=public.current_app_user_id() and status in ('DRAFT','REJECTED')) with check (user_id=public.current_app_user_id());
drop policy if exists kpi_forms_admin_all on public.kpi_forms;
create policy kpi_forms_admin_all on public.kpi_forms for all to authenticated using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');

drop policy if exists kpi_points_read_scope on public.kpi_points;
create policy kpi_points_read_scope on public.kpi_points for select to authenticated using (exists(select 1 from public.kpi_forms f where f.id=form_id and (public.can_read_user_scope(f.user_id) or public.can_current_user_approve(f.id))));
drop policy if exists kpi_points_insert_own on public.kpi_points;
create policy kpi_points_insert_own on public.kpi_points for insert to authenticated with check (exists(select 1 from public.kpi_forms f where f.id=form_id and f.user_id=public.current_app_user_id() and f.status in ('DRAFT','REJECTED')));
drop policy if exists kpi_points_update_own on public.kpi_points;
create policy kpi_points_update_own on public.kpi_points for update to authenticated using (exists(select 1 from public.kpi_forms f where f.id=form_id and f.user_id=public.current_app_user_id() and f.status in ('DRAFT','REJECTED'))) with check (exists(select 1 from public.kpi_forms f where f.id=form_id and f.user_id=public.current_app_user_id()));
drop policy if exists kpi_points_delete_own on public.kpi_points;
create policy kpi_points_delete_own on public.kpi_points for delete to authenticated using (exists(select 1 from public.kpi_forms f where f.id=form_id and f.user_id=public.current_app_user_id() and f.status in ('DRAFT','REJECTED')));
drop policy if exists kpi_points_admin_all on public.kpi_points;
create policy kpi_points_admin_all on public.kpi_points for all to authenticated using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');

drop policy if exists approval_history_read_scope on public.approval_history;
create policy approval_history_read_scope on public.approval_history for select to authenticated using (exists(select 1 from public.kpi_forms f where f.id=form_id and (public.can_read_user_scope(f.user_id) or public.can_current_user_approve(f.id))));
drop policy if exists revision_history_read_scope on public.revision_history;
create policy revision_history_read_scope on public.revision_history for select to authenticated using (exists(select 1 from public.kpi_forms f where f.id=form_id and public.can_read_user_scope(f.user_id)));

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (user_id=public.current_app_user_id());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (user_id=public.current_app_user_id()) with check (user_id=public.current_app_user_id());

drop policy if exists audit_logs_read_admin on public.audit_logs;
create policy audit_logs_read_admin on public.audit_logs for select to authenticated using (public.current_app_role() in ('ADMIN','GENERAL_MANAGER','BOD_KI','BOD_BEI'));
drop policy if exists audit_logs_insert_auth on public.audit_logs;
create policy audit_logs_insert_auth on public.audit_logs for insert to authenticated with check (true);

drop policy if exists evidence_read_scope on public.evidence_files;
create policy evidence_read_scope on public.evidence_files for select to authenticated using (exists(select 1 from public.kpi_forms f where f.id=form_id and (public.can_read_user_scope(f.user_id) or public.can_current_user_approve(f.id))));
drop policy if exists evidence_insert_scope on public.evidence_files;
create policy evidence_insert_scope on public.evidence_files for insert to authenticated with check (exists(select 1 from public.kpi_forms f where f.id=form_id and f.user_id=public.current_app_user_id()));
drop policy if exists pdf_read_scope on public.pdf_history;
create policy pdf_read_scope on public.pdf_history for select to authenticated using (exists(select 1 from public.kpi_forms f where f.id=form_id and (public.can_read_user_scope(f.user_id) or public.can_current_user_approve(f.id))));
drop policy if exists pdf_admin_all on public.pdf_history;
create policy pdf_admin_all on public.pdf_history for all to authenticated using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');

drop policy if exists recap_read_scope on public.monthly_user_recap;
create policy recap_read_scope on public.monthly_user_recap for select to authenticated using (public.can_read_user_scope(user_id));
drop policy if exists health_read_admin on public.system_health_check;
create policy health_read_admin on public.system_health_check for select to authenticated using (public.current_app_role() = 'ADMIN');
drop policy if exists settings_read_authenticated on public.system_settings;
create policy settings_read_authenticated on public.system_settings for select to authenticated using (true);
drop policy if exists settings_admin_all on public.system_settings;
create policy settings_admin_all on public.system_settings for all to authenticated using (public.current_app_role()='ADMIN') with check (public.current_app_role()='ADMIN');
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
('kpi-evidence','kpi-evidence',false,52428800,array['application/pdf','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
('kpi-pdf','kpi-pdf',false,52428800,array['application/pdf']),
('kpi-archive','kpi-archive',false,104857600,array['application/pdf','application/json','application/zip'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists storage_kpi_read on storage.objects;
create policy storage_kpi_read on storage.objects for select to authenticated using (
  (bucket_id = 'kpi-evidence' and exists(select 1 from public.evidence_files e where e.bucket_name=bucket_id and e.object_path=name and public.can_read_form(e.form_id)))
  or (bucket_id = 'kpi-pdf' and exists(select 1 from public.pdf_history p where p.bucket_name=bucket_id and p.object_path=name and public.can_read_form(p.form_id)))
  or (bucket_id = 'kpi-archive' and public.current_app_role() in ('ADMIN','GENERAL_MANAGER','BOD_KI','BOD_BEI'))
);

drop policy if exists storage_kpi_insert on storage.objects;
create policy storage_kpi_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('kpi-evidence','kpi-pdf','kpi-archive')
);

drop policy if exists storage_kpi_update on storage.objects;
create policy storage_kpi_update on storage.objects for update to authenticated using (
  public.current_app_role() = 'ADMIN'
) with check (
  bucket_id in ('kpi-evidence','kpi-pdf','kpi-archive') and public.current_app_role() = 'ADMIN'
);


-- ============================================================
-- 0002_cloudflare_upgrade.sql
-- ============================================================

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


-- ============================================================
-- 0003_storage.sql
-- ============================================================

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
('kpi-evidence','kpi-evidence',false,52428800,array['application/pdf','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
('kpi-pdf','kpi-pdf',false,52428800,array['application/pdf']),
('kpi-archive','kpi-archive',false,104857600,array['application/pdf','application/json','application/zip'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists storage_kpi_read on storage.objects;
create policy storage_kpi_read on storage.objects for select to authenticated using (
  (bucket_id = 'kpi-evidence' and exists(select 1 from public.evidence_files e where e.bucket_name=bucket_id and e.object_path=name and public.can_read_form(e.form_id)))
  or (bucket_id = 'kpi-pdf' and exists(select 1 from public.pdf_history p where p.bucket_name=bucket_id and p.object_path=name and public.can_read_form(p.form_id)))
  or (bucket_id = 'kpi-archive' and public.current_app_role() in ('ADMIN','GENERAL_MANAGER','BOD_KI','BOD_BEI'))
);

drop policy if exists storage_kpi_insert on storage.objects;
create policy storage_kpi_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('kpi-evidence','kpi-pdf','kpi-archive')
);

drop policy if exists storage_kpi_update on storage.objects;
create policy storage_kpi_update on storage.objects for update to authenticated using (
  public.current_app_role() = 'ADMIN'
) with check (
  bucket_id in ('kpi-evidence','kpi-pdf','kpi-archive') and public.current_app_role() = 'ADMIN'
);


-- ============================================================
-- 0004_realtime_and_storage_hardening.sql
-- ============================================================

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


-- ============================================================
-- 0005_dashboard_aggregate_fix.sql
-- ============================================================

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


-- ============================================================
-- 0006_v2_branding_runtime.sql
-- ============================================================

-- KPI Executive Manufacturing Control Center V2
-- Branding and deployment metadata only. No business data is removed.

insert into public.system_settings(key,value,description)
values
  ('APP_VERSION','2.0.0-fluent-industrial','Cloudflare + Supabase V2 application version'),
  ('COMPANY_NAME','PT BANSHU ELECTRIC INDONESIA','Company name displayed in the application and official PDF'),
  ('UI_THEME','FLUENT_EXECUTIVE_INDUSTRIAL','Apple + Linear + Fluent + Power BI + Siemens + Glassmorphism')
on conflict(key) do update
set value=excluded.value,
    description=excluded.description,
    updated_at=now();

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

-- ================================================================
-- 0008 DMS UI/UX REVISION SUPPORT - GLOBAL KPI SEARCH
-- ================================================================
create or replace function public.global_kpi_search_v1(
  p_query text,
  p_period text default null,
  p_department uuid default null,
  p_limit int default 100
)
returns table(
  id uuid, form_no text, period_key text, full_name text, employee_code text,
  department_name text, section text, form_title text, status text,
  current_stage text, final_score numeric, matched_kpi text
)
language sql security definer set search_path=public stable as $$
  with params as (
    select trim(coalesce(p_query,'')) as q,
           least(greatest(coalesce(p_limit,100),1),200) as lim
  )
  select f.id,f.form_no,f.period_key,f.full_name,f.employee_code,f.department_name,
         f.section,f.form_title,f.status,f.current_stage,f.final_score,
         (select string_agg(distinct coalesce(nullif(k.subject,''),k.kpi_objective),' · ' order by coalesce(nullif(k.subject,''),k.kpi_objective))
          from public.kpi_points k, params p2
          where k.form_id=f.id and (k.subject ilike '%'||p2.q||'%' or k.kpi_objective ilike '%'||p2.q||'%' or k.source_data ilike '%'||p2.q||'%')) matched_kpi
  from public.kpi_forms f, params p
  where p.q<>'' and public.can_read_user_scope(f.user_id)
    and (p_period is null or p_period='' or f.period_key=p_period)
    and (p_department is null or f.department_id=p_department)
    and (f.form_no ilike '%'||p.q||'%' or f.full_name ilike '%'||p.q||'%' or f.employee_code ilike '%'||p.q||'%'
      or coalesce(f.department_name,'') ilike '%'||p.q||'%' or coalesce(f.section,'') ilike '%'||p.q||'%'
      or coalesce(f.form_title,'') ilike '%'||p.q||'%' or coalesce(f.status,'') ilike '%'||p.q||'%'
      or coalesce(f.current_stage,'') ilike '%'||p.q||'%'
      or exists(select 1 from public.kpi_points k where k.form_id=f.id and (k.subject ilike '%'||p.q||'%' or k.kpi_objective ilike '%'||p.q||'%' or k.source_data ilike '%'||p.q||'%')))
  order by f.updated_at desc limit (select lim from params);
$$;
revoke execute on function public.global_kpi_search_v1(text,text,uuid,int) from public, anon;
grant execute on function public.global_kpi_search_v1(text,text,uuid,int) to authenticated;
