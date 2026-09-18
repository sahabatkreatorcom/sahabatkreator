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
  type AutoReplyResult,
  processAutoReplyJob,
} from "./auto-reply";
export {
  clearAutoReplyEnqueue,
  enqueueAutoReply,
  registerAutoReplyEnqueue,
} from "./queue-hook";
export * from "./config";
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
export { type CommentModerationInput, moderateComment } from "./moderation";
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
export {
  REPLIZ_PLATFORMS,
  REPLIZ_SUPPORTED,
  type ReplizAccount,
  type ReplizCredentials,
  type ReplizMedia,
  type ReplizPage,
  type ReplizPlatformKey,
  type ReplizSchedule,
  type ReplizScheduleInput,
  type ReplizScheduleStatus,
  replizAuthorizeUrl,
  replizConnectAccount,
  replizCreateSchedule,
  replizExchangeCode,
  replizGetAccount,
  replizGetFacebookPages,
  replizGetLinkedInOrganizations,
  replizGetSchedule,
  replizGetYouTubeChannels,
  replizListAccounts,
  replizReconnectAccount,
  replizRemoveAccount,
  replizRemoveSchedule,
} from "./repliz";
export * from "./reply";
export {
  deleteThreadsPost,
  getThreadsMentions,
  getThreadsProfilePosts,
  lookupThreadsProfile,
  searchThreadsKeywords,
  searchThreadsLocations,
  type ThreadsLocation,
  type ThreadsPost,
  type ThreadsProfile,
} from "./threads-advanced";
export { countNeedsReconnect, refreshDueTokens, type TokenRefreshResult } from "./token-refresh";
export * from "./types";
