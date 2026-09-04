# User Import and Export V2.1

Menu:

```text
Admin → Import Center → Users
```

Fitur:

- Download template CSV dan Excel
- Upload CSV, `.xlsx`, atau `.xls`
- Preview dan validasi sebelum eksekusi
- Create Supabase Auth user
- Update profile dan Auth user lama
- Export CSV dan Excel dengan format ringkas
- Per-row error reporting pada browser console

Kolom import:

```text
employee_code
username
password
full_name
department_code
section
position_name
role_code
active
must_change_password
```

Field berikut tidak perlu diupload:

- `email`: dibuat otomatis dari username untuk user baru; email existing dipertahankan.
- `auth_user_id`: dibuat oleh Supabase Auth.
- `related_department_codes`: dikelola melalui User Administration.
- metadata create/update: dibuat oleh sistem.

Untuk user baru, password minimum 8 karakter. Untuk user existing, password boleh kosong agar password lama tetap digunakan.

Import bersifat UPSERT-only. Delete atau deactivate user dilakukan dari User Administration agar histori bisnis tetap terlindungi.
