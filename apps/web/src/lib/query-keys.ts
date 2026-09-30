/**
 * Registry terpusat untuk seluruh TanStack Query key.
 *
 * Mengapa: sebelum registry ini, setiap page/hook menulis literal string
 * queryKey sendiri (`["media"]` muncul di 11 file, `["video-jobs"]` di 8).
 * Akibatnya: (1) invalidasi berserakan & mudah salah ketik, (2) dua fitur
 * yang tidak sengaja memakai literal sama akan **berbagi cache** — data
 * satu fitur muncul di fitur lain, dan (3) refactor endpoint API tidak
 * tertangkap karena tidak ada satu sumber kebenaran.
 *
 * Konvensi:
 *   queryKey: queryKeys.media                        // key tanpa parameter
 *   queryKey: [...queryKeys.dmThread, conversationId] // key + arg dinamis
 *   queryClient.invalidateQueries({ queryKey: queryKeys.media })
 *
 * Root key TIDAK boleh dipakai untuk dua konsep berbeda — jika perlu argumen,
 * tambahkan argumen (spread) di pemanggil, jangan buat literal baru.
 */
export const queryKeys = {
  // ---------- Akun & organisasi ----------
  accounts: ["accounts"] as const,
  accountsPending: ["accounts-pending"] as const,
  me: ["me"] as const,
  orgMembers: ["org-members"] as const,
  orgInvitations: ["org-invitations"] as const,
  collabInvites: ["collab-invites"] as const,
  teamRoles: ["team-roles"] as const,
  teamAssignments: ["team-assignments"] as const,
  userSessions: ["user-sessions"] as const,
  threadsAccounts: ["threads-accounts"] as const,
  /** Post milik akun Threads sendiri (langsung dari Threads API) */
  threadsOwnPosts: ["threads-own-posts"] as const,
  tiktokCreatorInfo: ["tiktok-creator-info"] as const,
  bridgeStats: ["bridge-stats"] as const,

  // ---------- Konten / compose ----------
  posts: ["posts"] as const,
  postsUpcoming: ["posts-upcoming"] as const,
  postsTodayFocus: ["posts-today-focus"] as const,
  scheduledPosts: ["scheduled-posts"] as const,
  queuePosts: ["queue-posts"] as const,
  postLanding: ["post-landing"] as const,
  postResults: ["post-results"] as const,
  pillars: ["pillars"] as const,
  templates: ["templates"] as const,
  savedResponses: ["saved-responses"] as const,
  utmTemplates: ["utm-templates"] as const,
  brandVoice: ["brand-voice"] as const,
  hashtagCollections: ["hashtag-collections"] as const,
  strategyAssets: ["strategy-assets"] as const,
  optimalTimes: ["optimal-times"] as const,
  predictScore: ["predict-score"] as const,

  // ---------- Media library ----------
  media: ["media"] as const,
  mediaFolders: ["media-folders"] as const,

  // ---------- Kalender ----------
  calendarPosts: ["calendar-posts"] as const,
  calendarNotes: ["calendar-notes"] as const,
  calendarHolidays: ["calendar-holidays"] as const,
  calendarConflicts: ["calendar-conflicts"] as const,
  holidayUpcoming: ["holiday-upcoming"] as const,
  adminHolidays: ["admin-holidays"] as const,

  // ---------- Engagement / inbox ----------
  engagementInbox: ["engagement-inbox"] as const,
  dmConversations: ["dm-conversations"] as const,
  dmThread: ["dm-thread"] as const,
  dmUnreadCount: ["dm-unread-count"] as const,
  dmUnreadTotal: ["dm-unread-total"] as const,

  // ---------- Analitik & laporan ----------
  analyticsOverview: ["analytics-overview"] as const,
  analyticsTimeseries: ["analytics-timeseries"] as const,
  analyticsTopPosts: ["analytics-top-posts"] as const,
  analyticsOptimalTimes: ["analytics-optimal-times"] as const,
  analyticsOptimalTimesFocus: ["analytics-optimal-times-focus"] as const,
  analyticsHashtags: ["analytics-hashtags"] as const,
  analyticsDemographics: ["analytics-demographics"] as const,
  analyticsPinterest: ["analytics-pinterest"] as const,
  goals: ["goals"] as const,
  reportSummary: ["report-summary"] as const,
  reportSchedules: ["report-schedules"] as const,
  reportShares: ["report-shares"] as const,
  publicReport: ["public-report"] as const,

  // ---------- Intelijen / riset ----------
  listening: ["listening"] as const,
  listeningSources: ["listening-sources"] as const,
  competitors: ["competitors"] as const,
  trends: ["trends"] as const,
  trendsMusic: ["trends-music"] as const,
  trendsYoutube: ["trends-youtube"] as const,

  // ---------- AI ----------
  aiUsage: ["ai-usage"] as const,
  aiUsageHistory: ["ai-usage-history"] as const,
  coach: ["coach"] as const,
  adminAiUsage: ["admin-ai-usage"] as const,

  // ---------- SEB (AI coach proaktif) ----------
  sebOverview: ["seb-overview"] as const,
  sebRecommendations: ["seb-recommendations"] as const,
  sebExperiments: ["seb-experiments"] as const,
  sebChatSessions: ["seb-chat-sessions"] as const,
  sebChatMessages: ["seb-chat-messages"] as const,

  // ---------- Render (video / carousel / auto-clip) ----------
  videoJobs: ["video-jobs"] as const,
  videoJob: ["video-job"] as const,
  carouselJobs: ["carousel-jobs"] as const,
  carouselJob: ["carousel-job"] as const,
  autoClipJobs: ["auto-clip-jobs"] as const,
  autoClip: ["auto-clip"] as const,
  rendersManifest: ["renders-manifest"] as const,
  soundTracks: ["sound-tracks"] as const,
  sound: ["sound"] as const,
  products: ["products"] as const,

  // ---------- Automasi & webhook ----------
  automationRules: ["automation-rules"] as const,
  webhookEndpoints: ["webhook-endpoints"] as const,
  webhookDeliveries: ["webhook-deliveries"] as const,
  apiKeys: ["api-keys"] as const,
  developerApps: ["developer-apps"] as const,

  // ---------- Notifikasi / push ----------
  notifications: ["notifications"] as const,
  pushSettings: ["push-settings"] as const,
  pushSubscriptions: ["push-subscriptions"] as const,
  pushVapid: ["push-vapid"] as const,
  adminVapid: ["admin-vapid"] as const,

  // ---------- Billing ----------
  billingStatus: ["billing-status"] as const,
  billingPayments: ["billing-payments"] as const,
  plans: ["plans"] as const,
  adminPlans: ["admin-plans"] as const,
  adminPaymentConfig: ["admin-payment-config"] as const,
  adminBillingStats: ["admin-billing-stats"] as const,
  adminBillingOverview: ["admin-billing-overview"] as const,

  // ---------- Status & platform health ----------
  status: ["status"] as const,
  deletionStatus: ["deletion-status"] as const,
  impersonationStatus: ["impersonation-status"] as const,

  // ---------- Blog (marketing) ----------
  blogPosts: ["blog-posts"] as const,
  blogPost: ["blog-post"] as const,
  blogCategories: ["blog-categories"] as const,
  adminBlogPosts: ["admin-blog-posts"] as const,
  adminBlogPost: ["admin-blog-post"] as const,

  // ---------- Admin ----------
  adminUsers: ["admin-users"] as const,
  adminOrgs: ["admin-orgs"] as const,
  adminOrgActivity: ["admin-org-activity"] as const,
  adminOrgActivityOrgs: ["admin-org-activity-orgs"] as const,
  adminStats: ["admin-stats"] as const,
  adminLogs: ["admin-logs"] as const,
  adminSettings: ["admin-settings"] as const,
  adminContact: ["admin-contact"] as const,
  adminMonitoring: ["admin-monitoring"] as const,
  adminCredentials: ["admin-credentials"] as const,
  adminBridgeConfig: ["admin-bridge-config"] as const,
  adminApiReviews: ["admin-api-reviews"] as const,
  adminApiTests: ["admin-api-tests"] as const,
  adminApiQuotas: ["admin-api-quotas"] as const,
  adminWebhookLogs: ["admin-webhook-logs"] as const,

  // ---------- Lain-lain ----------
  activity: ["activity"] as const,
} satisfies Record<string, readonly [string, ...string[]]>;

export type QueryKeyRoot = keyof typeof queryKeys;
