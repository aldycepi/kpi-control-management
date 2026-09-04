# Scoped Reroute Guide

## Masalah yang diselesaikan

Reroute lama cenderung memproses seluruh KPI pending. Dataset besar membuat eksekusi lambat dan berisiko melewati Apps Script execution limit.

## Filter yang tersedia

- Period
- Department
- Status
- Current stage
- Submitter role
- Section
- Employee code
- Form number
- Selected form IDs

## Cara kerja

1. Admin menentukan filter.
2. Preview menampilkan maksimal 500 forms.
3. Admin dapat memilih form tertentu.
4. Worker memanggil `reroute_pending_kpi_v2`.
5. Database memproses batch dengan cursor.
6. `reroute_one_form_v2` membangun route terbaru.
7. Database membaca history untuk mencari stage paling awal yang belum selesai.
8. Stage yang sudah CHECKED atau APPROVED tidak diulang.
9. Audit log menyimpan hasil tiap batch.

## Safe operating procedure

- Backup database sebelum reroute massal.
- Preview scope sebelum menekan Reroute.
- Untuk perubahan kecil, pilih form tertentu.
- Untuk perubahan matrix satu department, filter period dan department.
- Jangan mengubah matrix selama reroute berjalan.
- Periksa failed list dan audit log setelah selesai.

## Batch behavior

- Default UI batch: 100
- Database maximum batch: 500
- Selected forms diproses satu request
- Full scope memakai cursor sampai `has_more=false`
