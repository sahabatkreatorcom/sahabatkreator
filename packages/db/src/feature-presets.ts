// Preset fitur per tier — dipakai `scripts/seed.ts` sebagai titik awal paket.
//
// Bertipe `FeatureKey[]` supaya key yang salah ketik jadi error `tsc`, dan
// diuji ulang saat runtime oleh apps/server/src/lib/feature-keys.test.ts
// (seed dijalankan `bun`, jadi tanpa test ini typo lolos tanpa terdeteksi).
//
// `holiday_ideas` (ide konten hari besar) sengaja TIDAK ada di sini maupun di
// tier mana pun: itu fitur global tanpa gate, jadi tidak boleh jadi pembeda paket.

import type { FeatureKey } from "./feature-keys";

export const FREE_FEATURES: FeatureKey[] = [
  "scheduling",
  "analytics",
  "media_library",
  "onboarding_help",
];

export const PRO_FEATURES: FeatureKey[] = [
  "multi_platform",
  "scheduling",
  "story",
  "engagement_inbox",
  "ai_caption",
  "ai_coach",
  "analytics",
  "analytics_compare",
  "media_library",
  "api_access",
  "onboarding_help",
];

export const BUSINESS_FEATURES: FeatureKey[] = [
  "multi_platform",
  "scheduling",
  "story",
  "engagement_inbox",
  "ai_caption",
  "ai_coach",
  "analytics",
  "analytics_compare",
  "reports_export",
  "media_library",
  "automation",
  "team",
  "products",
  "api_access",
  "api_write",
  "onboarding_help",
];

export const ENTERPRISE_FEATURES: FeatureKey[] = [
  "multi_platform",
  "scheduling",
  "story",
  "engagement_inbox",
  "ai_caption",
  "ai_coach",
  "analytics",
  "analytics_compare",
  "reports_export",
  "media_library",
  "automation",
  "listening",
  "competitors",
  "team",
  "products",
  "api_access",
  "api_write",
  "api_webhook",
  "priority_support",
  "onboarding_help",
];
