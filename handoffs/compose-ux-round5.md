# Handoffs - Compose UX Round 5

## Changelogs sebelumnya
- `CHANGELOG_FIXES.md` (round 1-4): server query fixes, connectToServer fix, error handling
- `AGENTS.md`: instruksi untuk opencode agent

---

## Perubahan di commit ini (11b9e9b)

### 1. Fix "Terbitkan" tombol tersimpan sebagai jadwal
**Masalah**: Tombol "Terbitkan" di desktop dan mobile memanggil `onScheduleConfirm` yang mengirim `scheduledAt` + `autoPublish: true`, sehingga post tersimpan sebagai schedule bukan publish sekarang.
**Perbaikan**:
- Desktop (`compose-client.tsx`): Ubah `onClick={onScheduleConfirm}` → `onClick={onPublishNow}` pada tombol utama
- Mobile (`compose-mobile.tsx`): Ubah `onClick={onScheduleConfirm}` → `onClick={onPublishNow}` pada tombol Terbitkan
- Mobile footer: Tambah tombol "Jadwalkan" terpisah yang membuka ScheduleModal

### 2. ScheduleModal dibuat & direrender
**Masalah**: `handleOpenScheduleModal` membuka state `isScheduleModalOpen` tapi tidak ada komponen modal yang dirender.
**Perbaikan**:
- Buat `src/components/compose/schedule-modal.tsx` — modal dengan form tanggal + waktu
- Tambah handler `handleScheduleConfirm(date, time)` di `use-compose.ts`
- Render `ScheduleModal` di `compose-client.tsx` dan `compose-mobile.tsx`

### 3. Pilar Konten & Koleksi Hashtag ditambahkan
**Masalah**: DB sudah punya tabel `content_pillar` dan `hashtag_collection` tapi tidak ada API route maupun UI untuk memilihnya saat compose.
**Perbaikan**:
- API: `POST /api/content-pillars`, `GET /api/content-pillars`, `PATCH/DELETE /api/content-pillars/[id]`
- API: `POST /api/hashtag-collections`, `GET /api/hashtag-collections`, `PATCH/DELETE /api/hashtag-collections/[id]`
- Component: `src/components/compose/content-pillar-selector.tsx` — PillarSelector + HashtagCollectionSelector
- Desktop: Tambah section "Pilar & Hashtag" di CustomizationPanel (props: pillarId, onPillarChange, hashtagCollectionIds, onHashtagCollectionChange)
- Mobile: Tambah selector di step 1 (bawah media grid)
- Orchestration: `pillarId` dikirim ke POST /api/posts di semua 3 handler (saveDraft, schedule, publishNow)
- `use-compose.ts`: Tambah state `pillarId`, `hashtagCollectionIds` + setters

### 4. Fix TypeScript errors
- `content-pillar-selector.tsx`: onChange optional, pakai `onChange?.()` pattern
- API routes: type safety untuk body parsing

### 5. Collapsible Section Pilar & Hashtag
**Perubahan UI/UX**: Section Pilar & Hashtag dibuat collapsible (bisa expand/collapse) di:
- Desktop: CustomizationPanel — section dengan toggle chevron, default expanded
- Mobile: Step 1 (bawah media grid) — section collapsible, default collapsed untuk hemat space

| | |
|---|---|
| **File** | `apps/web/src/components/compose/customization-panel.tsx`, `apps/web/src/app/dashboard/compose/compose-mobile.tsx` |
| **Masalah** | Section langsung terlihat semua waktu, memakan space |
| **Akar** | UI tidak memberi opsi untuk collapse |
| **Fix** | Tambah state `showPillarHashtag`, render conditional dengan chevron animation |
| **Verifikasi** | `pnpm --filter web build` lolos. Perlu test live di VPS. |
| **Log Keyword** | compose, pilar, hashtag, collapsible, section |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

## File baru
- `apps/web/src/components/compose/schedule-modal.tsx`
- `apps/web/src/components/compose/content-pillar-selector.tsx`
- `apps/web/src/app/api/content-pillars/route.ts`
- `apps/web/src/app/api/content-pillars/[id]/route.ts`
- `apps/web/src/app/api/hashtag-collections/route.ts`
- `apps/web/src/app/api/hashtag-collections/[id]/route.ts`

## File diubah
- `apps/web/src/hooks/use-compose.ts` — tambah pillarId, hashtagCollectionIds, handleScheduleConfirm
- `apps/web/src/hooks/use-compose-orchestration.ts` — kirim pillarId ke API
- `apps/web/src/app/dashboard/compose/compose-client.tsx` — fix Terbitkan button, render ScheduleModal, pass pillar props
- `apps/web/src/app/dashboard/compose/compose-mobile.tsx` — fix Terbitkan button, render ScheduleModal, tambah Jalakukan button, tambah pilar & hashtag selector
- `apps/web/src/components/compose/customization-panel.tsx` — tambah Pillar & Hashtag section

---

## Testing
1. Test "Terbitkan" → pastikan status post = PUBLISHED (bukan SCHEDULED)
2. Test "Simpan Draft" → pastikan status post = DRAFT
3. Test "Jadwalkan" → modal muncul, pilih tanggal/waktu, post tersimpan SCHEDULED
4. Test Pilar Konten → pilih/create pilar, post tersimpan dengan pillarId
5. Test Koleksi Hashtag → pilih/create koleksi, hashtags masuk ke caption
