# CHANGELOG_FIXES.md — Log Perbaikan & Peningkatan

<!-- entries terbaru di ATAS -->

### Fix #3 — AI Tiered Credit Costs

Tanggal: 2026-09-16 · Commit: d680ad7

| File | Masalah | Akar | Fix | Verifikasi |
|------|---------|------|-----|------------|
| `apps/server/src/lib/ai.ts` | Semua AI action = 1 kredit (flat) | Tidak ada differentiation berdasarkan kompleksitas | Tambah AI_CREDIT_COST constants: caption/hashtag/reply=1, carousel=2, coach/trends=3 | tsc clean |
| `apps/server/src/routes/ai.ts` | consumeAiCredits tanpa credits param | Caller tidak pass credits | Update 7 call sites dengan aiCreditCost(action) | tsc clean |
| `apps/server/src/routes/coach.ts` | coach_advice = 1 kredit (seharusnya 3) | Flat pricing | Pass credits: aiCreditCost(action) | tsc clean |
| `apps/server/src/routes/trends.ts` | trend_ideas = 1 kredit (seharusnya 3) | Flat pricing | Pass credits: aiCreditCost(action) | tsc clean |
| `apps/web/src/components/settings/ai-usage-history.tsx` | "Satu entri = satu kredit" (outdated) | Flat pricing assumption | Update text ke "1-3 kredit sesuai kompleksitas" | tsc clean |

**Log Keyword:** ai, credits, tiered, billing, consumeAiCredits

---

### Fix #2 — LinkedIn First Comment Personal Account Tidak Bekerja

Tanggal: 2026-09-16 · Commit: d345c5a

| File | Masalah | Akar | Fix | Verifikasi |
|------|---------|------|-----|------------|
| `packages/publishing/src/reply.ts` | First comment LinkedIn personal account gagal (post berhasil) | `object` field di request body pakai `urn:li:share:{id}` tapi Comments API butuh `urn:li:activity:{id}` | Konversi share URN → activity URN sebelum kirim | tsc clean |
| `packages/publishing/src/pipeline.ts` | Error first comment hilang tanpa jejak (catch block minimal) | Logging hanya tampilkan error message | Tambah platformPostId & platformAccountId ke error log | tsc clean |

**Pelajaran:**
- LinkedIn Comments API: `object` di body harus `urn:li:activity:{id}`, bukan `urn:li:share:{id}`
- Share URN dari Posts API response perlu dikonversi ke activity URN untuk Comments API
- Error logging yang cukup penting untuk debug integrasi platform

**Log Keyword:** linkedin, first comment, reply, urn, activity, share, comments

---

### Fix #1 — LinkedIn & LinkedIn Org: Repurpose, Analytics Detail, DM Sync

Tanggal: 2026-09-16

| File | Masalah | Akar | Fix | Verifikasi |
|------|---------|------|-----|------------|
| `apps/web/src/components/compose/repurpose-panel.tsx` | `linkedin_org` tidak ada di dropdown repurpose | REPURPOSE_PLATFORMS hanya berisi `linkedin` | Tambahkan `{ value: "linkedin_org", label: "LinkedIn (Company)" }` | tsc clean |
| `apps/server/src/routes/ai.ts` | `linkedin_org` tidak ada di repurposeSchema + REPURPOSE_GUIDE | Schema validation dan guide hanya untuk `linkedin` | Tambahkan `linkedin_org` ke enum dan REPURPOSE_GUIDE | tsc clean |
| `packages/publishing/src/analytics-sync.ts` | LinkedIn analytics hanya fetch likes/comments (socialActions), tanpa impressions/clicks/shares | `linkedinPostMetrics` hanya panggil socialActions endpoint | Enhance: panggil `organizationalEntityShareStatistics` untuk org accounts → impressions, uniqueImpressions, clicks, shares | tsc clean |
| `packages/publishing/src/analytics-sync.ts` | LinkedIn org accounts tidak fetch follower count | `fetchAccountMetrics` return `{}` untuk LinkedIn | Tambahkan `linkedinAccountMetrics` → fetch dari `/v2/entities/{orgUrn}` | tsc clean |
| `packages/publishing/src/analytics-sync.ts` | `linkedin` & `linkedin_org` tidak di-sync analytics-nya | `supported` set di `syncDueAnalyticsAccounts` tidak include LinkedIn | Tambahkan ke supported set | tsc clean |
| `packages/publishing/src/dm-sync.ts` | Tidak ada DM sync untuk LinkedIn | Hanya Meta platforms (IG/FB) yang diimplementasi | Tambahkan `syncLinkedInDMs` via `/v2/conversations` + `/v2/messages` | tsc clean |
| `packages/publishing/src/dm-sync.ts` | `sendDMReply` tidak support LinkedIn | Hanya Meta platforms | Extend untuk LinkedIn via `/v2/messages` POST | tsc clean |
| `apps/server/src/routes/dm.ts` | DM reply route tidak support LinkedIn | Type casting hanya Meta | Extend type casting + token handling | tsc clean |

**Pelajaran:**
- LinkedIn `organizationalEntityShareStatistics` butuh `organizationalEntity` (org URN) + `shares` param — tidak bisa dipanggil tanpa org context
- LinkedIn Community Management API (`linkedin_org`) tidak bisa read DMs — hanya personal app yang bisa
- LinkedIn `/v2/entities/{urn}` endpoint tersedia dengan scope `r_organization_social` untuk follower count

**Log Keyword:** linkedin, linkedin_org, repurpose, analytics, organizationalEntityShareStatistics, dm-sync, messaging
