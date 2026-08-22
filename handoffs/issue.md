7. Known Issues & Risks
🔴 High Priority
Masalah	Dampak
Stale posts FB/IG/Threads/Pinterest	Masih stuck PUBLISHING jika API timeout — akan otomatis reset oleh worker baru setelah deploy
5 migrasi DB belum di-apply	Fitur baru (multi-account, cross-share, user_tags) belum tersedia
Worker concurrency = 1	Bottleneck saat traffic tinggi (publish + sync + cleanup semua pakai concurrency 1)
Push notification VAPID	Hardcoded false, perlu konfigurasi env
🟡 Medium Priority
Masalah	Dampak
Tidak ada logging terpusat	Hanya console.log, sulit debugging di production
Tidak ada error tracking	Tidak ada Sentry/Datadog
Health check hanya DB	Tidak monitor Redis, worker status, token health
Validasi API terbatas	Beberapa endpoint tidak pakai Zod schema
No pagination	Endpoints list (posts, media) bisa lambat saat data besar
🟢 Low Priority
Masalah	Dampak
Empty catch blocks	Beberapa catch { } tidak log error
Large files	seb-advisor.ts 1182 baris, perlu split
No middleware	Auth routing masih manual per route
First comment	Hanya Instagram & Facebook, platform lain belum