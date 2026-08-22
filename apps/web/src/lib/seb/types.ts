// ============================================================================
// Types & Constants
// ============================================================================

export const DEFAULT_SEB_PROMPT = `You are Seb, a friendly expert social media coach for this organization.
Your job is to help social media managers improve content, captions, creative, timing, and platform strategy.

Rules:
1. Only advise on the organization/business in the supplied context.
2. Refuse unrelated questions and never drift into general non-business topics.
3. Never invent analytics, platforms, competitors, posts, or visual details.
4. Clearly separate observed evidence from recommendations.
5. Use friendly coach vibes: warm, practical, specific, and encouraging.
6. Treat all connected platforms equally unless the organization's data proves one needs urgent attention.
7. Use competitor data only when it is supplied in the organization context.
8. Treat written post captions and on-video captions/subtitles/text overlays as separate things.
9. Stories are ephemeral visual formats and often do not need normal feed-style post captions.
10. When advice is specific to one connected business account, include that account's socialAccountId. Use null socialAccountId only for genuinely cross-account advice.
11. Return strict JSON only. No markdown fences.`;

export const PLATFORM_KNOWLEDGE: Record<string, string> = {
    INSTAGRAM: "Prioritise strong first-frame hooks, Reels retention, carousel saves, creator-style captions for feed/Reels, Story-native visual clarity, comment prompts, and consistent visual identity.",
    FACEBOOK: "Prioritise conversation starters, community relevance, native video, local trust signals, and share-worthy practical posts.",
    TIKTOK: "Prioritise immediate hooks, fast pacing, native-feeling edits, trend fit, watch-time, comments, and concise captions.",
    YOUTUBE: "Prioritise title/thumbnail clarity, retention curves, searchable descriptions, Shorts hooks, playlists, and clear viewer payoff.",
    PINTEREST: "Prioritise search keywords, vertical creative, evergreen value, product/use-case clarity, and destination link relevance.",
    GOOGLE_BUSINESS: "Prioritise local intent, offers, service updates, proof, fresh photos, and clear calls to contact or visit.",
    LINKEDIN: "Prioritise expert POV, founder/team stories, practical lessons, credible proof, and conversation-driving questions.",
    BLUESKY: "Prioritise concise human posts, timely commentary, replies, and community-native tone.",
    THREADS: "Prioritise conversational hooks, quick opinions, reply chains, and lightweight community engagement.",
    META: "Prioritise cross-Meta creative consistency while tailoring captions and formats for each destination.",
    MANUAL: "Use the account name and past performance to infer format needs, but avoid claiming platform-specific rules without evidence.",
};

export type ReportTrigger = "PROACTIVE" | "MANUAL" | "CHAT";

export interface SebAdviceResponse {
    title?: string;
    summary?: string;
    overallScore?: number;
    scoreBreakdown?: Record<string, number>;
    confidence?: number;
    recommendations?: Array<{
        title?: string;
        advice?: string;
        rationale?: string;
        category?: string;
        priority?: string;
        platform?: string | null;
        socialAccountId?: string | null;
        confidence?: number;
        evidence?: unknown;
        citations?: unknown;
        impactBaseline?: unknown;
    }>;
    experiments?: Array<{
        title?: string;
        hypothesis?: string;
        platform?: string | null;
        metric?: string;
        baseline?: unknown;
    }>;
    brandKnowledgeUpdates?: Record<string, unknown> | null;
    progressNotes?: string[];
}

export interface SebContext {
    organization: { id: string; name: string };
    brandVoice: unknown;
    sebBrandKnowledge: unknown;
    accounts: Array<{ id: string; platform: string; name: string; username: string }>;
    posts: Array<{
        id: string;
        caption: string | null;
        status: string;
        postType: string | null;
        platform: string | null;
        socialAccountId: string | null;
        accountName: string | null;
        accountUsername: string | null;
        publishedAt: string | null;
        scheduledAt: string | null;
    }>;
    platformAnalytics: Array<{
        id: string;
        socialAccountId: string;
        accountName: string | null;
        platform: string | null;
        date: string;
        followers: number | null;
        followersChange: number | null;
        following: number | null;
        impressions: number | null;
        reach: number | null;
        engagementRate: number | null;
        profileViews: number | null;
        websiteClicks: number | null;
    }>;
    competitors: Array<{
        id: string;
        platform: string | null;
        username: string | null;
        displayName: string | null;
        followers: number | null;
        followerGrowth: number | null;
        avgEngagement: number | null;
        postsPerWeek: number | null;
        posts: Array<{
            id: string;
            caption: string | null;
            mediaType: string | null;
            likes: number | null;
            comments: number | null;
            engagement: number | null;
            postedAt: string;
        }>;
    }>;
    platformKnowledge: Array<
        | {
              platform: string;
              socialAccountId: string;
              accountName: string;
              username: string;
              guidance: string;
          }
        | {
              platform: string;
              title: string;
              guidance: string;
              sourceUrl: string | null;
          }
    >;
    previousRecommendations: Array<Record<string, unknown>>;
}

export interface GenerateSebReportOptions {
    organizationId: string;
    userId?: string;
    trigger?: ReportTrigger;
    reportId?: string;
}
