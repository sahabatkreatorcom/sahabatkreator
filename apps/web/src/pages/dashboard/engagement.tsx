// Halaman Engagement — unified inbox (komentar, mention, DM, review, collab IG)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  AtSign,
  CheckCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Reply,
  Search,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SavedResponsesPicker } from "@/components/ui/saved-responses-picker";
import { PageLoader } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { queryKeys } from "../../lib/query-keys";

type Item = {
  id: string;
  type: "comment" | "mention" | "dm" | "review";
  status: "unread" | "read" | "replied" | "archived";
  hidden: boolean;
  // Moderasi like (pages_manage_engagement) — Page sudah menyukai komentar ini
  liked: boolean;
  platform: string;
  accountUsername: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  content: string;
  rating: number | null;
  replyContent: string | null;
  // Draft dari auto-reply AI (mode review) — belum terkirim
  draftReply: string | null;
  repliedAt: string | null;
  sentiment: string | null;
  occurredAt: string;
  // True bila komentar masuk via akun bridge Repliz (moderasi sync Repliz)
  isBridge: boolean;
};

type Inbox = { items: Item[]; unreadByType: Record<string, number> };

const TABS = [
  { value: undefined, label: "Semua", icon: MessagesSquare },
  { value: "comment", label: "Komentar", icon: MessageCircle },
  { value: "mention", label: "Mention", icon: AtSign },
  { value: "review", label: "Review", icon: Star },
  { value: "collab", label: "Collab IG", icon: Users },
] as const;

const STATUS_BADGE: Record<Item["status"], { label: string; className: string }> = {
  unread: { label: "Baru", className: "bg-[var(--accent-gold-light)] text-[var(--accent-gold)]" },
  read: { label: "Dibaca", className: "bg-[var(--bg-tertiary)]" },
  replied: { label: "Dibalas", className: "bg-green-500/15 text-green-600" },
  archived: { label: "Arsip", className: "bg-[var(--bg-tertiary)]" },
};

const TYPE_LABEL: Record<Item["type"], string> = {
  comment: "Komentar",
  mention: "Mention",
  dm: "DM",
  review: "Review",
};

// ---------------------------------------------------------------------------
// Sentiment sederhana client-side (M12) — kolom sentiment server nullable,
// bila belum ada isi → deteksi kata kunci positif/negatif Indonesia.
// ---------------------------------------------------------------------------

const POSITIVE_WORDS = [
  "bagus",
  "mantap",
  "keren",
  "suka",
  "hebat",
  "banget",
  "keren",
  "juara",
  "terima kasih",
  "makasih",
  "thanks",
  "best",
  "recommended",
  "rekomendasi",
  "wow",
  "cantik",
  "ganteng",
  "lucu",
  "menarik",
  "bermanfaat",
  "berkualitas",
];
const NEGATIVE_WORDS = [
  "jelek",
  "buruk",
  "kecewa",
  "mahal",
  "tipu",
  "penipuan",
  "bohong",
  "parah",
  "gagal",
  "zonk",
  "benci",
  "jijik",
  "sampah",
  "payah",
  "lambat",
  "rusak",
];

function detectSentiment(content: string): "positif" | "netral" | "negatif" {
  const text = content.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) {
    if (text.includes(w)) score += 1;
  }
  for (const w of NEGATIVE_WORDS) {
    if (text.includes(w)) score -= 1;
  }
  if (score > 0) return "positif";
  if (score < 0) return "negatif";
  return "netral";
}

/** Sentiment final: pakai kolom server bila ada, fallback deteksi client-side */
function sentimentOf(item: Item): "positif" | "netral" | "negatif" {
  if (item.sentiment === "positif" || item.sentiment === "negatif") return item.sentiment;
  if (item.sentiment === "netral") return "netral";
  return detectSentiment(item.content || "");
}

const SENTIMENT_BADGE: Record<
  "positif" | "netral" | "negatif",
  { label: string; className: string }
> = {
  positif: { label: "Positif", className: "bg-green-500/15 text-green-600" },
  netral: { label: "Netral", className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" },
  negatif: { label: "Negatif", className: "bg-red-500/15 text-red-500" },
};

function EngagementCard({ item }: { item: Item }) {
  const queryClient = useQueryClient();
  const [replyOpen, setReplyOpen] = useState(false);
  // Prefill dengan draft AI (mode review) bila ada — user edit lalu kirim/tolak.
  const [reply, setReply] = useState(item.draftReply ?? item.replyContent ?? "");
  const hasDraft = Boolean(item.draftReply) && !item.replyContent;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.engagementInbox });
  };

  const patch = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/engagement/${item.id}`, payload),
    onSuccess: () => {
      invalidate();
      toast.success("Status diperbarui");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Moderasi: hide/unhide komentar (M12)
  const toggleHidden = useMutation({
    mutationFn: () => api.patch(`/engagement/comments/${item.id}`, { hidden: !item.hidden }),
    onSuccess: () => {
      invalidate();
      if (item.hidden) {
        toast.success("Komentar ditampilkan kembali");
      } else {
        // Jelaskan ke mana item pergi — daftar default hanya menampilkan yang tampil,
        // jadi komentar yang baru disembunyikan langsung keluar dari inbox.
        toast.success("Komentar disembunyikan", {
          description:
            'Komentar ini pindah ke filter Tampilan → "Disembunyikan". Ubah filter itu untuk menampilkan kembali.',
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Moderasi: hapus komentar dari inbox (M12)
  const removeItem = useMutation({
    mutationFn: () => api.delete(`/engagement/comments/${item.id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Komentar dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Moderasi: like/unlike komentar sebagai Page (pages_manage_engagement).
  // Meta meminta satu permission ini mencakup "reply / hide / like" — App Review
  // menolak bila demo tidak memperlihatkan like, jadi tombol ini wajib ada.
  const toggleLike = useMutation({
    mutationFn: () => api.post(`/engagement/comments/${item.id}/like`, { liked: !item.liked }),
    onSuccess: () => {
      invalidate();
      toast.success(item.liked ? "Batal suka komentar" : "Komentar disukai");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Moderasi bridge Repliz: resolved (selesai) / ignored (abaikan) — sync ke
  // inbox Repliz sekaligus update status lokal (replied / archived).
  const moderate = useMutation({
    mutationFn: (status: "resolved" | "ignored") =>
      api.put(`/engagement/comments/${item.id}/status`, { status }),
    onSuccess: (_data, status) => {
      invalidate();
      toast.success(status === "resolved" ? "Komentar ditandai selesai" : "Komentar diabaikan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReply = useMutation({
    mutationFn: () => api.post(`/engagement/${item.id}/reply`, { content: reply }),
    onSuccess: () => {
      invalidate();
      setReplyOpen(false);
      toast.success("Balasan terkirim");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Saran balasan AI via OpenRouter
  const suggestReply = useMutation({
    mutationFn: () =>
      api.post<{ reply: string }>("/ai/reply", {
        comment: item.content,
        platform: item.platform,
        tone: "ramah",
      }),
    onSuccess: (data) => {
      setReply(data.reply);
      setReplyOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cfg = PLATFORMS[item.platform as keyof typeof PLATFORMS];
  const Icon = cfg?.icon;
  const sentiment = sentimentOf(item);

  return (
    <div
      className={`card p-5 ${item.status === "unread" ? "border-l-4 border-l-[var(--accent-gold)]" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Avatar
          name={item.authorName ?? item.authorUsername ?? "?"}
          src={item.authorAvatarUrl ?? undefined}
          className="h-10 w-10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/*
              `authorName` kosong BUKAN selalu tanda data hilang: Instagram
              tidak menyediakan nama/foto penulis komentar lewat Graph API
              (hanya `username`), dan Facebook kadang tidak mengirim `from`
              untuk komentar anonim/promosi. Karena itu jangan tampilkan
              "Anonim" — pakai @username bila ada, dan kalau dua-duanya kosong
              sebut "Penulis tidak tersedia" supaya jelas ini keterbatasan
              data dari platform, bukan tampilan yang rusak.
            */}
            {item.authorName && <span className="font-semibold text-sm">{item.authorName}</span>}
            {item.authorUsername ? (
              <span
                className={
                  item.authorName ? "text-[var(--text-muted)] text-xs" : "font-semibold text-sm"
                }
              >
                @{item.authorUsername}
              </span>
            ) : (
              !item.authorName && (
                <span className="font-semibold text-[var(--text-muted)] text-sm">
                  Penulis tidak tersedia
                </span>
              )
            )}
            <span className="flex items-center gap-1 text-[var(--text-muted)] text-xs">
              {Icon && <Icon className="h-3 w-3" style={{ color: cfg?.color }} />}@
              {item.accountUsername} · {formatRelativeTime(item.occurredAt)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-medium text-[10px] ${STATUS_BADGE[item.status].className}`}
            >
              {STATUS_BADGE[item.status].label}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-medium text-[10px] ${SENTIMENT_BADGE[sentiment].className}`}
            >
              {SENTIMENT_BADGE[sentiment].label}
            </span>
            {item.hidden && (
              <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[10px] text-[var(--text-muted)]">
                Tersembunyi
              </span>
            )}
          </div>

          <p className="mt-2 text-sm">{item.content}</p>

          {item.type === "review" && item.rating != null && (
            <div className="mt-1 flex gap-0.5">
              {[...Array(5)].map((_, i) => {
                const rating = item.rating ?? 0;
                return (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${
                      i < rating ? "fill-yellow-400 text-yellow-400" : "text-[var(--border)]"
                    }`}
                  />
                );
              })}
            </div>
          )}

          {item.replyContent && (
            <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-sm">
              <p className="mb-1 font-medium text-[var(--text-muted)] text-xs">Balasan Anda</p>
              {item.replyContent}
            </div>
          )}

          {hasDraft && !replyOpen && (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--accent-gold)]/40 bg-[var(--accent-gold-light)] p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-[var(--accent-gold)] text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Draft auto-reply AI — periksa sebelum dikirim
              </p>
              <p className="text-[var(--text-secondary)]">{item.draftReply}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
                  <Reply className="h-3.5 w-3.5" />
                  Edit &amp; Kirim
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-600"
                  disabled={patch.isPending}
                  onClick={() => patch.mutate({ clearDraft: true })}
                >
                  Tolak Draft
                </Button>
              </div>
            </div>
          )}

          {replyOpen ? (
            <div className="mt-3 space-y-2">
              {hasDraft && (
                <p className="flex items-center gap-1.5 text-[var(--accent-gold)] text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Draft AI dimuat — edit sesuai kebutuhan sebelum kirim.
                </p>
              )}
              <Textarea
                rows={3}
                placeholder="Tulis balasan..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => sendReply.mutate()}
                  disabled={!reply.trim() || sendReply.isPending}
                >
                  {sendReply.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Reply className="h-3.5 w-3.5" />
                  )}
                  Kirim Balasan
                </Button>
                <SavedResponsesPicker onPick={setReply} />
                <Button size="sm" variant="ghost" onClick={() => setReplyOpen(false)}>
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
                <Reply className="h-3.5 w-3.5" />
                Balas
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => suggestReply.mutate()}
                disabled={suggestReply.isPending}
                title="Saran balasan AI"
              >
                {suggestReply.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Balasan AI
              </Button>
              {item.status !== "read" && (
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ status: "read" })}>
                  <CheckCheck className="h-3.5 w-3.5" />
                  Tandai Dibaca
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => patch.mutate({ status: "archived" })}
              >
                <Archive className="h-3.5 w-3.5" />
                Arsipkan
              </Button>

              {/* Moderasi (M12): hide/unhide & delete komentar */}
              {item.type === "comment" && (
                <>
                  {/* Like/unlike komentar — hanya Facebook Page (edge /likes
                      terverifikasi di sana). Bridge Repliz & IG belum didukung. */}
                  {item.platform === "facebook" && !item.isBridge && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleLike.mutate()}
                      disabled={toggleLike.isPending}
                      className={item.liked ? "text-[var(--accent-gold)]" : undefined}
                      title={item.liked ? "Batal suka komentar" : "Sukai komentar"}
                    >
                      {toggleLike.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ThumbsUp
                          className="h-3.5 w-3.5"
                          fill={item.liked ? "currentColor" : "none"}
                        />
                      )}
                      {item.liked ? "Disukai" : "Suka"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleHidden.mutate()}
                    disabled={toggleHidden.isPending}
                    title={item.hidden ? "Tampilkan komentar" : "Sembunyikan komentar"}
                  >
                    {toggleHidden.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : item.hidden ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                    {item.hidden ? "Tampilkan" : "Sembunyikan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeItem.mutate()}
                    disabled={removeItem.isPending}
                    className="text-red-500 hover:text-red-600"
                    title="Hapus komentar"
                  >
                    {removeItem.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Hapus
                  </Button>
                </>
              )}

              {/* Moderasi bridge Repliz: sync status resolved/ignored ke Repliz */}
              {item.type === "comment" && item.isBridge && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moderate.mutate("resolved")}
                    disabled={moderate.isPending}
                    title="Tandai selesai dan sync ke Repliz"
                  >
                    {moderate.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="h-3.5 w-3.5" />
                    )}
                    Selesai
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moderate.mutate("ignored")}
                    disabled={moderate.isPending}
                    title="Abaikan komentar di Repliz"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Abaikan
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type CollabInvite = {
  mediaId: string;
  mediaType: string;
  permalink: string | null;
  caption: string | null;
  timestamp: string | null;
  inviterId: string;
  inviterUsername: string;
};

const MEDIA_TYPE_LABEL: Record<string, string> = {
  IMAGE: "Foto",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Carousel",
  REELS: "Reels",
};

/** Tab Collab IG — undangan kolaborasi Instagram (accept/decline) */
function CollabsSection() {
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () =>
      api.get<{ accounts: { id: string; platform: string; username: string }[] }>("/accounts"),
  });

  const igAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.platform === "instagram" || a.platform === "instagram_standalone",
  );

  // Fetch invites per akun IG — gabung hasil
  const invitesQueries = useQuery({
    queryKey: [...queryKeys.collabInvites, igAccounts.map((a) => a.id).join(", ")],
    enabled: igAccounts.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        igAccounts.map(async (account) => {
          const data = await api.get<{ invites: CollabInvite[] }>(
            `/accounts/${account.id}/collabs`,
          );
          return { account, invites: data.invites };
        }),
      );
      return results.filter((r) => r.invites.length > 0);
    },
  });

  const respond = useMutation({
    mutationFn: ({
      accountId,
      mediaId,
      action,
    }: {
      accountId: string;
      mediaId: string;
      action: "accept" | "decline";
    }) => api.post(`/accounts/${accountId}/collabs`, { mediaId, action }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collabInvites });
      toast.success(
        vars.action === "accept"
          ? "Kolaborasi diterima — post tampil di akun Anda"
          : "Undangan kolaborasi ditolak",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (igAccounts.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Belum ada akun Instagram"
        description="Hubungkan akun Instagram untuk menerima undangan kolaborasi (Collab)."
      />
    );
  }

  if (invitesQueries.isLoading) return <PageLoader />;

  const groups = invitesQueries.data ?? [];

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Belum ada undangan Collab"
        description="Saat kreator lain mengundang akun Anda berkolaborasi di post Instagram, undangannya muncul di sini."
      />
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(({ account, invites }) => (
        <div key={account.id} className="space-y-3">
          <p className="font-medium text-[var(--text-muted)] text-xs">
            Akun @{account.username} · {invites.length} undangan
          </p>
          {invites.map((invite) => (
            <div key={invite.mediaId} className="card p-5">
              <div className="flex items-start gap-3">
                <Avatar name={invite.inviterUsername} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">@{invite.inviterUsername}</span>
                    <span className="text-[var(--text-muted)] text-xs">
                      mengundang Anda berkolaborasi
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {MEDIA_TYPE_LABEL[invite.mediaType] ?? invite.mediaType}
                    </Badge>
                    {invite.timestamp && (
                      <span className="text-[var(--text-muted)] text-xs">
                        · {formatRelativeTime(invite.timestamp)}
                      </span>
                    )}
                  </div>
                  {invite.caption && (
                    <p className="mt-2 line-clamp-2 text-[var(--text-secondary)] text-sm">
                      {invite.caption}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        respond.mutate({
                          accountId: account.id,
                          mediaId: invite.mediaId,
                          action: "accept",
                        })
                      }
                      disabled={respond.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {respond.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCheck className="h-3.5 w-3.5" />
                      )}
                      Terima
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        respond.mutate({
                          accountId: account.id,
                          mediaId: invite.mediaId,
                          action: "decline",
                        })
                      }
                      disabled={respond.isPending}
                    >
                      Tolak
                    </Button>
                    {invite.permalink && (
                      <a
                        href={invite.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[var(--text-secondary)] text-xs hover:bg-[var(--bg-tertiary)]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Lihat post
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function EngagementPage() {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [platform, setPlatform] = useState<string>("all");
  const [sentiment, setSentiment] = useState<string>("all");
  // Moderasi (M12): komentar yang disembunyikan tidak ikut daftar default —
  // API default `hidden=false`. Tanpa filter ini, item yang baru disembunyikan
  // langsung hilang dari inbox sehingga tombol "Tampilkan" tak pernah terlihat.
  const [showHidden, setShowHidden] = useState(false);
  const isCollabTab = type === "collab";

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.engagementInbox, type, status, platform, showHidden],
    queryFn: () => {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      if (platform !== "all") params.set("platform", platform);
      if (showHidden) params.set("hidden", "true");
      const qs = params.toString();
      return api.get<Inbox>(`/engagement${qs ? `?${qs}` : ""}`);
    },
    // Tab collab punya sumber data sendiri (Graph API per akun IG)
    enabled: !isCollabTab,
  });

  // Sinkronkan sekarang (M12) — trigger sync komentar semua akun aktif org.
  // Non-blocking: backend balas 202 segera dan menjalankan sync di background
  // (sebelumnya memblokir hingga 22 API call/akun Threads selesai → proxy 502).
  // Frontend polling /sync-status sampai selesai, lalu invalidate inbox.
  const syncNow = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; status: "started" | "already_running" }>("/engagement/sync-now"),
    onSuccess: async () => {
      // Jika sync lain sedang berjalan, tunggu juga (poll status yang sama)
      const deadline = Date.now() + 3 * 60 * 1000; // batas poll 3 menit
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        let st: {
          running: boolean;
          result: { accounts: number; newItems: number; errors: string[] } | null;
        };
        try {
          st = await api.get<{
            running: boolean;
            result: { accounts: number; newItems: number; errors: string[] } | null;
          }>("/engagement/sync-status");
        } catch {
          // Network error saat polling (mis. proxy) — coba lagi
          continue;
        }
        if (!st.running) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.engagementInbox });
          const r = st.result;
          if (!r) {
            toast.info("Sync selesai");
          } else if (r.errors.length > 0) {
            toast.warning(`Sync selesai — ${r.errors.length} akun gagal`, {
              description: r.errors[0],
            });
          } else if (r.newItems > 0) {
            toast.success(`Sync selesai — ${r.newItems} interaksi baru`);
          } else {
            // "Tidak ada interaksi baru" sering disalahartikan sebagai tombol
            // rusak. Padahal paling sering penyebabnya ada di sisi platform:
            // komentar/mention baru belum muncul di API-nya (Threads &
            // Instagram punya jeda publikasi setelah sebuah item dibuat), atau
            // item itu sudah pernah tersinkron sebelumnya. Jelaskan supaya
            // pengguna tidak menekan Sinkron berulang-ulang tanpa hasil.
            toast.success("Sync selesai — belum ada interaksi baru", {
              description:
                "Semua interaksi yang tersedia sudah masuk inbox. Interaksi yang baru dibuat di platform biasanya butuh beberapa menit sebelum muncul di sini.",
            });
          }
          return;
        }
      }
      // Timeout poll — sync mungkin masih jalan di background
      toast.info("Sync masih berjalan di latar belakang");
      queryClient.invalidateQueries({ queryKey: queryKeys.engagementInbox });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allItems = data?.items ?? [];
  const unread = data?.unreadByType ?? {};

  // Filter sentiment client-side (server tak punya filter sentiment — dihitung lokal)
  const items = useMemo(() => {
    if (sentiment === "all") return allItems;
    return allItems.filter((i) => sentimentOf(i) === sentiment);
  }, [allItems, sentiment]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Engagement Inbox</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Balas semua interaksi dari satu tempat
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => syncNow.mutate()}
          disabled={syncNow.isPending || isCollabTab}
          title="Tarik komentar & review terbaru dari semua akun terhubung"
        >
          {syncNow.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {syncNow.isPending ? "Menyinkronkan..." : "Sinkronkan Sekarang"}
        </Button>
      </div>

      {/* Tab type */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const count =
            tab.value === undefined
              ? Object.values(unread).reduce((a, b) => a + b, 0)
              : (unread[tab.value] ?? 0);
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => setType(tab.value)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                type === tab.value
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-gold)] px-1 font-bold text-[10px] text-white">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter bar (M12): platform + sentimen + tipe — tidak relevan untuk tab collab */}
      {!isCollabTab && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          {/* Platform */}
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="font-medium text-[var(--text-muted)] text-xs">Platform</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-xs"
              aria-label="Filter platform"
            >
              <option value="all">Semua</option>
              {(Object.keys(PLATFORMS) as Platform[])
                .filter((p) => p !== "manual")
                .map((p) => (
                  <option key={p} value={p}>
                    {PLATFORMS[p].label}
                  </option>
                ))}
            </select>
          </div>
          {/* Sentimen — dihitung client-side bila field kosong */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-muted)] text-xs">Sentimen</span>
            <select
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-xs"
              aria-label="Filter sentimen"
            >
              <option value="all">Semua</option>
              <option value="positif">Positif</option>
              <option value="netral">Netral</option>
              <option value="negatif">Negatif</option>
            </select>
          </div>
          {/* Tipe */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-muted)] text-xs">Tipe</span>
            <select
              value={type ?? "all"}
              onChange={(e) => setType(e.target.value === "all" ? undefined : e.target.value)}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-xs"
              aria-label="Filter tipe"
            >
              <option value="all">Semua</option>
              {(Object.keys(TYPE_LABEL) as Item["type"][]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          {/* Tampilan — sembunyikan/tampilkan komentar yang dimoderasi (M12) */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-muted)] text-xs">Tampilan</span>
            <select
              value={showHidden ? "hidden" : "visible"}
              onChange={(e) => setShowHidden(e.target.value === "hidden")}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-xs"
              aria-label="Filter tampilan komentar"
            >
              <option value="visible">Tampil</option>
              <option value="hidden">Disembunyikan</option>
            </select>
          </div>
        </div>
      )}

      {/* Filter status — tidak relevan untuk tab collab */}
      {!isCollabTab && (
        <div className="flex gap-2">
          {["unread", "read", "replied", "archived"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(status === s ? undefined : s)}
              className={`text-xs ${status === s ? "font-semibold text-[var(--accent-gold)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              {STATUS_BADGE[s as Item["status"]].label}
            </button>
          ))}
        </div>
      )}

      {isCollabTab ? (
        <CollabsSection />
      ) : isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title={showHidden ? "Tidak ada komentar tersembunyi" : "Inbox bersih!"}
          description={
            showHidden
              ? "Belum ada komentar yang disembunyikan di akun ini."
              : "Belum ada interaksi yang perlu dibalas. Interaksi baru akan muncul di sini."
          }
        />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <EngagementCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
