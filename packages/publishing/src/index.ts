// @sahabatkreator/publishing — adapter platform + pipeline publish post

export { getAdapter, supportedPlatforms } from "./adapters";
export {
  chatCompletion,
  chatCompletionMultimodal,
  consumeAiCredits,
  getAiConfig,
  type AiConfig,
} from "./ai";
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
  type AutoReplyResult,
  processAutoReplyJob,
} from "./auto-reply";
export {
  type AutomationInput,
  type AutomationOutcome,
  personalize,
  processAutomation,
} from "./automation";
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
  clearAutoReplyEnqueue,
  enqueueAutoReply,
  registerAutoReplyEnqueue,
} from "./queue-hook";
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
  // Automation & template (Gold+)
  type ReplizAutomation,
  type ReplizAutomationConfig,
  type ReplizAutomationTemplate,
  type ReplizChat,
  type ReplizChatMessage,
  type ReplizCommentDoc,
  type ReplizCommentMedia,
  type ReplizCommentOwner,
  type ReplizCommentStatus,
  type ReplizContent,
  type ReplizContentStatistic,
  type ReplizCredentials,
  type ReplizLinkMetadata,
  type ReplizMedia,
  type ReplizPage,
  type ReplizPlatformKey,
  // Report eksekusi automation
  type ReplizReport,
  type ReplizReportStatus,
  type ReplizReportType,
  type ReplizSchedule,
  type ReplizScheduleInput,
  type ReplizScheduleStatus,
  // Research Threads
  type ReplizThreadsContent,
  type ReplizThreadsUser,
  // Add-on: TikTok music
  type ReplizTiktokMusic,
  type ReplizTiktokMusicDateRange,
  type ReplizTiktokMusicGenre,
  replizActiveCredentials,
  replizAuthorizeUrl,
  replizConnectAccount,
  replizCountAccounts,
  replizCreateAutomation,
  replizCreateSchedule,
  replizCreateTemplate,
  replizDeleteComment,
  replizDeleteContent,
  replizDeleteContentComment,
  replizExchangeCode,
  replizGetAccount,
  // Account stats & count
  replizGetAccountStatistic,
  replizGetComment,
  replizGetContent,
  replizGetContentStatistic,
  replizGetFacebookPages,
  replizGetLinkedInOrganizations,
  // Add-on: link metadata
  replizGetLinkMetadata,
  replizGetOneAutomation,
  // Chat detail & schedule list
  replizGetOneChat,
  replizGetOneReport,
  replizGetOneTemplate,
  replizGetSchedule,
  replizGetYouTubeChannels,
  replizLikeComment,
  replizListAccounts,
  replizListAutomations,
  replizListChatMessages,
  replizListChats,
  replizListComments,
  replizListContent,
  replizListContentComments,
  replizListReports,
  replizListSchedules,
  replizListTemplates,
  replizListThreadsUserContent,
  replizListTiktokMusic,
  replizMassDeleteSchedules,
  replizMessageComment,
  // OAuth helpers
  replizNeedsEntity,
  replizNeedsExchange,
  replizReadChat,
  replizReconnectAccount,
  replizReconnectInput,
  replizRemoveAccount,
  replizRemoveAutomation,
  replizRemoveSchedule,
  replizRemoveTemplate,
  replizReplyComment,
  replizRetryReport,
  replizRetrySchedule,
  replizSearchThreadsContent,
  replizSearchThreadsUser,
  replizSendChatMessage,
  replizUpdateAutomation,
  // Comment moderation & engagement
  replizUpdateCommentStatus,
  // Schedule management (edit / retry / mass-delete)
  replizUpdateSchedule,
  replizUpdateTemplate,
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
