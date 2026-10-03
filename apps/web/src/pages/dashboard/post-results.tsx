// Halaman Hasil Post — performa semua post yang sudah tayang per platform
// (views, likes, comments, shares, engagement rate). Memakai endpoint
// /analytics/top-posts yang sudah ter-agregat (snapshot post_analytics terbaru).
//
// Layout grid dgn thumbnail media (seperti profil sosmed) — lebih mudah
// mengenali post secara visual dibanding list teks. Klik kartu → modal detail
// (teks lengkap + gambar/video + metrik) untuk SEMUA platform.
//
// Sumber data: tabel `post` (post yang diterbitkan lewat app + hasil impor
// posts-sync dari platform). Post Threads masuk lewat posts-sync
// (`GET /{threads-user-id}/threads`) sehingga tampil di grid yang sama.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ExternalLink,
  Eye,
  Heart,
  ImageIcon,
  Loader2,
  MessageCircle,
  Play,
  RefreshCw,
  Share2,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCompact, formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { queryKeys } from "../../lib/query-keys";
import { buildSyncToast, type SyncResponse } from "./posts-sync-types";

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
  platformPostId: string | null;
  isBridge: boolean;
  /** Server (GET /analytics/top-posts) menghitung ini: platform mendukung
   *  hapus-otomatis, atau akun bridge Repliz. Jangan hitung sendiri di sini. */
  canDelete: boolean;
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

/**
 * Penjelasan khusus per platform saat grid kosong. Pesan generik ("belum ada post
 * yang diterbitkan") MENYESATKAN untuk platform yang kosongnya bukan karena user
 * belum posting — TikTok (hanya video publik), LinkedIn (izin baca partner-only),
 * dan Pinterest (dilarang disimpan oleh Developer Guidelines Pinterest).
 */
const EMPTY_PLATFORM_NOTE: Partial<Record<string, string>> = {
  tiktok:
    "TikTok hanya mengembalikan video yang bersifat publik. Selama akun TikTok masih mode privat — yang wajib dipakai sampai aplikasi lulus audit Content Posting API — daftar ini memang akan kosong. Ini perilaku resmi TikTok, bukan kegagalan sinkronisasi.",
  linkedin:
    "LinkedIn tidak menyediakan izin baca untuk post pribadi — daftar post sendiri hanya tersedia lewat API partner (partnerApiPostsExternal) yang tidak diberikan ke aplikasi biasa. Karena itu grid ini hanya berisi post yang diterbitkan lewat Sahabat Kreator.",
  pinterest:
    "Pin Pinterest sengaja tidak disimpan di database — Developer Guidelines Pinterest melarang menyimpan data apa pun dari API-nya (kecuali analitik kampanye akun sendiri). Data pin ditampilkan on-demand di panel Pinterest pada halaman Analitik.",
};

// "Terbaru" ditaruh pertama karena itu urutan default — pilihan yang sedang
// aktif harus langsung terlihat tanpa harus menggeser deretan tombol.
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Terbaru" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Komentar" },
  { key: "engagement", label: "Engagement" },
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

/**
 * Kartu post di grid.
 *
 * `rank` = peringkat performa (1 = teratas). Dikirim `null` saat daftar
 * diurutkan "Terbaru", karena pada urutan itu nomor peringkat tidak bermakna.
 */
function PostCard({
  post,
  rank,
  onOpen,
}: {
  post: TopPost;
  rank: number | null;
  onOpen: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  // Hapus post terbit dari platform (bridge Repliz only — hapus permanen di
  // sisi platform, tidak bisa di-undo).
  const deletePlatformPost = useMutation({
    mutationFn: () => api.delete(`/posts/item/${post.postId}/published`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.postResults });
      toast.success("Post dihapus di platform");
      setConfirming(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirming(false);
    },
  });
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
          // Thumbnail (gambar atau poster video) diklik → modal detail.
          // Video tetap `preload="none"` supaya grid tetap ringan.
          <button
            type="button"
            onClick={onOpen}
            className="group/play absolute inset-0 h-full w-full cursor-pointer"
            aria-label="Lihat detail post"
          >
            <img
              src={post.media?.url}
              alt={post.content?.slice(0, 80) ?? "Post"}
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
            {isVideo && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/play:bg-black/25">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 backdrop-blur">
                  <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                </span>
              </span>
            )}
          </button>
        ) : (
          // Post teks-only — tampilkan isi caption (bukan ikon saja) agar
          // post dikenali; watermark ikon platform sebagai identitas.
          // Bisa diklik juga → detail (mis. post Threads text-only).
          <button
            type="button"
            onClick={onOpen}
            className="absolute inset-0 flex w-full cursor-pointer items-center justify-center p-5 text-left"
            aria-label="Lihat detail post"
          >
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
          </button>
        )}

        {/* Badge video play (indikator sekunder — tombol utama overlay di atas) */}
        {isVideo && !showMedia && (
          <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur">
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </div>
        )}

        {/* Peringkat performa — hanya saat diurutkan berdasarkan metrik */}
        {rank !== null && (
          <div className="absolute top-2 left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/60 px-1.5 font-semibold text-[11px] text-white backdrop-blur">
            {rank}
          </div>
        )}

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
              className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-gold)] hover:underline"
              aria-label="Buka post di platform"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Hapus post di platform. Syaratnya `canDelete` dari server (platform
              mendukung hapus-otomatis, atau akun bridge Repliz) — bukan lagi
              `isBridge` saja, karena tidak ada satu pun akun bridge di org ini
              sehingga tombolnya dulu tidak pernah muncul untuk post apa pun.
              Konfirmasi inline karena tindakan permanen di platform. */}
          {post.canDelete && post.platformPostId && (
            <div className="ml-auto flex items-center">
              {confirming ? (
                <>
                  <button
                    type="button"
                    onClick={() => deletePlatformPost.mutate()}
                    disabled={deletePlatformPost.isPending}
                    className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 font-medium text-[10px] text-red-600 hover:bg-red-500/25 disabled:opacity-40"
                  >
                    {deletePlatformPost.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Yakin?
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="ml-1 text-[10px] text-[var(--text-muted)] hover:underline"
                  >
                    Batal
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                  aria-label="Hapus post di platform"
                  title="Hapus post di platform (permanen)"
                >
                  <Trash2 className="h-3 w-3" />
                  Hapus
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Modal detail post — teks lengkap, gambar/video, dan metrik.
 *
 * Dipakai SEMUA platform (termasuk post Threads hasil impor) supaya cara
 * melihat detail konsisten: klik kartu mana pun → detail. Video dimuat hanya
 * saat modal dibuka (`preload="none"`), jadi grid tetap ringan.
 */
function PostDetailModal({ post, onClose }: { post: TopPost; onClose: () => void }) {
  const cfg = PLATFORMS[post.platform as keyof typeof PLATFORMS];
  const Icon = cfg?.icon;
  const isVideo = post.media?.type === "video";
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
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl animate-fade-in flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-primary)] shadow-2xl">
        {/* Kepala: akun + platform + tanggal */}
        <div className="flex items-start justify-between gap-3 border-[var(--border-light)] border-b p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {post.avatarUrl ? (
              <img
                src={post.avatarUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              Icon && (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                  <Icon className="h-4 w-4" style={{ color: cfg?.color }} />
                </span>
              )
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-sm">
                {post.displayName || post.username || "—"}
              </p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">
                {cfg?.label ?? post.platform}
                {post.username && ` · @${post.username}`}
                {post.publishedAt && ` · ${formatDate(post.publishedAt, "long")}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-3.5 w-3.5" /> Tutup
          </button>
        </div>

        {/* Media */}
        {isVideo && videoUrl ? (
          <video
            key={videoUrl}
            src={videoUrl}
            poster={post.media?.url}
            controls
            autoPlay
            preload="none"
            playsInline
            className="max-h-[50vh] w-full bg-black"
          >
            {/* Track placeholder — platform tidak menyertakan transkrip; wajib
                ada untuk a11y (biome). */}
            <track kind="captions" />
          </video>
        ) : post.media ? (
          <img
            src={post.media.url}
            alt={post.content?.slice(0, 80) ?? "Post"}
            className="max-h-[50vh] w-full bg-black object-contain"
          />
        ) : (
          <div className="flex items-center justify-center bg-[var(--bg-tertiary)] px-6 py-10 text-center text-[var(--text-muted)] text-sm italic">
            Post ini tidak punya media (text-only)
          </div>
        )}

        {/* Teks lengkap + metrik */}
        <div className="space-y-3 overflow-y-auto p-4">
          {post.content ? (
            <p className="whitespace-pre-wrap text-[var(--text-primary)] text-sm">{post.content}</p>
          ) : (
            <p className="text-[var(--text-muted)] text-sm italic">(post tanpa teks)</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-[var(--border-light)] border-t pt-3 text-[var(--text-secondary)] text-xs">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {formatCompact(post.views)} views
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" /> {formatCompact(post.likes)} likes
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" /> {formatCompact(post.comments)} komentar
            </span>
            <span className="inline-flex items-center gap-1">
              <Share2 className="h-3.5 w-3.5" /> {formatCompact(post.shares)} share
            </span>
            {post.engagementRate !== null && (
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> {post.engagementRate}% engage
              </span>
            )}
          </div>
        </div>

        {post.platformPostUrl && (
          <div className="border-[var(--border-light)] border-t p-4">
            <a
              href={post.platformPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[var(--accent-gold)] text-sm hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Buka post di {cfg?.label ?? post.platform}
            </a>
          </div>
        )}
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
  // Urutan default "recent" (terbaru lebih dulu): grid ini dipakai untuk
  // memeriksa post yang baru tayang — mis. memastikan hasil publikasi terakhir
  // benar — sehingga post terbaru harus langsung terlihat tanpa mengganti
  // urutan. Pengurutan performa (views/likes) tetap tersedia sebagai pilihan.
  const [sort, setSort] = useState<SortKey>("recent");
  // Post yang detailnya sedang dibuka (null = tertutup)
  const [detail, setDetail] = useState<TopPost | null>(null);
  const queryClient = useQueryClient();

  // Import manual konten yang dipublikasikan langsung di platform (termasuk
  // Threads) → muncul di grid ini. Server sekaligus menyegarkan METRIK
  // (views/likes/komentar/share) untuk org ini, jadi satu klik menuntaskan
  // konten + angka. Worker juga sinkron otomatis; tombol ini untuk yang ingin
  // segera tanpa menunggu siklus berikutnya.
  const syncPosts = useMutation({
    mutationFn: () => api.post<SyncResponse>("/posts/sync", {}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.postResults });
      // Angka metrik ikut berubah → halaman Analitik juga harus refetch.
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsOverview });
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsTimeseries });
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsTopPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsHashtags });

      // Pesan disusun `buildSyncToast` (dipakai juga oleh Kalender): konten dan
      // metrik dilaporkan terpisah, dan kuota API yang habis punya nada
      // peringatan sendiri supaya tidak disangka aplikasinya rusak.
      const notice = buildSyncToast(res);
      if (notice.kind === "warning") {
        toast.warning(notice.message, { description: notice.description });
      } else {
        toast.success(notice.message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ambil SEMUA post sekali, filter platform client-side. Filter server-side
  // menyebabkan daftar platform ikut tersaring → tombol platform lain hilang
  // begitu salah satu dipilih.
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.postResults,
    queryFn: () => api.get<TopPostsResponse>("/analytics/top-posts?limit=200"),
    // Angka engagement bisa berubah saat analytics sync — refresh berkala
    refetchInterval: 60_000,
  });

  // Daftar akun terhubung — chip platform di-derive dari sini (bukan hanya
  // dari post yg ada) agar SEMUA platform terhubung muncul, meski belum ada
  // post tayang. Platform tanpa post → filter menampilkan empty state.
  const { data: accountsData } = useQuery({
    queryKey: queryKeys.accounts,
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
      ...(accountsData?.accounts ?? []).filter((a) => a.isConnected).map((a) => a.platform),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl">Hasil Post</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Performa post yang sudah tayang — views, likes, komentar, dan engagement rate per
            platform
          </p>
        </div>
        {/* Sinkron manual: tarik konten yang dipublikasikan langsung di platform
            (IG, FB, YouTube, Threads) ke grid ini. Berlaku untuk semua platform
            sekaligus — bukan tombol khusus satu platform. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncPosts.mutate()}
          disabled={syncPosts.isPending}
          title="Impor konten yang dipublikasikan langsung di platform (90 hari terakhir)"
        >
          {syncPosts.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sinkron Platform
        </Button>
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

      {/* Slot hasil. `min-h` menjaga tinggi halaman tetap stabil saat filter
          platform berpindah — tanpa itu, pindah dari platform berisi banyak post
          ke platform kosong membuat dokumen menyusut di bawah posisi scroll dan
          browser "melompat" ke atas. */}
      <div className="min-h-[360px]">
        {isLoading ? (
          <PageLoader />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-10 w-10" />}
            title={
              platform !== "all" ? "Belum ada post untuk platform ini" : "Belum ada post tayang"
            }
            description={
              platform !== "all"
                ? (EMPTY_PLATFORM_NOTE[platform] ??
                  `Akun ${PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform} sudah terhubung, tapi belum ada post yang diterbitkan melalui platform ini.`)
                : "Hasil post muncul di sini setidaknya satu post berhasil diterbitkan dan analytics-nya tersinkron."
            }
          />
        ) : (
          // Grid responsif: 2 kolom mobile → 5 kolom layar besar.
          //
          // Peringkat (badge angka) HANYA bermakna saat diurutkan berdasarkan
          // performa: "1" berarti paling banyak views/likes. Pada urutan
          // "Terbaru" angkanya cuma nomor baris dan bisa menyesatkan (post
          // terbaru berlabel 1 seolah paling bagus) — jadi badge-nya disembunyikan.
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {posts.map((p, index) => (
              <PostCard
                key={p.postId}
                post={p}
                rank={sort === "recent" ? null : index + 1}
                onOpen={() => setDetail(p)}
              />
            ))}
          </div>
        )}
      </div>

      {posts.length > 0 && (
        <p className="text-[var(--text-muted)] text-xs">
          {posts.length} post · {withMedia} dengan media · metrik diperbarui otomatis setiap 1 menit
        </p>
      )}

      {/* Modal detail — elemen <video> hanya ada di DOM saat detail !== null,
          sehingga tidak ada byte video yang dimuat untuk grid */}
      {detail && <PostDetailModal post={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
