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
