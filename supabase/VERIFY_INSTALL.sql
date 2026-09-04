select 'roles' as object_name, count(*) as row_count from public.roles
union all select 'departments', count(*) from public.departments
union all select 'users', count(*) from public.users
union all select 'approval_matrix', count(*) from public.approval_matrix
union all select 'system_settings', count(*) from public.system_settings;

select key, value
from public.system_settings
where key in ('APP_VERSION','COMPANY_NAME','UI_THEME')
order by key;

select id, name, public
from storage.buckets
where id in ('kpi-evidence','kpi-pdf','kpi-archive')
order by id;
