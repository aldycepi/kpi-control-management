# Update V2.1.1 - Import Failure Details

## Perubahan

Import Center sekarang menampilkan hasil import langsung di aplikasi:

- requested rows;
- created dan updated untuk Users;
- imported untuk master/KPI data;
- jumlah failed;
- nomor baris Excel/CSV;
- reference data seperti employee code, department code, matrix code, atau form number;
- alasan kegagalan lengkap dari validasi aplikasi atau database;
- tombol Download Failure Report dalam format CSV.

Nomor baris mengikuti file asli. Header dihitung sebagai baris 1, sehingga data pertama adalah baris 2.

## Database failure isolation

Jika bulk UPSERT ditolak oleh PostgreSQL, Worker otomatis mencoba ulang per baris. Dengan begitu aplikasi dapat menunjukkan baris yang benar-benar gagal beserta pesan database, sementara baris valid tetap diimport.

## Implementasi

Tidak ada migration Supabase baru.

1. Ganti source GitHub dengan paket V2.1.1.
2. Pastikan `wrangler.jsonc` tetap menggunakan Worker `kpi-executive-manufacturing` dan `keep_vars: true`.
3. Tunggu Cloudflare build dan deploy berhasil.
4. Refresh aplikasi menggunakan `Ctrl + Shift + R`.
5. Jalankan import kembali. Panel **Import Result** muncul di bawah preview.

## Catatan

Import menggunakan UPSERT. Setelah memperbaiki baris gagal, file yang sama aman diupload ulang. Data yang sebelumnya berhasil akan diperbarui, bukan digandakan, selama key uniknya sama.
