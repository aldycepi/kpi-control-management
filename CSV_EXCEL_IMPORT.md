# CSV and Excel Import V2.1

Import Center mendukung `.csv`, `.xlsx`, dan `.xls` untuk:

- Users
- Departments
- Approval Matrix
- KPI Forms
- KPI Points

Template hanya meminta data bisnis yang penting. Database-owned fields dicari atau dihitung otomatis.

## Automatic resolution

```text
Users          : email, auth_user_id, audit metadata
Departments    : ID dan timestamps
Approval Matrix: department_id dari department_code
KPI Forms      : period_key, user snapshot, role, department, DRAFT status
KPI Points     : form_id dari form_no, achievement, score, form totals
```

Import bersifat UPSERT-only. Delete dilakukan melalui menu administrasi khusus.

Template KPI Points Excel menyediakan dropdown `calc_type`:

```text
HIGHER_BETTER
LOWER_BETTER
MANUAL_SCORE
```

Setiap entity memiliki template kosong dan dummy dataset 20 baris di folder `templates/`. Import order dummy:

1. Departments
2. Users
3. Approval Matrix
4. KPI Forms
5. KPI Points
