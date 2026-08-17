import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { INSTAGRAM_GRAPH_URL, GRAPH_API_URL, type Platform } from "@/lib/platforms";
import { decryptToken } from "@/lib/token-encryption";

export interface CompetitorInput {
    platform: Platform;
    username: string;
}

export interface CompetitorDetail {
    id: string;
    organizationId: string;
    platform: Platform;
    username: string;
    displayName: string | null;
    avatar: string | null;
    followers: number;
    followerGrowth: number;
    avgEngagement: number;
    postsPerWeek: number;
    isVerified: boolean;
    shareOfVoice: number;
    benchmarkScore: number;
    lastSyncedAt: string | null;
    createdAt: string;
    postCount: number;
    recentPosts: CompetitorPostDetail[];
}

export interface CompetitorPostDetail {
    id: string;
    platformId: string | null;
    caption: string | null;
    mediaType: string | null;
    likes: number;
    comments: number;
    engagement: number;
    postedAt: string;
}

export async function listCompetitors(organizationId: string) {
    const competitors = await db.query.competitor.findMany({
        where: eq(schema.competitor.organizationId, organizationId),
        orderBy: [desc(schema.competitor.followers)],
        with: {
            posts: {
                orderBy: [desc(schema.competitorPost.postedAt)],
                limit: 6,
            },
        },
    });

    return competitors.map((c) => formatCompetitor(c));
}

export async function getCompetitor(organizationId: string, id: string) {
    const c = await db.query.competitor.findFirst({
        where: and(eq(schema.competitor.id, id), eq(schema.competitor.organizationId, organizationId)),
        with: { posts: { orderBy: [desc(schema.competitorPost.postedAt)], limit: 50 } },
    });
    return c ? formatCompetitor(c) : null;
}

function formatCompetitor(c: {
    id: string;
    organizationId: string;
    platform: Platform;
    username: string;
    displayName: string | null;
    avatar: string | null;
    followers: number;
    followerGrowth: number;
    avgEngagement: number;
    postsPerWeek: number;
    isVerified: boolean;
    shareOfVoice: number;
    benchmarkScore: number;
    lastSyncedAt: Date | null;
    createdAt: Date;
    posts?: Array<{
        id: string;
        platformId: string | null;
        caption: string | null;
        mediaType: string | null;
        likes: number;
        comments: number;
        engagement: number;
        postedAt: Date;
    }>;
}): CompetitorDetail {
    return {
        id: c.id,
        organizationId: c.organizationId,
        platform: c.platform,
        username: c.username,
        displayName: c.displayName,
        avatar: c.avatar,
        followers: c.followers,
        followerGrowth: c.followerGrowth,
        avgEngagement: c.avgEngagement,
        postsPerWeek: c.postsPerWeek,
        isVerified: c.isVerified,
        shareOfVoice: c.shareOfVoice,
        benchmarkScore: c.benchmarkScore,
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        postCount: c.posts?.length ?? 0,
        recentPosts: (c.posts ?? []).map((p) => ({
            id: p.id,
            platformId: p.platformId,
            caption: p.caption,
            mediaType: p.mediaType,
            likes: p.likes,
            comments: p.comments,
            engagement: p.engagement,
            postedAt: p.postedAt.toISOString(),
        })),
    };
}

/** Tambah competitor. Untuk Instagram, coba isi profil via Business Discovery. */
export async function addCompetitor(
    organizationId: string,
    input: CompetitorInput,
): Promise<{ competitor?: CompetitorDetail; error?: string; status: number; warning?: string }> {
    const platform = input.platform.toUpperCase() as Platform;
    const username = input.username.toLowerCase().replace(/^@/, "").trim();
    if (!username) return { error: "Username wajib.", status: 400 };

    const existing = await db.query.competitor.findFirst({
        where: and(
            eq(schema.competitor.organizationId, organizationId),
            eq(schema.competitor.platform, platform),
            eq(schema.competitor.username, username),
        ),
        columns: { id: true },
    });
    if (existing) return { error: "Competitor sudah dilacak.", status: 400 };

    let profile = { displayName: username, followers: 0, avatar: null as string | null, isVerified: false };
    let warning: string | undefined;

    if (platform === "INSTAGRAM" || platform === "INSTAGRAM_PAGE") {
        const result = await fetchBusinessDiscoveryProfile(organizationId, username);
        if (result.success && result.data) {
            profile = {
                displayName: result.data.displayName || username,
                followers: result.data.followers,
                avatar: result.data.avatarUrl,
                isVerified: result.data.isVerified,
            };
        } else {
            warning = result.error;
        }
    }

    const id = randomUUID();
    await db.insert(schema.competitor).values({
        id,
        organizationId,
        platform,
        username,
        displayName: profile.displayName,
        avatar: profile.avatar,
        followers: profile.followers,
        isVerified: profile.isVerified,
        lastSyncedAt: profile.followers > 0 ? new Date() : null,
    });

    const competitor = await getCompetitor(organizationId, id);
    return { competitor: competitor ?? undefined, status: 201, warning };
}

export async function deleteCompetitor(organizationId: string, id: string): Promise<{ ok: boolean; error?: string }> {
    const existing = await db.query.competitor.findFirst({
        where: and(eq(schema.competitor.id, id), eq(schema.competitor.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { ok: false, error: "Competitor tidak ditemukan." };

    await db.delete(schema.competitor).where(eq(schema.competitor.id, id));
    return { ok: true };
}

export interface SyncResult {
    synced: boolean;
    followers?: number;
    followerGrowth?: number;
    avgEngagement?: number;
    postsPerWeek?: number;
    postsSynced?: number;
    lastSyncedAt?: string;
    error?: string;
    errorCode?: string;
}

/**
 * Sinkronkan data competitor via Instagram Business Discovery.
 * Hanya platform Instagram yang didukung (perlu akun IG aktif milik org).
 */
export async function syncCompetitor(organizationId: string, competitorId: string): Promise<SyncResult> {
    const competitor = await db.query.competitor.findFirst({
        where: and(eq(schema.competitor.id, competitorId), eq(schema.competitor.organizationId, organizationId)),
    });
    if (!competitor) return { synced: false, error: "Competitor tidak ditemukan.", errorCode: "NOT_FOUND" };

    if (competitor.platform !== "INSTAGRAM" && competitor.platform !== "INSTAGRAM_PAGE") {
        return {
            synced: false,
            error: "Sinkronisasi hanya didukung untuk akun Instagram saat ini.",
            errorCode: "UNSUPPORTED_PLATFORM",
        };
    }

    // Cari akun IG milik org sebagai "kunci akses" Business Discovery.
    const igAccount = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(
                _eq(t.organizationId, organizationId),
                _eq(t.isActive, true),
                inArray(t.platform, ["INSTAGRAM", "INSTAGRAM_PAGE"]),
            ),
    });
    if (!igAccount) {
        return {
            synced: false,
            error: "Belum ada akun Instagram yang terhubung. Hubungkan dulu di Pengaturan untuk mengaktifkan sinkronisasi competitor.",
            errorCode: "NO_IG_ACCOUNT",
        };
    }

    const accessToken = decryptToken(igAccount.accessToken);
    const baseUrl = igAccount.platform === "INSTAGRAM_PAGE" ? GRAPH_API_URL : INSTAGRAM_GRAPH_URL;
    const callerUserId = igAccount.platformId;
    const username = competitor.username;

    const [profileResult, mediaResult] = await Promise.all([
        fetchProfile(baseUrl, accessToken, callerUserId, username),
        fetchMedia(baseUrl, accessToken, callerUserId, username, 12),
    ]);

    if (!profileResult.success || !profileResult.data) {
        return { synced: false, error: profileResult.error || "Gagal mengambil data competitor.", errorCode: profileResult.errorCode };
    }
    const profile = profileResult.data;
    const posts = mediaResult.success ? mediaResult.data : [];

    // Growth (persen) & rata-rata engagement (persen terhadap followers).
    const prevFollowers = competitor.followers;
    const followerGrowth = prevFollowers > 0 ? Math.round(((profile.followers - prevFollowers) / prevFollowers) * 10000) / 100 : 0;

    let totalEngagement = 0;
    let validCount = 0;
    for (const p of posts) {
        if (p.likes > 0 || p.comments > 0) {
            totalEngagement += p.likes + p.comments;
            validCount++;
        }
    }
    const avgEngagement = profile.followers > 0 && validCount > 0
        ? Math.round(((totalEngagement / validCount) / profile.followers) * 10000) / 100
        : 0;

    let postsPerWeek = 0;
    if (posts.length >= 2) {
        const newest = posts[0].postedAt.getTime();
        const oldest = posts[posts.length - 1].postedAt.getTime();
        const daySpan = Math.max((newest - oldest) / (1000 * 60 * 60 * 24), 1);
        postsPerWeek = Math.round((posts.length / daySpan) * 7 * 10) / 10;
    } else if (posts.length === 1) {
        postsPerWeek = 1;
    }

    await db.update(schema.competitor)
        .set({
            displayName: profile.displayName || competitor.displayName,
            avatar: profile.avatarUrl || competitor.avatar,
            followers: profile.followers,
            followerGrowth,
            avgEngagement,
            postsPerWeek,
            isVerified: profile.isVerified,
            lastSyncedAt: new Date(),
        })
        .where(eq(schema.competitor.id, competitorId));

    let postsSynced = 0;
    for (const p of posts) {
        if (!p.id) continue;
        const existing = await db.query.competitorPost.findFirst({
            where: and(eq(schema.competitorPost.competitorId, competitorId), eq(schema.competitorPost.platformId, p.id)),
            columns: { id: true },
        });
        if (existing) {
            await db.update(schema.competitorPost)
                .set({ likes: p.likes, comments: p.comments, engagement: p.likes + p.comments })
                .where(eq(schema.competitorPost.id, existing.id));
        } else {
            await db.insert(schema.competitorPost).values({
                id: randomUUID(),
                competitorId,
                platformId: p.id,
                postedAt: p.postedAt,
                caption: p.caption.slice(0, 2000),
                mediaType: p.mediaType,
                engagement: p.likes + p.comments,
                likes: p.likes,
                comments: p.comments,
            });
        }
        postsSynced++;
    }

    return {
        synced: true,
        followers: profile.followers,
        followerGrowth,
        avgEngagement,
        postsPerWeek,
        postsSynced,
        lastSyncedAt: new Date().toISOString(),
    };
}

// ============================================================================
// Business Discovery (Instagram Graph API)
// ============================================================================

interface DiscoveryProfile {
    username: string;
    displayName: string;
    followers: number;
    avatarUrl: string | null;
    isVerified: boolean;
}

interface DiscoveryPost {
    id: string;
    mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
    caption: string;
    likes: number;
    comments: number;
    postedAt: Date;
}

async function fetchBusinessDiscoveryProfile(
    organizationId: string,
    targetUsername: string,
): Promise<{ success: boolean; data?: DiscoveryProfile; error?: string; errorCode?: string }> {
    const igAccount = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.isActive, true), _eq(t.platform, "INSTAGRAM")),
        columns: { id: true, platformId: true, accessToken: true },
    });
    if (!igAccount) {
        return { success: false, error: "Belum ada akun Instagram Business terhubung. Hubungkan dulu agar pencarian competitor aktif." };
    }

    const accessToken = decryptToken(igAccount.accessToken);
    return fetchProfile(INSTAGRAM_GRAPH_URL, accessToken, igAccount.platformId, targetUsername);
}

async function fetchProfile(
    baseUrl: string,
    token: string,
    callerUserId: string,
    targetUsername: string,
): Promise<{ success: boolean; data?: DiscoveryProfile; error?: string; errorCode?: string }> {
    const fields = ["username", "name", "followers_count", "profile_picture_url"].join(",");
    const url = `${baseUrl}/${callerUserId}?fields=business_discovery.username(${targetUsername}){${fields}}`;
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
        const data = await res.json();
        if (!res.ok || data.error) {
            return { success: false, error: mapDiscoveryError(data.error, res.status), errorCode: String(data.error?.code ?? res.status) };
        }
        const bd = data.business_discovery;
        if (!bd) return { success: false, error: "Tidak ada data untuk username ini." };
        return {
            success: true,
            data: {
                username: bd.username ?? targetUsername,
                displayName: bd.name ?? targetUsername,
                followers: Number(bd.followers_count ?? 0),
                avatarUrl: bd.profile_picture_url ?? null,
                isVerified: false,
            },
        };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Gagal mengambil profil competitor." };
    }
}

async function fetchMedia(
    baseUrl: string,
    token: string,
    callerUserId: string,
    targetUsername: string,
    limit = 12,
): Promise<{ success: boolean; data: DiscoveryPost[]; error?: string }> {
    const capped = Math.min(limit, 50);
    const fields = ["media_type", "caption", "like_count", "comments_count", "timestamp"].join(",");
    const url = `${baseUrl}/${callerUserId}?fields=business_discovery.username(${targetUsername}){media.limit(${capped}){${fields}}}`;
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
        const data = await res.json();
        if (!res.ok || data.error) {
            return { success: false, data: [], error: mapDiscoveryError(data.error, res.status) };
        }
        const posts: DiscoveryPost[] = (data.business_discovery?.media?.data ?? []).map((m: Record<string, unknown>) => ({
            id: String(m.id ?? ""),
            mediaType: (m.media_type as DiscoveryPost["mediaType"]) ?? "IMAGE",
            caption: String(m.caption ?? ""),
            likes: Number(m.like_count ?? 0),
            comments: Number(m.comments_count ?? 0),
            postedAt: new Date(String(m.timestamp)),
        }));
        return { success: true, data: posts };
    } catch (e) {
        return { success: false, data: [], error: e instanceof Error ? e.message : "Gagal mengambil post competitor." };
    }
}

function mapDiscoveryError(error: { code?: number; error_subcode?: number; message?: string }, status?: number): string {
    if (error?.error_subcode === 2207013) {
        return "Akun tidak ditemukan. Username mungkin tidak ada atau bukan akun bisnis/creator.";
    }
    if (error?.code === 100 || status === 400) {
        return "Tidak dapat melihat akun ini. Mungkin privat atau akun personal.";
    }
    if (error?.code === 4 || error?.code === 32) {
        return "Batas rate tercapai. Coba lagi beberapa menit lagi.";
    }
    if (error?.code === 190) {
        return "Koneksi Instagram kedaluwarsa. Hubungkan ulang akun di Pengaturan.";
    }
    return error?.message ?? "Terjadi kesalahan saat mengambil data.";
}