// Panel "Post Threads Saya" — menarik daftar post MILIK akun Threads sendiri
// langsung dari Threads API (`GET /{threads-user-id}/threads`), bukan dari
// tabel `post` aplikasi.
//
// Mengapa terpisah dari grid "Hasil Post" di atasnya: grid itu hanya berisi
// post yang **diterbitkan lewat aplikasi ini** (punya row `post` + snapshot
// analytics). Post yang dibuat langsung di app Threads tidak punya row apa pun
// di DB, sehingga tidak akan pernah muncul di grid — padahal itu bagian dari
// "post milik user". Panel ini menutup celah tersebut.
//
// Setiap baris bisa dibuka detailnya: teks lengkap, gambar, video (diputar
// inline), carousel, alt text, dan tautan asli ke Threads.
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ExternalLink,
  FileText,
  ImageIcon,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type ThreadsAccount = {
  id: string;
  platform: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isConnected: boolean;
};

type ThreadsMediaChild = {
  id?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  alt_text?: string;
};

/** Bentuk objek post Threads (subset field yang dipakai UI) */
type ThreadsOwnPost = {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  alt_text?: string;
  topic_tag?: string;
  is_reply?: boolean;
  children?: { data?: ThreadsMediaChild[] };
};

type MyPostsResponse = {
  accountId: string;
  username: string | null;
  posts: ThreadsOwnPost[];
  nextCursor: string | null;
};

/** Media yang sudah dinormalkan agar seragam antara post tunggal & carousel */
type MediaItem = {
  url: string;
  type: "image" | "video";
  /** Poster video (kalau ada) — dipakai sebagai thumbnail + atribut `poster` */
  poster: string | null;
  alt: string | null;
};

function toMediaItem(item: {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  alt_text?: string;
}): MediaItem | null {
  if (!item.media_url) return null;
  if (item.media_type === "VIDEO") {
    return {
      url: item.media_url,
      type: "video",
      poster: item.thumbnail_url ?? null,
      alt: item.alt_text ?? null,
    };
  }
  if (item.media_type === "IMAGE") {
    return { url: item.media_url, type: "image", poster: null, alt: item.alt_text ?? null };
  }
  // AUDIO / tipe lain tidak bisa dirender inline — cukup tampil sebagai teks.
  return null;
}

/** Semua media sebuah post: item carousel bila ada, kalau tidak post itu sendiri */
function toMediaItems(post: ThreadsOwnPost): MediaItem[] {
  const children = post.children?.data ?? [];
  if (post.media_type === "CAROUSEL_ALBUM" && children.length > 0) {
    return children.map((child) => toMediaItem(child)).filter((m): m is MediaItem => m !== null);
  }
  const single = toMediaItem(post);
  return single ? [single] : [];
}

function typeBadge(mediaType?: string): { label: string; icon: LucideIcon } {
  switch (mediaType) {
    case "IMAGE":
      return { label: "Gambar", icon: ImageIcon };
    case "VIDEO":
      return { label: "Video", icon: Play };
    case "CAROUSEL_ALBUM":
      return { label: "Carousel", icon: Layers };
    case "AUDIO":
      return { label: "Audio", icon: Play };
    default:
      return { label: "Teks", icon: FileText };
  }
}

/** Lightbox detail post — teks, gambar, dan video dalam satu tampilan */
function PostDetailModal({ post, onClose }: { post: ThreadsOwnPost; onClose: () => void }) {
  const media = toMediaItems(post);
  const badge = typeBadge(post.media_type);
  const BadgeIcon = badge.icon;

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
        {/* Header detail */}
        <div className="flex items-start justify-between gap-3 border-[var(--border-light)] border-b p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[11px] text-[var(--text-secondary)]">
                <BadgeIcon className="h-3 w-3" />
                {badge.label}
              </span>
              {post.is_reply && (
                <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[11px] text-[var(--text-secondary)]">
                  Balasan
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate font-semibold text-sm">
              Detail post Threads
              {post.username ? ` · @${post.username}` : ""}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {post.timestamp ? formatDate(post.timestamp, "long") : "—"} · ID {post.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-3.5 w-3.5" /> Tutup
          </button>
        </div>

        {/* Isi detail (scrollable) */}
        <div className="space-y-4 overflow-y-auto p-4">
          {/* Teks post */}
          <div>
            <p className="mb-1 font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide">
              Teks
            </p>
            {post.text ? (
              <p className="whitespace-pre-wrap text-[var(--text-primary)] text-sm">{post.text}</p>
            ) : (
              <p className="text-[var(--text-muted)] text-sm italic">(post tanpa teks)</p>
            )}
            {post.topic_tag && (
              <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                Topik: {post.topic_tag}
              </p>
            )}
          </div>

          {/* Media: gambar + video */}
          <div>
            <p className="mb-1 font-medium text-[11px] text-[var(--text-muted)] uppercase tracking-wide">
              Media ({media.length})
            </p>
            {media.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm italic">
                Post ini tidak punya media (text-only).
              </p>
            ) : (
              <div
                className={cn("grid gap-2", media.length > 1 ? "sm:grid-cols-2" : "grid-cols-1")}
              >
                {media.map((m, i) =>
                  m.type === "video" ? (
                    <video
                      key={m.url}
                      src={m.url}
                      poster={m.poster ?? undefined}
                      controls
                      preload="metadata"
                      playsInline
                      className="max-h-[52vh] w-full rounded-[var(--radius-md)] bg-black"
                    >
                      {/* Track placeholder — Threads tidak menyertakan transkrip */}
                      <track kind="captions" />
                    </video>
                  ) : (
                    <img
                      key={m.url}
                      src={m.url}
                      alt={m.alt ?? `Media ${i + 1}`}
                      loading="lazy"
                      className="max-h-[52vh] w-full rounded-[var(--radius-md)] object-contain"
                    />
                  ),
                )}
              </div>
            )}
            {media.some((m) => m.alt) && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Alt text:{" "}
                {media
                  .map((m) => m.alt)
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>

        {/* Footer: buka di Threads */}
        {post.permalink && (
          <div className="border-[var(--border-light)] border-t p-4">
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[var(--accent-gold)] text-sm hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Buka post di Threads
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Panel daftar post Threads milik sendiri.
 *
 * Tidak merender apa pun bila org tidak punya akun Threads terhubung, sehingga
 * aman dipasang di halaman umum.
 */
export function ThreadsOwnPostsPanel() {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadsOwnPost | null>(null);

  // Pakai queryKey yang sama dengan halaman induk → tidak ada request ganda.
  const { data: accountsData } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<{ accounts: ThreadsAccount[] }>("/accounts"),
    staleTime: 5 * 60 * 1000,
  });

  const threadsAccounts = useMemo(
    () => (accountsData?.accounts ?? []).filter((a) => a.platform === "threads" && a.isConnected),
    [accountsData],
  );

  // Default ke akun Threads pertama; bila pilihan lama sudah tidak ada
  // (akun diputus), otomatis jatuh kembali ke akun pertama.
  const accountId =
    selected && threadsAccounts.some((a) => a.id === selected)
      ? selected
      : (threadsAccounts[0]?.id ?? null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.threadsOwnPosts, accountId],
    queryFn: () => api.get<MyPostsResponse>(`/threads/my-posts?accountId=${accountId}&limit=50`),
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });

  const posts = data?.posts ?? [];

  // Org tanpa akun Threads → panel tidak relevan, jangan tampil.
  if (threadsAccounts.length === 0) return null;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-base">
            <span
              className="inline-flex h-5 w-5 items-center justify-center"
              style={{ color: PLATFORMS.threads.color }}
            >
              <PLATFORMS.threads.icon className="h-4 w-4" />
            </span>
            Post Threads Saya
          </h2>
          <p className="mt-1 text-[var(--text-secondary)] text-xs">
            Daftar post milik akun Threads sendiri, diambil langsung dari Threads API — termasuk
            post yang dibuat langsung di aplikasi Threads. Klik &ldquo;Lihat detail&rdquo; untuk
            melihat teks, gambar, dan video.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Picker akun — hanya bila org punya >1 akun Threads */}
          {threadsAccounts.length > 1 && (
            <select
              value={accountId ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs"
              aria-label="Pilih akun Threads"
            >
              {threadsAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username ?? a.id}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 font-medium text-xs hover:border-[var(--accent-gold)] disabled:opacity-50"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Ambil dari Threads
          </button>
        </div>
      </div>

      <div className="mt-3">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-[var(--text-muted)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Mengambil post dari Threads API…
          </div>
        ) : isError ? (
          <p className="rounded-[var(--radius-md)] bg-red-500/10 p-3 text-red-600 text-sm">
            Gagal mengambil post Threads: {(error as Error)?.message ?? "kesalahan tidak diketahui"}
          </p>
        ) : posts.length === 0 ? (
          <p className="py-6 text-center text-[var(--text-muted)] text-sm">
            Akun Threads ini belum punya post. Buat satu post di aplikasi Threads, lalu klik
            &ldquo;Ambil dari Threads&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {posts.map((p) => {
              const media = toMediaItems(p);
              const first = media[0];
              const badge = typeBadge(p.media_type);
              const BadgeIcon = badge.icon;
              const thumb = first?.type === "image" ? first.url : (first?.poster ?? undefined);
              return (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  {/* Thumbnail — fallback ke badge ikon bila tidak ada media */}
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                        <BadgeIcon className="h-4 w-4" />
                      </span>
                    )}
                    {first?.type === "video" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="h-3.5 w-3.5 fill-white text-white" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[var(--text-primary)] text-sm">
                      {p.text || "(media saja)"}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <BadgeIcon className="h-3 w-3" />
                        {badge.label}
                        {media.length > 1 && ` · ${media.length} item`}
                      </span>
                      {p.timestamp && <span>{formatDate(p.timestamp, "short")}</span>}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetail(p)}
                    className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 font-medium text-xs hover:border-[var(--accent-gold)]"
                  >
                    Lihat detail
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {posts.length > 0 && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          {posts.length} post terbaru dari @{data?.username ?? threadsAccounts[0]?.username ?? "—"}
          {data?.nextCursor ? " · masih ada post lebih lama" : ""}
        </p>
      )}

      {detail && <PostDetailModal post={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}
