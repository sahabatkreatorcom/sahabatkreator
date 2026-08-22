# Feature Gap Analysis: socaliseit vs sahabat-kreator
Tanggal: 2026-08-23
Sumber: E:\sahabat-kreator\sahabat-kreator-socaliseit\socaliseit\app
Target: E:\sahabat-kreator\sahabat-kreator

---

## ✅ Sudah Terimplementasi (Full)

| Fitur | Keterangan |
|-------|-----------|
| Multi-platform publishing | IG, FB, TikTok, YouTube, Pinterest, LinkedIn, Bluesky, Threads, Google Business |
| Multi-tenant org + team | Owner/Admin/Member/Viewer roles, invitations |
| Auth (email + social) | better-auth, OAuth GitHub |
| 2FA + backup codes | TOTP, email OTP |
| Media library + R2 storage | Upload, folders, search, stock media |
| Video transcoding worker | FFmpeg worker terpisah |
| Content pillars | CRUD pillars, post count |
| Competitor tracking | Sync, metrics, recent posts |
| Social listening | Keyword monitoring, sentiment |
| Inbox unified | Comments, DMs, mentions sync via webhooks |
| Engagement + reviews | Star ratings, sentiment breakdown |
| Analytics | Platform metrics, daily snapshots |
| Admin dashboard | Users, organizations, billing, health |
| PWA basic | Service worker, manifest |
| Billing (SumoPod) | Plans, webhooks |
| Seb AI assistant | Chat, recommendations, reports |
| Auto-reply automation | Keyword-based inbox replies |
| Activity log | Filtered audit trail |
| Calendar (month view) | Drag-drop, notes |

---

## ⚠️ Partial — Perlu Diselesaikan

### 1. Calendar Views
- **socaliseit**: Day, Week, Month, Timeline, Grid views
- **sahabat-kreator**: Hanya Month view
- File: `apps/web/src/app/dashboard/calendar/page.tsx`

### 2. Virality Scoring
- **socaliseit**: Heuristic scoring engine (caption length, question, CTA, video content, emoji usage)
- **sahabat-kreator**: Column `virality_score` di DB ada, tapi tidak ada UI/logika
- File DB: `packages/db/src/schema/post.ts:35`

### 3. Content Pillars Balance Chart
- **socaliseit**: Visual balance chart (pie/donut/bar) showing distribution
- **sahabat-kreator**: CRUD + summary number cards saja
- File: `apps/web/src/app/dashboard/pillars/page.tsx`

### 4. Video Transcoding Status
- **socaliseit**: UI menampilkan status transcoding (DONE/FAILED/LIMITED/SKIPPED) dengan polling
- **sahabat-kreator**: Backend sudah ada (worker + DB column), tapi UI tidak menampilkan indikator status
- File worker: `apps/worker/src/index.ts`

### 5. Impersonation Banner
- **socaliseit**: Banner visual di halaman saat admin sedang impersonate user lain
- **sahabat-kreator**: Action impersonate ada tapi tidak ada banner pengingat
- File: `apps/web/src/components/admin/users-table.tsx:71-74`

---

## ❌ Missing — Belum Ada Sama Sekali

| # | Fitur | Deskripsi |
|---|-------|-----------|
| 1 | SPA Navigation / DashboardSPAShell | Client-side routing shell untuk navigasi instan tanpa reload |
| 2 | Cross-tab sync | Sinkronisasi state antar tab browser via BroadcastChannel |
| 3 | Sentiment sparkline di engagement | Inline SVG sparkline 7-day sentiment trend |
| 4 | Collab invites di inbox | Tab Collabs dengan accept/decline invite |
| 5 | Google Trends integration | Fetch RSS feed Google Trends |
| 6 | Feature comparison page (`/compare`) | Perbandingan fitur vs Hootsuite/Buffer/VistaSocial |
| 7 | Changelog page (`/changelog`) | Riwayat versi v1.0.0–v1.4.0 |
| 8 | Cookies policy page (`/legal/cookies`) | Halaman terpisah cookies policy |
| 9 | Data deletion page (`/legal/data-deletion`) | Form permintaan hapus data |
| 10 | Media duplicate grouping | Toggle group duplicates di media library |
| 11 | Admin Seb platform knowledge management | CRUD knowledge base untuk Seb per-platform |
| 12 | Analytics export (PDF/CSV) | Ekspor laporan analytics |
| 13 | E-commerce revenue attribution | Attribution revenue dari Shopify/WooCommerce |
| 14 | Competitor sparkline on cards | Mini chart trend engagement di kartu competitor |
| 15 | Activity log CSV export | Export aktivitas ke CSV |
| 16 | Push notification badge sync | Sinkronisasi badge count antar device/tab |
| 17 | PWA cold-start splash screen | Splash screen dengan inline CSS sebelum React hydration |

---

## Catatan Penanganan

- First-run setup wizard **TIDAK** perlu diimplementasikan (sesuai instruksi user)
- Partial items di atas adalah prioritas pengerjaan
- Missing items bisa dijadwalkan untuk sesi berikutnya
