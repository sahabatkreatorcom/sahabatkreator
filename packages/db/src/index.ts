import { env } from "@sahabatkreator/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index";

// Connection pool eksplisit — tanpa ini drizzle membuat pool default
// tanpa batas/jeda yang jelas, yang berisiko kehabisan koneksi di beban tinggi.
// - max: batas total koneksi per proses (server & worker masing-masing punya pool sendiri)
// - idleTimeoutMillis: koneksi idle ditutup setelah 30 detik
// - connectionTimeoutMillis: gagal cepat (10 detik) jika DB tidak bisa dihubungi
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

export { decrypt, encrypt } from "./crypto";
export { type NewNotification, notifyOrganization, notifyUser } from "./notify";
export {
  ALL_PERMISSION_CODES,
  BUILT_IN_ROLE_PERMISSIONS,
  isPermissionCode,
  PERMISSION_CATEGORIES,
  PERMISSIONS,
  type PermissionCode,
} from "./permissions";
export {
  generateVapidKeys,
  isVapidConfigured,
  type PushCategory,
  type PushPayload,
  pushToOrganization,
  pushToUser,
  resetVapidCache,
} from "./push";
export {
  buildReportCsv,
  buildReportEmailHtml,
  type DueReport,
  getDueReports,
  getReportData,
  markReportSent,
  type ReportData,
} from "./report";
export {
  approveSebPendingInsights,
  chatWithSeb,
  checkSebRecommendationImpact,
  collectSebContext,
  generateDueSebReports,
  generateSebReport,
  getSebSettings,
  type ImpactResult,
  normalizeWebsiteUrl,
  // SEB — AI coach proaktif
  SEB_CATEGORIES,
  SEB_EXPERIMENT_STATUSES,
  SEB_PLATFORMS,
  SEB_PRIORITIES,
  SEB_RECOMMENDATION_STATUSES,
  type SebCategory,
  type SebChatMediaAttachment,
  type SebExperimentStatus,
  type SebPlatform,
  type SebPriority,
  type SebRecommendationStatus,
  type SebSettings,
  scanWebsiteForSebBrandKnowledge,
} from "./seb";
