// @sahabatkreator/publishing — adapter platform + pipeline publish post

export { getAdapter, supportedPlatforms } from "./adapters";
export {
  type AccountMetrics,
  type AnalyticsAccount,
  type AnalyticsSyncResult,
  fetchAccountMetrics,
  fetchPostMetrics,
  type PostMetrics,
  syncAccountAnalytics,
  syncDueAnalyticsAccounts,
  upsertAccountAnalytics,
  upsertPostAnalytics,
} from "./analytics-sync";
export {
  type AutomationInput,
  type AutomationOutcome,
  personalize,
  processAutomation,
} from "./automation";
export {
  sendDMReply,
  syncAccountDMs,
  syncDueDMAccounts,
  upsertDMConversation,
} from "./dm-sync";
export {
  type EngagementUpsert,
  type SyncContext,
  type SyncResult,
  syncAccountEngagement,
  syncDueAccounts,
  upsertEngagementItems,
} from "./engagement-sync";
export * from "./http";
export * from "./oauth";
export {
  computeOptimalTimes,
  nextOccurrence,
  type OptimalTimeSlot,
  slotLabel,
} from "./optimal-times";
export {
  claimDuePosts,
  claimPostById,
  executePublish,
  pollInFlightPosts,
  pollPost,
  publishPost,
  recoverStalePosts,
  resetToScheduled,
  runPublishCycle,
} from "./pipeline";
export {
  checkAllPlatformHealth,
  checkDbHealth,
  getPlatformHealth,
  overallStatus,
  PLATFORM_LABELS,
  type PlatformHealthRow,
  type PlatformHealthStatus,
} from "./platform-health";
export {
  POSTS_SYNC_PLATFORMS,
  type PostSyncResult,
  syncDueOrganizationsPosts,
  syncWorkspacePosts,
  type WorkspaceSyncSummary,
} from "./posts-sync";
export type { ExternalPost, FetchResult } from "./posts-sync-api";
export {
  getLatestQuota,
  parseMetaBucHeader,
  recordQuotaFromHeaders,
  recordQuotaSnapshot,
} from "./quota";
export * from "./reply";
export {
  type ReplizAccount,
  type ReplizCredentials,
  REPLIZ_PLATFORMS,
  type ReplizPlatformKey,
  type ReplizPage,
  type ReplizSchedule,
  type ReplizScheduleInput,
  type ReplizScheduleStatus,
  REPLIZ_SUPPORTED,
  replizConnectAccount,
  replizCreateSchedule,
  replizExchangeCode,
  replizGetAccount,
  replizGetFacebookPages,
  replizGetLinkedInOrganizations,
  replizGetYouTubeChannels,
  replizGetSchedule,
  replizListAccounts,
  replizRemoveAccount,
  replizRemoveSchedule,
  replizReconnectAccount,
  replizAuthorizeUrl,
  type ReplizMedia,
} from "./repliz";
export { countNeedsReconnect, refreshDueTokens, type TokenRefreshResult } from "./token-refresh";
export * from "./types";
