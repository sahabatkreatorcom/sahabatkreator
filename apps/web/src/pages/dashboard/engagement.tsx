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

type Item = {
  id: string;
  type: "comment" | "mention" | "dm" | "review";
  status: "unread" | "read" | "replied" | "archived";
  hidden: boolean;
  platform: string;
  accountUsername: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  content: string;
  rating: number | null;
  replyContent: string | null;
  repliedAt: string | null;
  sentiment: string | null;
  occurredAt: string;
};

type Inbox = { items: Item[]; unreadByType: Record<string, number> };

const TABS = [
  { value: undefined, label: "Semua", icon: MessagesSquare },
  { value: "comment", label: "Komentar", icon: MessageCircle },
  { value: "mention", label: "Mention", icon: AtSign },
  { value: "dm", label: "DM", icon: MessagesSquare },
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
  const [reply, setReply] = useState(item.replyContent ?? "");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["engagement-inbox"] });
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
      toast.success(item.hidden ? "Komentar ditampilkan kembali" : "Komentar disembunyikan");
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
            <span className="font-semibold text-sm">
              {item.authorName ?? item.authorUsername ?? "Anonim"}
            </span>
            {item.authorUsername && (
              <span className="text-[var(--text-muted)] text-xs">@{item.authorUsername}</span>
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
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-3.5 w-3.5 ${
                    i < item.rating! ? "fill-yellow-400 text-yellow-400" : "text-[var(--border)]"
                  }`}
                />
              ))}
            </div>
          )}

          {item.replyContent && (
            <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-sm">
              <p className="mb-1 font-medium text-[var(--text-muted)] text-xs">Balasan Anda</p>
              {item.replyContent}
            </div>
          )}

          {replyOpen ? (
            <div className="mt-3 space-y-2">
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

              {/* Moderasi (M12): hide/unhide & delete */}
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
    queryKey: ["accounts"],
    queryFn: () =>
      api.get<{ accounts: { id: string; platform: string; username: string }[] }>("/accounts"),
  });

  const igAccounts = (accountsData?.accounts ?? []).filter(
    (a) => a.platform === "instagram" || a.platform === "instagram_standalone",
  );

  // Fetch invites per akun IG — gabung hasil
  const invitesQueries = useQuery({
    queryKey: ["collab-invites", igAccounts.map((a) => a.id).join(",")],
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
      queryClient.invalidateQueries({ queryKey: ["collab-invites"] });
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
  const isCollabTab = type === "collab";

  const { data, isLoading } = useQuery({
    queryKey: ["engagement-inbox", type, status, platform],
    queryFn: () => {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      if (platform !== "all") params.set("platform", platform);
      const qs = params.toString();
      return api.get<Inbox>(`/engagement${qs ? `?${qs}` : ""}`);
    },
    // Tab collab punya sumber data sendiri (Graph API per akun IG)
    enabled: !isCollabTab,
  });

  // Sinkronkan sekarang (M12) — trigger sync komentar semua akun aktif org
  const syncNow = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; accounts: number; newItems: number; errors: string[] }>(
        "/engagement/sync-now",
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["engagement-inbox"] });
      if (res.errors.length > 0) {
        toast.warning(`Sync selesai — ${res.errors.length} akun gagal`, {
          description: res.errors[0],
        });
      } else {
        toast.success(
          res.newItems > 0
            ? `Sync selesai — ${res.newItems} interaksi baru`
            : "Sync selesai — tidak ada interaksi baru",
        );
      }
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
          title="Inbox bersih!"
          description="Belum ada interaksi yang perlu dibalas. Interaksi baru akan muncul di sini."
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
