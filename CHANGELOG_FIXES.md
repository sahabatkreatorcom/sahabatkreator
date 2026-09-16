# CHANGELOG_FIXES.md — Log Perbaikan & Peningkatan

<!-- entries terbaru di ATAS -->

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
