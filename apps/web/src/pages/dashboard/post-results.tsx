// Halaman Hasil Post — performa semua post yang sudah tayang per platform
// (views, likes, comments, shares, engagement rate). Memakai endpoint
// /analytics/top-posts yang sudah ter-agregat (snapshot post_analytics terbaru).
//
// Layout grid dgn thumbnail media (seperti profil sosmed) — lebih mudah
// mengenali post secara visual dibanding list teks.
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ExternalLink,
  Eye,
  Heart,
  ImageIcon,
  MessageCircle,
  Play,
  Share2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCompact, formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";

type PostMedia = {
  url: string;
  type: "image" | "video";
  /** URL video asli — hanya dimuat saat lightbox dibuka (preload none) */
  videoUrl: string | null;
};

type TopPost = {
  postId: string;
  platform: string;
  content: string;
  platformPostUrl: string | null;
  publishedAt: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  impressions: number;
  reach: number;
  engagement: number;
  engagementRate: number | null;
  media: PostMedia | null;
};

type TopPostsResponse = { posts: TopPost[] };

type SortKey = "views" | "likes" | "comments" | "engagement" | "recent";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Komentar" },
  { key: "engagement", label: "Engagement" },
  { key: "recent", label: "Terbaru" },
];

function sortPosts(posts: TopPost[], sort: SortKey): TopPost[] {
  const value = (p: TopPost): number => {
    switch (sort) {
      case "views":
        return p.views;
      case "likes":
        return p.likes;
      case "comments":
        return p.comments;
      case "engagement":
        return p.engagement;
      case "recent":
        return p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
    }
  };
  return [...posts].sort((a, b) => value(b) - value(a));
}

function PostCard({ post, rank, onPlay }: { post: TopPost; rank: number; onPlay: () => void }) {
  const cfg = PLATFORMS[post.platform as keyof typeof PLATFORMS];
  const Icon = cfg?.icon;
  const isVideo = post.media?.type === "video";
  // Media bisa null (post teks) atau URL-nya kedaluwarsa — fallback ke teks.
  const [imgError, setImgError] = useState(false);
  const showMedia = post.media !== null && !imgError;

  return (
    <div className="card group overflow-hidden">
      {/* Thumbnail media (rasio 1:1 seperti grid sosmed) atau caption post */}
      <div className="relative aspect-square bg-[var(--bg-tertiary)]">
        {showMedia ? (
          isVideo ? (
            // Video: thumbnail bisa diklik → lightbox memuat video asli
            // (preload="none") hanya saat dibuka. Grid tetap ringan.
            <button
              type="button"
              onClick={onPlay}
              className="group/play absolute inset-0 h-full w-full cursor-pointer"
              aria-label="Putar video"
            >
              <img
                src={post.media?.url}
                alt={post.content?.slice(0, 80) ?? "Post"}
                loading="lazy"
                onError={() => setImgError(true)}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/play:bg-black/25">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 backdrop-blur">
                  <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                </span>
              </span>
            </button>
          ) : (
            <img
              src={post.media?.url}
              alt={post.content?.slice(0, 80) ?? "Post"}
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          // Post teks-only — tampilkan isi caption (bukan ikon saja) agar
          // post dikenali; watermark ikon platform sebagai identitas.
          <div className="absolute inset-0 flex items-center justify-center p-5">
            {Icon && (
              <Icon
                className="pointer-events-none absolute inset-0 m-auto h-24 w-24 opacity-[0.08]"
                style={{ color: cfg?.color }}
                aria-hidden
              />
            )}
            <p className="relative z-10 line-clamp-5 text-center font-medium text-[var(--text-secondary)] text-sm">
              {post.content || "(media saja)"}
            </p>
          </div>
        )}

        {/* Badge video play (indikator sekunder — tombol utama overlay di atas) */}
        {isVideo && !showMedia && (
          <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur">
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </div>
        )}

        {/* Peringkat */}
        <div className="absolute top-2 left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/60 px-1.5 font-semibold text-[11px] text-white backdrop-blur">
          {rank}
        </div>

        {/* Platform badge */}
        {Icon && (
          <div className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur">
            <Icon className="h-3.5 w-3.5" style={{ color: cfg?.color }} />
          </div>
        )}

        {/* Engagement rate overlay */}
        {post.engagementRate !== null && (
          <div className="absolute right-2 bottom-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold text-[10px] backdrop-blur",
                post.engagementRate >= 5
                  ? "bg-emerald-500/90 text-white"
                  : "bg-black/60 text-white",
              )}
            >
              {post.engagementRate}% engage
            </span>
          </div>
        )}
      </div>

      {/* Konten + metrik */}
      <div className="p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-[var(--text-primary)] text-xs">
          {post.content || "(media saja)"}
        </p>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
          @{post.username ?? "—"}
          {post.publishedAt && ` · ${formatDate(post.publishedAt, "short")}`}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-[var(--border-light)] border-t pt-2.5">
          <span
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"
            title="Views"
          >
            <Eye className="h-3 w-3" />
            {formatCompact(post.views)}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"
            title="Likes"
          >
            <Heart className="h-3 w-3" />
            {formatCompact(post.likes)}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"
            title="Komentar"
          >
            <MessageCircle className="h-3 w-3" />
            {formatCompact(post.comments)}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"
            title="Share"
          >
            <Share2 className="h-3 w-3" />
            {formatCompact(post.shares)}
          </span>
          {post.saves > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"
              title="Saves"
            >
              <TrendingUp className="h-3 w-3" />
              {formatCompact(post.saves)}
            </span>
          )}
          {post.platformPostUrl && (
            <a
              href={post.platformPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--accent-gold)] hover:underline"
              aria-label="Buka post di platform"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lightbox video — memuat video asli hanya saat dibuka (preload="none"),
 * sehingga grid 50 post tetap ringan. Auto-cleanup saat ditutup. */
function VideoLightbox({ post, onClose }: { post: TopPost; onClose: () => void }) {
  const cfg = PLATFORMS[post.platform as keyof typeof PLATFORMS];
  const Icon = cfg?.icon;
  const videoUrl = post.media?.videoUrl;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-3xl animate-fade-in space-y-3">
        {videoUrl ? (
          <video
            key={videoUrl}
            src={videoUrl}
            controls
            autoPlay
            preload="none"
            playsInline
            className="max-h-[72vh] w-full rounded-[var(--radius-lg)] bg-black"
          >
            {/* Track placeholder — platform umumnya tidak sertakan caption
                transkrip; wajib ada untuk a11y (biome). */}
            <track kind="captions" />
          </video>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-sm">
            Video tidak tersedia
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="line-clamp-2 text-sm text-white/90">{post.content}</p>
          <div className="flex shrink-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4" style={{ color: cfg?.color }} />}
            {post.platformPostUrl && (
              <a
                href={post.platformPostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white/70 text-xs hover:text-white hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Buka di platform
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 text-white/70 text-xs hover:text-white"
            >
              <X className="h-3.5 w-3.5" /> Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostResultsPage() {
  useSeo({
    title: "Hasil Post",
    path: "/post-results",
    noIndex: true,
  });

  const [platform, setPlatform] = useState<string>("all");
  const [account, setAccount] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("views");
  // Post video yang sedang diputar di lightbox (null = tertutup)
  const [playing, setPlaying] = useState<TopPost | null>(null);

  // Ambil SEMUA post sekali, filter platform client-side. Filter server-side
  // menyebabkan daftar platform ikut tersaring → tombol platform lain hilang
  // begitu salah satu dipilih.
  const { data, isLoading } = useQuery({
    queryKey: ["post-results"],
    queryFn: () => api.get<TopPostsResponse>("/analytics/top-posts?limit=50"),
    // Angka engagement bisa berubah saat analytics sync — refresh berkala
    refetchInterval: 60_000,
  });

  // Daftar akun terhubung — chip platform di-derive dari sini (bukan hanya
  // dari post yg ada) agar SEMUA platform terhubung muncul, meski belum ada
  // post tayang. Platform tanpa post → filter menampilkan empty state.
  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<{ accounts: { platform: string; isConnected: boolean }[] }>("/accounts"),
    staleTime: 5 * 60 * 1000,
  });

  const allPosts = data?.posts ?? [];

  // Daftar akun stabil dari dataset lengkap (username unik per org).
  // Avatar + nama untuk chip filter; hanya akun yang punya post tayang.
  const accounts = useMemo(() => {
    const map = new Map<
      string,
      { username: string; displayName: string | null; avatarUrl: string | null; platform: string }
    >();
    for (const p of allPosts) {
      if (!p.username || map.has(p.username)) continue;
      map.set(p.username, {
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        platform: p.platform,
      });
    }
    return [...map.values()];
  }, [allPosts]);

  const posts = sortPosts(
    allPosts.filter(
      (p) =>
        (platform === "all" || p.platform === platform) &&
        (account === "all" || p.username === account),
    ),
    sort,
  );

  // Daftar platform filter stabil — gabungan platform dari akun TERHUBUNG
  // (agar semua platform muncul meski belum ada post) + platform yg punya
  // post (mis. post impor/eksternal dari akun yg sudah dihapus). Diambil dari
  // data lengkap, bukan hasil filter, agar tombol tidak pernah hilang saat
  // salah satu dipilih.
  const availablePlatforms = [
    ...new Set<string>([
      ...(accountsData?.accounts ?? [])
        .filter((a) => a.isConnected)
        .map((a) => a.platform),
      ...allPosts.map((p) => p.platform),
    ]),
  ].sort((a, b) => {
    // Urut sesuai urutan definisi PLATFORMS, platform asing di belakang.
    const order = Object.keys(PLATFORMS);
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  // Ringkasan agregat untuk tampilan saat ini (mencocokkan grid yang terlihat)
  const totals = posts.reduce(
    (acc, p) => {
      acc.views += p.views;
      acc.engagement += p.engagement;
      return acc;
    },
    { views: 0, engagement: 0 },
  );
  const avgEngagementRate =
    posts.length > 0
      ? posts.reduce((sum, p) => sum + (p.engagementRate ?? 0), 0) / posts.length
      : null;
  const withMedia = posts.filter((p) => p.media !== null).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Hasil Post</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Performa post yang sudah tayang — views, likes, komentar, dan engagement rate per platform
        </p>
      </div>

      {/* Ringkasan */}
      {!isLoading && allPosts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
              <Eye className="h-3.5 w-3.5" /> Total Views
            </div>
            <p className="mt-1.5 font-bold text-xl">{formatCompact(totals.views)}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
              <TrendingUp className="h-3.5 w-3.5" /> Total Engagement
            </div>
            <p className="mt-1.5 font-bold text-xl">{formatCompact(totals.engagement)}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
              <BarChart3 className="h-3.5 w-3.5" /> Rata-rata Engage
            </div>
            <p className="mt-1.5 font-bold text-xl">
              {avgEngagementRate !== null ? `${avgEngagementRate.toFixed(2)}%` : "-"}
            </p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
              <ImageIcon className="h-3.5 w-3.5" /> Post Tayang
            </div>
            <p className="mt-1.5 font-bold text-xl">{posts.length}</p>
          </div>
        </div>
      )}

      {/* Filter akun — avatar + nama, hanya akun yg punya post tayang */}
      {accounts.length > 1 && (
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setAccount("all")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium text-sm transition-colors",
              account === "all"
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
            )}
          >
            Semua akun
          </button>
          {accounts.map((a) => {
            const cfg = PLATFORMS[a.platform as keyof typeof PLATFORMS];
            return (
              <button
                type="button"
                key={a.username}
                onClick={() => setAccount(a.username)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 font-medium text-sm transition-colors",
                  account === a.username
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
                )}
              >
                {a.avatarUrl ? (
                  <img
                    src={a.avatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full font-semibold text-[10px] text-white"
                    style={{ backgroundColor: cfg?.color ?? "#888" }}
                  >
                    {(a.displayName || a.username).slice(0, 1).toUpperCase()}
                  </span>
                )}
                {a.displayName || a.username}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter platform + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setPlatform("all")}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 font-medium text-sm transition-colors",
              platform === "all"
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
            )}
          >
            Semua
          </button>
          {availablePlatforms.map((p) => {
            const cfg = PLATFORMS[p as keyof typeof PLATFORMS];
            if (!cfg) return null;
            return (
              <button
                type="button"
                key={p}
                onClick={() => setPlatform(p)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 font-medium text-sm transition-colors",
                  platform === p
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
                )}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[var(--text-muted)] text-xs">Urutkan</span>
          <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 font-medium text-xs transition-colors",
                  sort === opt.key
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title={platform !== "all" ? "Belum ada post untuk platform ini" : "Belum ada post tayang"}
          description={
            platform !== "all"
              ? `Akun ${PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform} sudah terhubung, tapi belum ada post yang diterbitkan melalui platform ini.`
              : "Hasil post muncul di sini setidaknya satu post berhasil diterbitkan dan analytics-nya tersinkron."
          }
        />
      ) : (
        // Grid responsif: 2 kolom mobile → 5 kolom layar besar
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {posts.map((p, index) => (
            <PostCard key={p.postId} post={p} rank={index + 1} onPlay={() => setPlaying(p)} />
          ))}
        </div>
      )}

      {posts.length > 0 && (
        <p className="text-[var(--text-muted)] text-xs">
          {posts.length} post · {withMedia} dengan media · metrik diperbarui otomatis setiap 1 menit
        </p>
      )}

      {/* Video lightbox — element <video> hanya ada di DOM saat playing !== null,
          sehingga tidak ada byte video yang dimuat untuk grid */}
      {playing && <VideoLightbox post={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
