// Fetch metrik analytics per platform (account-level & post-level).
//
// Dari pecahan analytics-sync.ts — file ini berisi murni adapter HTTP ke API
// tiap platform: request, normalisasi response → AccountMetrics/PostMetrics.
// Tidak menyentuh DB (no upsert) supaya unit-testable tanpa Postgres.
//
// Endpoint insights per platform (riset docs/social-platforms, Sep 2026):
// - instagram (FB Login): graph.facebook.com — /{ig-id}?fields=followers_count,media_count
//   + /{ig-id}/insights (reach,profile_views,website_clicks)
//   + /{media-id}/insights (reach,likes,comments,shares,saved,views)
// - instagram_standalone: graph.instagram.com — /me?fields=followers_count,media_count
//   + /{ig-id}/insights (reach,profile_views,website_clicks)
//   + /{media-id}/insights (reach,likes,comments,shares,saves,views)
// - facebook: /{page-id}?fields=fan_count + /{post-id}?fields=reactions.summary,comments.summary,shares
//   + /{page-id}/insights (page_media_view = "Tayangan"/views, page_post_engagements;
//     `page_impressions` sudah di-deprecate 15 Nov 2025)
// - threads: /{user-id}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count
// - tiktok: /v2/user/info/?fields=follower_count,likes_count,video_count + video/list (like/comment/share/view_count)
// - youtube: /youtube/v3/channels?part=statistics + /videos?part=statistics (batch id)
// - bluesky: app.bsky.actor.getProfile (public XRPC) + getPostThread
// - linkedin: /rest/socialActions/{urn} (post) — member followers tidak tersedia
//   (dipakai juga oleh linkedin_org: post organization)
// - google_business: businessprofileperformance.googleapis.com fetchMultiDailyMetricsTimeSeries

import {
  BSKY_APPVIEW_URL,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  GRAPH_THREADS_URL,
  LINKEDIN_API_VERSION,
  LINKEDIN_REST_URL,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "./config";
import { httpRequest } from "./http";
import {
  type ReplizContentStatistic,
  replizActiveCredentials,
  replizGetContentStatistic,
} from "./repliz";

const GRAPH_FB = GRAPH_FB_URL;
const GRAPH_IG = GRAPH_IG_URL;
const GRAPH_THREADS = GRAPH_THREADS_URL;

/** Metrik akun hasil fetch */
export type AccountMetrics = {
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  impressions?: number | null;
  reach?: number | null;
  profileViews?: number | null;
  websiteClicks?: number | null;
  engagementCount?: number | null;
};

/** Metrik post hasil fetch (kumulatif lifetime dari platform) */
export type PostMetrics = {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  views?: number | null;
  impressions?: number | null;
  reach?: number | null;
  websiteClicks?: number | null;
};

/** Metrik level-post yang bisa ditampilkan di kartu ringkasan Analitik */
export type PostMetricKey = "views" | "likes" | "comments" | "shares" | "impressions";

/**
 * Metrik yang BENAR-BENAR disediakan tiap platform (level post).
 *
 * Dipakai halaman Analitik untuk menampilkan "—" (bukan 0) pada kartu metrik
 * yang tidak disediakan platform — supaya 0 tidak dibaca sebagai
 * "konten tidak dapat interaksi". Contoh: Threads/TikTok/YouTube/Bluesky tidak
 * punya `impressions` per-post; YouTube tidak punya `shares`; Bluesky tidak
 * punya `views`.
 *
 * Sumber: riset docs/social-platforms + probe API (lihat komentar tiap adapter).
 */
const POST_METRIC_SUPPORT: Record<string, readonly PostMetricKey[]> = {
  // IG: `impressions` per-post TIDAK tersedia (ditolak API untuk media setelah
  // 2 Juli 2024) → jangan dipalsukan dari `views`; kartunya tampil "—" seperti
  // Threads. `views`, `likes`, `comments`, `shares`, `saves` tersedia.
  instagram: ["views", "likes", "comments", "shares"],
  instagram_standalone: ["views", "likes", "comments", "shares"],
  // FB: views/impressions level POST tidak tersedia → diisi Page Insights (level akun)
  facebook: ["views", "likes", "comments", "shares", "impressions"],
  // Threads: hanya views/likes/replies/reposts/quotes/shares — tanpa impressions
  threads: ["views", "likes", "comments", "shares"],
  tiktok: ["views", "likes", "comments", "shares"],
  youtube: ["views", "likes", "comments"],
  bluesky: ["likes", "comments", "shares"],
  linkedin: ["likes", "comments"],
  linkedin_org: ["views", "likes", "comments", "shares", "impressions"],
};

/**
 * Metrik yang disediakan platform untuk SATU POST (level post) — dipakai kartu
 * per-post di /post-results.
 *
 * BERBEDA dari POST_METRIC_SUPPORT: di sana `facebook` mencantumkan
 * views/impressions karena halaman Analitik menggabungkannya dari Page Insights
 * level AKUN (`page_media_view`). Angka itu milik HALAMAN, bukan per-post —
 * Facebook (New Pages Experience) menolak SEMUA metric insights level post
 * ("(#100) not a valid insights metric", dibuktikan probe). Jadi di sini
 * views/impressions Facebook TIDAK dicantumkan, dan kartunya menampilkan "—"
 * alih-alih 0 yang menyesatkan.
 */
const POST_METRIC_SUPPORT_PER_POST: Record<string, readonly PostMetricKey[]> = {
  instagram: ["views", "likes", "comments", "shares"],
  instagram_standalone: ["views", "likes", "comments", "shares"],
  // Tanpa views/impressions: FB tidak menyediakannya per-post.
  facebook: ["likes", "comments", "shares"],
  threads: ["views", "likes", "comments", "shares"],
  tiktok: ["views", "likes", "comments", "shares"],
  youtube: ["views", "likes", "comments"],
  bluesky: ["likes", "comments", "shares"],
  linkedin: ["likes", "comments"],
  linkedin_org: ["views", "likes", "comments", "shares"],
};

const ALL_POST_METRIC_KEYS: readonly PostMetricKey[] = [
  "views",
  "likes",
  "comments",
  "shares",
  "impressions",
];

/** Semua metrik dianggap tersedia — dipakai saat platform tidak diketahui. */
function allPostMetricsTrue(): Record<PostMetricKey, boolean> {
  return Object.fromEntries(ALL_POST_METRIC_KEYS.map((k) => [k, true])) as Record<
    PostMetricKey,
    boolean
  >;
}

/**
 * Gabungan (union) metrik dari beberapa platform: sebuah metrik dianggap
 * tersedia bila SALAH SATU platform menyediakannya. Platform tak dikenal →
 * semua tersedia (lebih baik menampilkan angka apa adanya daripada menyembunyikan).
 */
function supportUnion(
  table: Record<string, readonly PostMetricKey[]>,
  platforms: string[],
): Record<PostMetricKey, boolean> {
  if (platforms.length === 0) return allPostMetricsTrue();
  const supported = new Set<PostMetricKey>();
  for (const platform of platforms) {
    for (const key of table[platform] ?? ALL_POST_METRIC_KEYS) {
      supported.add(key);
    }
  }
  return Object.fromEntries(ALL_POST_METRIC_KEYS.map((k) => [k, supported.has(k)])) as Record<
    PostMetricKey,
    boolean
  >;
}

/**
 * Gabungan metrik level AKUN (dipakai kartu ringkasan halaman Analitik). Di sini
 * Facebook dianggap menyediakan views/impressions karena angkanya diambil dari
 * Page Insights level akun (`page_media_view`).
 */
export function supportedPostMetrics(platforms: string[]): Record<PostMetricKey, boolean> {
  return supportUnion(POST_METRIC_SUPPORT, platforms);
}

/**
 * Gabungan metrik untuk kartu PER-POST (/post-results). Beda dari versi level
 * akun: Facebook TIDAK menyediakan views/impressions per-post.
 *
 * `bridge` = akun Repliz: Repliz menormalkan metrik lintas platform (views/reach/
 * impressions dari Content statistic API), jadi metriknya dianggap tersedia —
 * jangan sembunyikan angka yang Repliz memang kirim.
 */
export function supportedPostMetricsPerPost(
  platforms: string[],
  bridge = false,
): Record<PostMetricKey, boolean> {
  if (bridge) return allPostMetricsTrue();
  return supportUnion(POST_METRIC_SUPPORT_PER_POST, platforms);
}

function pageTokenOf(metadata: Record<string, unknown> | null): string | null {
  return typeof metadata?.pageAccessToken === "string" ? metadata.pageAccessToken : null;
}

// ---------------------------------------------------------------------------
// Fetch metrik akun per platform
// ---------------------------------------------------------------------------

export async function fetchAccountMetrics(
  platform: string,
  platformAccountId: string,
  accessToken: string,
  metadata: Record<string, unknown> | null,
): Promise<AccountMetrics> {
  // Akun bridge Repliz: Account API Repliz tidak mengekspos metrik follower
  // (hanya info akun + status koneksi) → tidak ada snapshot account-level untuk
  // bridge. Post-level tetap disync (lihat fetchPostMetrics).
  if (metadata?.replizAccountId) {
    return {};
  }
  switch (platform) {
    case "instagram":
      return igAccountMetrics(GRAPH_FB, platformAccountId, pageTokenOf(metadata) ?? accessToken);
    case "instagram_standalone":
      return igAccountMetrics(GRAPH_IG, platformAccountId, accessToken);
    case "facebook":
      return facebookAccountMetrics(platformAccountId, pageTokenOf(metadata) ?? accessToken);
    case "threads":
      return threadsAccountMetrics(platformAccountId, accessToken);
    case "tiktok":
      return tiktokAccountMetrics(accessToken);
    case "youtube":
      return youtubeAccountMetrics(platformAccountId, accessToken);
    case "bluesky":
      return blueskyAccountMetrics(platformAccountId);
    case "linkedin":
    case "linkedin_org":
      return linkedinAccountMetrics(platformAccountId, accessToken);
    default:
      return {};
  }
}

/** Instagram (kedua jalur) — followers_count + media_count */
async function igAccountMetrics(
  base: string,
  igUserId: string,
  token: string,
): Promise<AccountMetrics> {
  const res = await httpRequest<{
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  }>(`${base}/${igUserId}`, {
    query: { fields: "followers_count,follows_count,media_count", access_token: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IG akun: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  // Account insights opsional — bila izin/metric belum tersedia tetap simpan followers dkk.
  const insights = await igAccountInsights(base, igUserId, token);
  return {
    followers: data.followers_count,
    following: data.follows_count,
    posts: data.media_count,
    ...insights,
  };
}

/** Facebook Page — fan_count */
async function facebookAccountMetrics(pageId: string, token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    fan_count?: number;
    followers_count?: number;
  }>(`${GRAPH_FB}/${pageId}`, {
    query: { fields: "fan_count,followers_count", access_token: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FB akun: ${text.slice(0, 150)}`);
  }
  const data = await res.json();

  // Page Insights — permission `read_insights`. New Pages Experience hanya
  // menerima metric terbatas; metric klasik (page_impressions, page_fans,
  // page_fans_gender_age) ditolak "(#100) not a valid insights metric" setelah
  // deprecation Meta 15 Nov 2025. Insights opsional — bila gagal, snapshot
  // followers tetap tersimpan; error ditelan supaya sync akun tidak terhambat.
  const insights = await facebookPageInsights(pageId, token);

  return {
    followers: data.followers_count ?? data.fan_count,
    // Views/Impressions Halaman = `page_media_view` ("Tayangan Facebook").
    // JANGAN `page_views_total` — itu kunjungan ke PROFIL Halaman, hampir
    // selalu 0 untuk halaman yang trafiknya lewat feed (itu sebabnya kartu
    // Views Facebook dulu selalu 0).
    impressions: insights.mediaViews,
    // `page_views_total` tetap disimpan sebagai profileViews (kunjungan profil).
    profileViews: insights.pageViews,
    engagementCount: insights.engagements,
  };
}

/**
 * Daftar metric Page Insights Facebook — DIEKSPOR supaya bug "views FB selalu 0"
 * tidak bisa kembali tanpa terdeteksi tes.
 *
 * `page_media_view` ("Tayangan Facebook") = berapa kali konten Halaman
 * ditampilkan di layar orang. Ini metric Views/Impressions yang BENAR; ia
 * menggantikan `page_impressions` yang di-deprecate Meta (15 Nov 2025).
 *
 * `page_views_total` = kunjungan ke PROFIL Halaman (bukan tayangan konten) —
 * hampir selalu 0, jadi hanya dipakai sebagai cadangan bila API versi lama
 * belum mengenal `page_media_view`.
 */
export const FB_PAGE_INSIGHT_METRICS = {
  primary: "page_media_view,page_post_engagements,page_views_total",
  fallback: "page_views_total,page_post_engagements",
} as const;

/**
 * Page Insights Facebook — baca metric yang diterima New Pages Experience.
 * Kembalikan null bila metric tidak tersedia / ditolak, agar tidak menghapus
 * snapshot sebelumnya.
 */
async function facebookPageInsights(
  pageId: string,
  token: string,
): Promise<{ mediaViews: number | null; pageViews: number | null; engagements: number | null }> {
  // Urutan percobaan: daftar baru (page_media_view) → daftar lama. Kalau API
  // versi lama tidak mengenal `page_media_view`, SELURUH request dijawab 400;
  // daftar lama memastikan engagements tetap terambil.
  const attempts = [FB_PAGE_INSIGHT_METRICS.primary, FB_PAGE_INSIGHT_METRICS.fallback];
  for (const metric of attempts) {
    try {
      const res = await httpRequest<{
        data?: Array<{
          name?: string;
          values?: Array<{ value?: number }>;
          total_value?: { value?: number };
        }>;
      }>(`${GRAPH_FB}/${pageId}/insights`, {
        query: { metric, period: "day", access_token: token },
        retries: 1,
      });
      if (!res.ok) continue;
      const payload = await res.json();
      const byName = new Map(
        (payload.data ?? []).map((m) => [
          m.name ?? "",
          m.values?.[m.values.length - 1]?.value ?? m.total_value?.value ?? null,
        ]),
      );
      return {
        mediaViews: byName.get("page_media_view") ?? null,
        pageViews: byName.get("page_views_total") ?? null,
        engagements: byName.get("page_post_engagements") ?? null,
      };
    } catch {
      // coba daftar berikutnya
    }
  }
  // Insights opsional — jangan gagalkan snapshot followers
  return { mediaViews: null, pageViews: null, engagements: null };
}

/** Threads — threads_insights (butuh ≥1 post; followers_count tersedia) */
async function threadsAccountMetrics(userId: string, token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    data?: Array<{
      name: string;
      // total_value bisa object { value } (followers_count) atau number (lama)
      total_value?: number | { value?: number };
      values?: Array<{ value: number }>;
    }>;
  }>(`${GRAPH_THREADS}/${userId}/threads_insights`, {
    query: { metric: "views,likes,replies,reposts,quotes,followers_count", access_token: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Threads insights: ${text.slice(0, 150)}`);
  }
  const data = (await res.json()).data ?? [];
  const byName = new Map(
    data.map((m) => {
      const tv =
        typeof m.total_value === "object" && m.total_value !== null
          ? (m.total_value.value ?? null)
          : (m.total_value ?? null);
      return [m.name, tv ?? m.values?.[0]?.value ?? null];
    }),
  );
  return {
    followers: byName.get("followers_count") ?? null,
    impressions: byName.get("views") ?? null,
  };
}

/** TikTok — user/info dengan stats (follower_count, likes_count, video_count) */
async function tiktokAccountMetrics(token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    data?: {
      user?: {
        follower_count?: number;
        following_count?: number;
        likes_count?: number;
        video_count?: number;
      };
    };
    error?: { message?: string };
  }>(`${TIKTOK_OPEN_API_URL}/user/info/`, {
    query: { fields: "follower_count,following_count,likes_count,video_count" },
    headers: { Authorization: `Bearer ${token}` },
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TikTok akun: ${text.slice(0, 150)}`);
  }
  const user = (await res.json()).data?.user;
  return {
    followers: user?.follower_count ?? null,
    following: user?.following_count ?? null,
    posts: user?.video_count ?? null,
  };
}

/** YouTube — channels?part=statistics (subscriberCount, viewCount, videoCount) */
async function youtubeAccountMetrics(channelId: string, token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    items?: Array<{
      statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
    }>;
  }>(`${YOUTUBE_API_URL}/channels`, {
    query: { part: "statistics", id: channelId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YT channel: ${text.slice(0, 150)}`);
  }
  const stats = (await res.json()).items?.[0]?.statistics;
  return {
    followers: stats ? Number(stats.subscriberCount) || null : null,
    posts: stats ? Number(stats.videoCount) || null : null,
    impressions: stats ? Number(stats.viewCount) || null : null, // total views lifetime channel
  };
}

/** Bluesky — public XRPC getProfile (tidak butuh auth) */
async function blueskyAccountMetrics(did: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
  }>(`${BSKY_APPVIEW_URL}/xrpc/app.bsky.actor.getProfile`, {
    query: { actor: did },
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bluesky profil: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  return {
    followers: data.followersCount ?? null,
    following: data.followsCount ?? null,
    posts: data.postsCount ?? null,
  };
}

/**
 * LinkedIn — organization entity profile (followerCount, name).
 * Untuk personal profile, follower count tidak tersedia tanpa scope tambahan.
 * Untuk organization pages, gunakan endpoint v2/entities/{orgUrn} yang tersedia
 * dengan scope r_organization_social.
 */
async function linkedinAccountMetrics(
  platformAccountId: string,
  token: string,
): Promise<AccountMetrics> {
  // Hanya fetch untuk organization URN (urn:li:organization:{id})
  if (!platformAccountId.startsWith("urn:li:organization:")) {
    return {};
  }
  const res = await httpRequest<{
    followerCount?: number;
    name?: string;
    localizedDescription?: string;
  }>(`${LINKEDIN_REST_URL}/v2/entities/${encodeURIComponent(platformAccountId)}`, {
    query: { projection: "(followerCount,name,localizedDescription)" },
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!res.ok) {
    // May fail if scope r_organization_followers is not granted — graceful fallback
    return {};
  }
  const data = await res.json();
  return {
    followers: data.followerCount ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fetch metrik post per platform
// ---------------------------------------------------------------------------

export async function fetchPostMetrics(
  platform: string,
  platformPostId: string,
  accessToken: string,
  metadata: Record<string, unknown> | null,
  ownerUrn?: string,
): Promise<PostMetrics> {
  // Akun bridge Repliz: metrik via Content statistic API
  // (GET /public/content/{contentId}/statistic?accountId=…). platformPostId =
  // id konten Repliz (dari posts-sync bridge), accountId = replizAccountId.
  if (metadata?.replizAccountId) {
    return replizPostMetrics(platformPostId, String(metadata.replizAccountId));
  }
  switch (platform) {
    case "instagram":
      return igPostMetrics(
        GRAPH_FB,
        platformPostId,
        pageTokenOf(metadata) ?? accessToken,
        IG_MEDIA_METRICS_FB,
      );
    case "instagram_standalone":
      return igPostMetrics(GRAPH_IG, platformPostId, accessToken, IG_MEDIA_METRICS_IG);
    case "facebook":
      return facebookPostMetrics(platformPostId, pageTokenOf(metadata) ?? accessToken);
    case "threads":
      return threadsPostMetrics(platformPostId, accessToken);
    case "tiktok":
      return tiktokPostMetrics(platformPostId, accessToken);
    case "youtube":
      return youtubePostMetrics(platformPostId, accessToken);
    case "bluesky":
      return blueskyPostMetrics(platformPostId);
    case "linkedin":
    case "linkedin_org":
      return linkedinPostMetrics(platformPostId, accessToken, ownerUrn);
    default:
      return {};
  }
}

type MetaInsight = {
  name?: string;
  values?: Array<{ value?: number }>;
  total_value?: { value?: number };
};

/** Ambil nilai metric dari response insights Meta: [{name, values:[{value}]}] */
export function metricValue(
  data: Array<MetaInsight | undefined> | undefined,
  name: string,
): number | null {
  const m = data?.find((d) => d?.name === name);
  const v = m?.values?.[0]?.value ?? m?.total_value?.value;
  return typeof v === "number" ? v : null;
}

// Metric media insights Instagram — daftar metric VALID per tipe media.
// - graph.facebook.com (FB Login): `saved` (singular); `impressions`/`plays` sudah
//   deprecated → digantikan `views`
// - graph.instagram.com (IG Login): JUGA memakai `saved` (singular). Memakai
//   `saves` (plural) dijawab HTTP 400 — daftar nilai yang diterima Meta adalah
//   "impressions, shares, comments, likes, saved, replies, total_interactions,
//   navigation, follow". Karena itu jangan pernah memakai `saves` di sini.
// - `views` VALID untuk FEED (image), REELS, maupun STORY di KEDUA host.
//   Sebelumnya `views` dikeluarkan dari IG_MEDIA_METRICS_IG dengan asumsi
//   "tidak valid untuk reel" — TERBUKTI SALAH oleh probe langsung ke API
//   (media IMAGE 18222074944337521 → views=115, REEL 18438168793198359 →
//   views=49). Akibatnya kartu Views IG selalu 0 di /post-results dan
//   /performance/analitik selama bertahun-tahun.
// - `impressions` memang DITOLAK untuk media setelah 2 Juli 2024 ("does not
//   support the impressions metric for this media product type"), jadi TIDAK
//   boleh masuk daftar — bila satu metric ditolak, SELURUH request gagal dan
//   semua metrik lain ikut hilang. `impressions` pun TIDAK dipalsukan dari
//   `views` (dulu begitu, menyesatkan); dibiarkan null dan kartunya tampil
//   "tidak diseddikan platform" — lihat POST_METRIC_SUPPORT.
// `reach` valid untuk semua tipe media → dipakai sebagai fallback terakhir.
const IG_MEDIA_METRICS_FB = "reach,likes,comments,shares,saved,views";
const IG_MEDIA_METRICS_IG = "reach,likes,comments,shares,saved,views";
const IG_MEDIA_METRICS_FALLBACK = "reach";

/**
 * Daftar metric yang diminta ke Instagram per host — DIEKSPOR supaya bug
 * "views IG selalu 0" tidak bisa kembali tanpa terdeteksi tes.
 *
 * `views` WAJIB ada di kedua host: ia valid untuk FEED, REELS, dan STORY.
 * Sebelumnya `views` dikeluarkan dari IG_MEDIA_METRICS_IG dengan asumsi
 * "tidak valid untuk reel" — asumsi itu salah (dibuktikan probe API langsung),
 * dan akibatnya kartu Views IG selalu menampilkan 0 di /post-results dan
 * /performance/analitik.
 *
 * `impressions` sengaja TIDAK ada: untuk media setelah 2 Juli 2024 metric ini
 * ditolak, dan satu metric yang ditolak membatalkan SELURUH request. Angkanya
 * juga tidak dipalsukan dari `views` (lihat igPostMetrics).
 */
export const IG_MEDIA_METRIC_LISTS = {
  facebook: IG_MEDIA_METRICS_FB,
  instagram: IG_MEDIA_METRICS_FB,
  instagram_standalone: IG_MEDIA_METRICS_IG,
} as const;

/** Satu request media insights — kembalikan data atau pesan error (tanpa throw) */
async function requestIgMediaInsights(
  base: string,
  mediaId: string,
  token: string,
  metric: string,
): Promise<{ data?: MetaInsight[]; error?: string }> {
  const res = await httpRequest<{ data?: MetaInsight[] }>(`${base}/${mediaId}/insights`, {
    query: { metric, access_token: token },
  });
  if (res.ok) return { data: (await res.json()).data ?? [] };
  const text = await res.text().catch(() => "");
  return { error: text.slice(0, 150) };
}

/**
 * Instagram media insights — metric spesifik host. Bila sebagian metric ditolak untuk
 * tipe media tertentu (mis. `views` untuk image), coba tanpa `views`, lalu `reach` saja.
 */
async function igPostMetrics(
  base: string,
  mediaId: string,
  token: string,
  metrics: string,
): Promise<PostMetrics> {
  // Urutan percobaan: daftar penuh → tanpa `saved`/`views` (reel menolak keduanya)
  // → `view,` tanpa `views` → fallback tersempit. Jangan lompat langsung ke
  // `reach` saja: kombinasi sempit membuat likes/comments hilang dan dashboard
  // hanya terisi reach.
  const attempts = [
    metrics,
    metrics.replace(",views", ""),
    "reach,likes,comments,shares",
    IG_MEDIA_METRICS_FALLBACK,
  ];
  let result: { data?: MetaInsight[]; error?: string } = { error: "tidak ada percobaan" };
  for (const metric of attempts) {
    result = await requestIgMediaInsights(base, mediaId, token, metric);
    if (!result.error) break;
  }
  if (result.error) throw new Error(`IG insights: ${result.error}`);

  const data = result.data ?? [];
  return {
    // `impressions` TIDAK diisi. Untuk media setelah 2 Juli 2024 metric ini
    // ditolak API ("does not support the impressions metric for this media
    // product type") dan tidak boleh masuk daftar request (satu metric yang
    // ditolak membatalkan seluruh request). Sebelumnya angkanya dipalsukan
    // dengan menyalin `views` — itu menyesatkan: pengguna melihat "impressions"
    // yang isinya persis = views, padahal platform tidak melaporkan impressions
    // per-post sama sekali. Sekarang dibiarkan null dan kartunya ditampilkan
    // "tidak disediakan platform" (lihat POST_METRIC_SUPPORT + metricSupport).
    impressions: metricValue(data, "impressions"),
    reach: metricValue(data, "reach"),
    saves: metricValue(data, "saved") ?? metricValue(data, "saves"),
    likes: metricValue(data, "likes"),
    comments: metricValue(data, "comments"),
    shares: metricValue(data, "shares"),
    views: metricValue(data, "views") ?? metricValue(data, "plays"),
  };
}

/**
 * Account-level insights Instagram (reach, profile_views, website_clicks).
 * Butuh `instagram_manage_insights` (FB Login) / `instagram_business_manage_insights`
 * (IG Login). Sebagian metric ditolak bila akun belum memenuhi syarat (mis. <100 follower)
 * → jangan gagalkan sync, cukup kembalikan apa adanya.
 */
async function igAccountInsights(
  base: string,
  igUserId: string,
  token: string,
): Promise<AccountMetrics> {
  const res = await httpRequest<{ data?: MetaInsight[] }>(`${base}/${igUserId}/insights`, {
    query: { metric: "reach,profile_views,website_clicks", period: "day", access_token: token },
  });
  if (!res.ok) return {};
  const data = (await res.json()).data ?? [];
  return {
    reach: metricValue(data, "reach"),
    profileViews: metricValue(data, "profile_views"),
    websiteClicks: metricValue(data, "website_clicks"),
  };
}

/** Facebook post — reactions + comments summary + shares */
async function facebookPostMetrics(postId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
  }>(`${GRAPH_FB}/${postId}`, {
    query: {
      fields: "reactions.summary(total_count),comments.summary(total_count),shares",
      access_token: token,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FB post: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  return {
    likes: data.reactions?.summary?.total_count ?? null,
    comments: data.comments?.summary?.total_count ?? null,
    shares: data.shares?.count ?? null,
  };
}

// Metric media insights Threads — daftar VALID (docs Threads API, Sep 2026):
// `views`, `likes`, `replies`, `reposts`, `quotes`, `shares`.
// - TIDAK ada `impressions` per-post di Threads (hanya `views`).
// - `replies` = komentar, `reposts` (+ `shares`) = share. Sebelumnya `replies`
//   tidak diminta sama sekali → kartu Komentar & Shares selalu 0.
// Urutan percobaan: daftar penuh → tanpa `quotes`/`shares` (versi API lama) →
// inti → `likes` saja. Jangan langsung ke daftar tersempit: kombinasi sempit
// membuat metrik lain hilang.
const THREADS_MEDIA_METRICS_ATTEMPTS = [
  "views,likes,replies,reposts,quotes,shares",
  "views,likes,replies,reposts",
  "views,likes,replies",
  "likes",
];

/** Threads media insights — views, likes, replies, reposts, quotes, shares */
async function threadsPostMetrics(mediaId: string, token: string): Promise<PostMetrics> {
  let data: MetaInsight[] = [];
  let lastError = "";
  for (const metric of THREADS_MEDIA_METRICS_ATTEMPTS) {
    const res = await httpRequest<{ data?: MetaInsight[] }>(
      `${GRAPH_THREADS}/${mediaId}/insights`,
      { query: { metric, access_token: token } },
    );
    if (res.ok) {
      data = (await res.json()).data ?? [];
      lastError = "";
      break;
    }
    lastError = (await res.text().catch(() => "")).slice(0, 150);
  }
  if (lastError) throw new Error(`Threads media insights: ${lastError}`);

  const reposts = metricValue(data, "reposts");
  const shares = metricValue(data, "shares");
  return {
    views: metricValue(data, "views"),
    likes: metricValue(data, "likes"),
    comments: metricValue(data, "replies"),
    // `reposts` dan `shares` sama-sama "dibagikan" → dijumlahkan bila ada dua-duanya
    shares: reposts === null && shares === null ? null : (reposts ?? 0) + (shares ?? 0),
  };
}

/** TikTok video metrics — query via video/list filter by video_id */
async function tiktokPostMetrics(videoId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    data?: {
      videos?: Array<{
        like_count?: number;
        comment_count?: number;
        share_count?: number;
        view_count?: number;
      }>;
    };
    error?: { message?: string };
  }>(`${TIKTOK_OPEN_API_URL}/video/list/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ filters: [{ video_ids: [videoId] }], max_count: 1 }),
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TikTok video: ${text.slice(0, 150)}`);
  }
  const video = (await res.json()).data?.videos?.[0];
  if (!video) return {};
  return {
    likes: video.like_count ?? null,
    comments: video.comment_count ?? null,
    shares: video.share_count ?? null,
    views: video.view_count ?? null,
  };
}

/** YouTube video statistics (viewCount, likeCount, commentCount) */
async function youtubePostMetrics(videoId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    items?: Array<{
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    }>;
  }>(`${YOUTUBE_API_URL}/videos`, {
    query: { part: "statistics", id: videoId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YT video: ${text.slice(0, 150)}`);
  }
  const stats = (await res.json()).items?.[0]?.statistics;
  if (!stats) return {};
  return {
    views: Number(stats.viewCount) || null,
    likes: Number(stats.likeCount) || null,
    comments: Number(stats.commentCount) || null,
  };
}

/** Bluesky post thread — likeCount, repostCount, replyCount (public XRPC) */
async function blueskyPostMetrics(uri: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    thread?: { post?: { likeCount?: number; repostCount?: number; replyCount?: number } };
  }>(`${BSKY_APPVIEW_URL}/xrpc/app.bsky.feed.getPostThread`, {
    query: { uri },
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bluesky thread: ${text.slice(0, 150)}`);
  }
  const p = (await res.json()).thread?.post;
  if (!p) return {};
  return {
    likes: p.likeCount ?? null,
    shares: p.repostCount ?? null,
    comments: p.replyCount ?? null,
  };
}

/**
 * LinkedIn socialActions — likes + comments per-post (urn:li:share:* / ugcPost:*).
 * Pakai endpoint single-entity `/{urn}`, BUKAN `?ids=List(...)`, karena:
 * - respons batch memakai key `results` yang di-key URN (bukan `elements`)
 * - BATCH_GET tidak didukung di Development tier Community Management API
 * Post tanpa social action mengembalikan objek kosong — bukan error.
 *
 * Bila ownerUrn (organizationalEntity) tersedia, ALSO fetch impressions/clicks/shares
 * via organizationalEntityShareStatistics — endpoint ini memberikan metrik komprehensif
 * yang tidak tersedia di socialActions.
 */
async function linkedinPostMetrics(
  postUrn: string,
  token: string,
  ownerUrn?: string,
): Promise<PostMetrics> {
  // 1. Social actions: likes + comments
  const actionsRes = await httpRequest<{
    likesSummary?: { totalLikes?: number };
    commentsSummary?: { aggregatedTotalComments?: number };
  }>(`${LINKEDIN_REST_URL}/rest/socialActions/${encodeURIComponent(postUrn)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  let likes: number | null = null;
  let comments: number | null = null;
  if (actionsRes.ok) {
    const data = await actionsRes.json();
    likes = data.likesSummary?.totalLikes ?? null;
    comments = data.commentsSummary?.aggregatedTotalComments ?? null;
  }

  // 2. Share statistics (impressions, clicks, shares) — requires organizationalEntity
  //    Only available for organization pages with r_organization_social scope
  if (ownerUrn?.startsWith("urn:li:organization:")) {
    try {
      const statsRes = await httpRequest<{
        elements?: Array<{
          totalShareStatistics?: {
            impressionCount?: number;
            uniqueImpressionsCount?: number;
            clickCount?: number;
            shareCount?: number;
            likeCount?: number;
            commentCount?: number;
          };
        }>;
      }>(
        `${LINKEDIN_REST_URL}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(ownerUrn)}&shares=List(${encodeURIComponent(postUrn)})`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "LinkedIn-Version": LINKEDIN_API_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );
      if (statsRes.ok) {
        const stats = (await statsRes.json()).elements?.[0]?.totalShareStatistics;
        if (stats) {
          return {
            likes: stats.likeCount ?? likes,
            comments: stats.commentCount ?? comments,
            impressions: stats.impressionCount ?? null,
            reach: stats.uniqueImpressionsCount ?? null,
            shares: stats.shareCount ?? null,
            websiteClicks: stats.clickCount ?? null,
          };
        }
      }
    } catch {
      // Share statistics endpoint may fail for personal posts or missing scope — fallback to socialActions only
    }
  }

  return { likes, comments };
}

/**
 * Metrik post akun bridge via Repliz Content statistic
 * (GET /public/content/{contentId}/statistic). Field response bervariasi per
 * platform (FB: like/comment/share; IG: + reach/saved/views/interaction;
 * Threads: replies/repost/quotes — TIDAK ada `comment`/`share`). Field paralel
 * di-fallback agar metrik Threads tidak null; hanya field dikenali yang dipetakan.
 */
export async function replizPostMetrics(
  contentId: string,
  replizAccountId: string,
): Promise<PostMetrics> {
  const cred = await replizActiveCredentials();
  if (!cred) return {};
  const s: ReplizContentStatistic = await replizGetContentStatistic(
    cred,
    contentId,
    replizAccountId,
  );
  return {
    likes: s.like ?? s.favourite ?? null,
    // Threads menyebut komentar "replies"; FB/IG pakai "comment"
    comments: s.comment ?? s.replies ?? null,
    // repost = share-nya Threads; YouTube/Twitter pakai retweet/share
    shares: s.share ?? s.repost ?? s.retweet ?? null,
    saves: s.saved ?? s.bookmark ?? null,
    views: s.views ?? s.watched ?? null,
    reach: s.reach ?? null,
    impressions: s.impression ?? null,
  };
}
