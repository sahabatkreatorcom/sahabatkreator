// Tipe bersama komponen SEB (selaras dengan schema packages/db/src/schema/seb.ts)

export type SebRecommendation = {
  id: string;
  socialAccountId: string | null;
  reportId: string | null;
  platform: string | null;
  category: string;
  priority: string;
  status: string;
  title: string;
  advice: string;
  rationale: string | null;
  evidence: Record<string, unknown> | null;
  citations: unknown[];
  impactResult: Record<string, unknown> | null;
  impactCheckedAt: string | null;
  confidence: number | null;
  completedAt: string | null;
  createdAt: string;
};

export type SebExperiment = {
  id: string;
  reportId: string | null;
  title: string;
  hypothesis: string;
  platform: string | null;
  metric: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  baseline: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdAt: string;
};

export type SebReport = {
  id: string;
  trigger: string;
  status: string;
  title: string | null;
  summary: string | null;
  overallScore: number | null;
  scoreBreakdown: Record<string, number> | null;
  confidence: number | null;
  model: string | null;
  generatedByUserId: string | null;
  dataStartDate: string | null;
  dataEndDate: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type SebBrandKnowledge = {
  websiteUrl: string | null;
  audience: string | null;
  positioning: string | null;
  products: string | null;
  offers: string | null;
  voiceRules: string | null;
  bannedTopics: string | null;
  learnedInsights: string[];
  pendingInsights: Record<string, unknown> | null;
  websiteScanSummary: Record<string, unknown> | null;
  websiteScannedAt: string | null;
};

export type SebChatAttachment = {
  id: string;
  postId: string;
  title: string;
  caption: string | null;
  platform: string | null;
  type: string | null;
  mimeType: string | null;
  url: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  rationale: string | null;
};

export type SebChatMessage = {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  metadata: { attachments?: SebChatAttachment[] } | null;
  createdAt: string;
};

export type SebChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export const CATEGORY_LABELS: Record<string, string> = {
  content_strategy: "Strategi Konten",
  caption: "Caption",
  creative: "Kreatif",
  video: "Video",
  timing: "Waktu Posting",
  hashtag: "Hashtag",
  platform: "Platform",
  competitor: "Kompetitor",
  brand: "Brand",
};

export const RECOMMENDATION_STATUS_LABELS: Record<string, string> = {
  new: "Baru",
  in_progress: "Dikerjakan",
  done: "Selesai",
  dismissed: "Diabaikan",
};

export const EXPERIMENT_STATUS_LABELS: Record<string, string> = {
  planned: "Direncanakan",
  running: "Berjalan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
