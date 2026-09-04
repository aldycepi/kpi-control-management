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
