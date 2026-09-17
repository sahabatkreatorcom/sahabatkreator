// Halaman Akun Sosmed — hubungkan / putuskan akun social media
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  AtSign,
  Building2,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { meQueryOptions } from "@/layouts/require-auth";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";

type Account = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isConnected: boolean;
  needsReconnect: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
};

/** Hitung status expiry token — null bila token tidak ada batasnya (manual/bluesky) */
function tokenExpiryStatus(
  tokenExpiresAt: string | null,
): { label: string; variant: "warning" | "danger" } | null {
  if (!tokenExpiresAt) return null;
  const msLeft = new Date(tokenExpiresAt).getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return { label: "Token sudah expired", variant: "danger" };
  if (daysLeft <= 2) return { label: `Token habis ${daysLeft} hari lagi`, variant: "danger" };
  if (daysLeft <= 7) return { label: `Token habis ${daysLeft} hari lagi`, variant: "warning" };
  return null;
}

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [manualModal, setManualModal] = useState(false);
  const [manualUsername, setManualUsername] = useState("");
  const [blueskyModal, setBlueskyModal] = useState(false);
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [blueskyPassword, setBlueskyPassword] = useState("");
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [infoAccount, setInfoAccount] = useState<Account | null>(null);

  // Nama organisasi aktif (untuk label sinkronisasi)
  const { data: me } = useQuery(meQueryOptions);
  const orgName = me?.organization?.name;

  // Banner hasil OAuth callback (redirect dari server)
  // + deteksi ?pending= → buka modal picker Page Meta
  const pendingId = searchParams.get("pending");
  const [pendingModalOpen, setPendingModalOpen] = useState(false);

  useEffect(() => {
    const success = searchParams.get("connect_success");
    const error = searchParams.get("connect_error");
    if (success) {
      toast.success(
        `Akun ${PLATFORMS[success as keyof typeof PLATFORMS]?.label ?? success} berhasil dihubungkan`,
      );
      setSearchParams({}, { replace: true });
    } else if (error) {
      toast.error(decodeURIComponent(error));
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("pending")) {
      setPendingModalOpen(true);
    }
  }, [searchParams, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<{ accounts: Account[] }>("/accounts"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["accounts"] });

  async function startConnect(platform: string) {
    setPlatformDialogOpen(false);
    if (platform === "bluesky") {
      setBlueskyModal(true);
      return;
    }
    setConnectingPlatform(platform);
    try {
      const { authorizeUrl } = await api.get<{ authorizeUrl: string }>(`/oauth/${platform}/start`);
      window.location.href = authorizeUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai koneksi");
      setConnectingPlatform(null);
    }
  }

  const connectManual = useMutation({
    mutationFn: () =>
      api.post<{ account: Account }>("/accounts/connect-manual", {
        platform: "manual",
        username: manualUsername,
      }),
    onSuccess: () => {
      invalidate();
      setManualModal(false);
      setManualUsername("");
      toast.success("Akun ditambahkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connectBluesky = useMutation({
    mutationFn: () =>
      api.post<{ handle: string }>("/oauth/bluesky/connect", {
        handle: blueskyHandle,
        appPassword: blueskyPassword,
      }),
    onSuccess: (data) => {
      invalidate();
      setBlueskyModal(false);
      setBlueskyHandle("");
      setBlueskyPassword("");
      toast.success(`Bluesky @${data.handle} terhubung`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Akun diputuskan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reconnect = useMutation({
    mutationFn: (platform: string) => api.get<{ authorizeUrl: string }>(`/oauth/${platform}/start`),
    onSuccess: (data) => {
      window.location.href = data.authorizeUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copyUsername(username: string, id: string) {
    navigator.clipboard.writeText(`@${username}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (isLoading) return <PageLoader />;

  const accounts = data?.accounts ?? [];
  const platformEntries = Object.entries(PLATFORMS).filter(([key]) => key !== "manual");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Akun Social Media</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Hubungkan akun Anda untuk mulai posting dan memantau performa
          </p>
        </div>
        <Button onClick={() => setPlatformDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Hubungkan Akun
        </Button>
      </div>

      {/* Akun terhubung */}
      {accounts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {accounts.map((account) => {
            const cfg = PLATFORMS[account.platform as keyof typeof PLATFORMS];
            const Icon = cfg?.icon;
            const needsReconnection =
              !account.isConnected || !!account.lastError || account.needsReconnect;
            const expiry = !needsReconnection ? tokenExpiryStatus(account.tokenExpiresAt) : null;
            const cardHighlight = needsReconnection
              ? "border-orange-300 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20"
              : expiry?.variant === "danger"
                ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                : expiry?.variant === "warning"
                  ? "border-yellow-300 bg-yellow-50/40 dark:border-yellow-700 dark:bg-yellow-950/20"
                  : "";

            return (
              <div
                key={account.id}
                className={`card flex flex-col p-5 ${cardHighlight}`}
              >
                {/* Top: Avatar user (fallback icon platform) + name + status badge, info button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {account.avatarUrl ? (
                      <Avatar
                        src={account.avatarUrl}
                        alt={account.displayName ?? account.username}
                        name={account.displayName ?? account.username}
                        size="lg"
                        className="ring-2"
                        style={
                          cfg
                            ? {
                                boxShadow: `0 0 0 2px ${cfg.color}33, 0 0 0 1px ${cfg.color}`,
                              }
                            : undefined
                        }
                      />
                    ) : (
                      Icon && (
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${cfg.color}1a` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: cfg.color }} />
                        </div>
                      )
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{cfg?.label ?? account.platform}</span>
                      {needsReconnection ? (
                        <Badge variant="warning">Needs reconnection</Badge>
                      ) : (
                        <Badge variant="success">connected</Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInfoAccount(account)}
                    className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    title="Informasi akun"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>

                {/* Reconnection warning */}
                {needsReconnection && (
                  <div className="mt-3 flex items-center gap-1.5 text-orange-600 text-sm dark:text-orange-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Perlu dihubungkan ulang</span>
                  </div>
                )}

                {/* Token expiry warning */}
                {!needsReconnection && expiry && (
                  <div
                    className={`mt-3 flex items-center gap-1.5 text-sm ${
                      expiry.variant === "danger"
                        ? "text-red-600 dark:text-red-400"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{expiry.label} — segera reconnect</span>
                  </div>
                )}

                {/* Username + copy */}
                <div className="mt-4">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-[var(--text-primary)] text-sm">
                      @{account.username}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyUsername(account.username, account.id)}
                      className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                      title="Salin username"
                    >
                      {copiedId === account.id ? (
                        <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[var(--text-muted)] text-xs">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>Terhubung {formatDate(account.createdAt, "medium")}</span>
                  </div>
                </div>


                {/* Last sync */}
                {account.lastSyncedAt && (
                  <div className="mt-3 flex items-center gap-2 text-[var(--text-muted)] text-xs">
                    <RefreshCw className="h-3 w-3" />
                    <span>
                      Terakhir sinkron {formatDate(account.lastSyncedAt, "medium")}
                      {orgName ? ` oleh ${orgName}` : ""}
                    </span>
                  </div>
                )}

                {/* Error message */}
                {account.lastError && !needsReconnection && (
                  <p className="mt-2 text-red-500 text-xs">{account.lastError}</p>
                )}

                {/* Actions */}
                <div className="mt-auto pt-4">
                  {needsReconnection ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1 bg-orange-500 hover:bg-orange-600"
                          onClick={() => reconnect.mutate(account.platform)}
                          disabled={reconnect.isPending}
                        >
                          {reconnect.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Reconnect
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => disconnect.mutate(account.id)}
                          disabled={disconnect.isPending}
                        >
                          Disconnect
                        </Button>
                      </div>
                      <button
                        type="button"
                        onClick={() => reconnect.mutate(account.platform)}
                        className="flex w-full items-center justify-center gap-1.5 text-[var(--text-secondary)] text-xs hover:text-[var(--text-primary)]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Reconnect link
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => disconnect.mutate(account.id)}
                      disabled={disconnect.isPending}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {accounts.length === 0 && (
        <EmptyState
          icon={<Link2 className="h-6 w-6" />}
          title="Belum ada akun terhubung"
          description="Hubungkan akun social media Anda untuk memulai."
        />
      )}

      {/* Dialog Pilih Platform */}
      {platformDialogOpen && (
        <Modal
          open
          onClose={() => setPlatformDialogOpen(false)}
          title="Hubungkan Akun"
          description="Pilih platform yang ingin Anda hubungkan"
          size="lg"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {platformEntries.map(([key, cfg]) => {
              const Icon = cfg.icon;
              const connected = accounts.some((a) => a.platform === key && a.isConnected);
              const connecting = connectingPlatform === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => startConnect(key)}
                  disabled={connecting}
                  className={`flex items-center gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${
                    connecting
                      ? "border-[var(--accent-gold)] opacity-70"
                      : "border-[var(--border)] hover:border-[var(--accent-gold)] hover:bg-[var(--bg-tertiary)]"
                  }`}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${cfg.color}1a` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: cfg.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{cfg.label}</p>
                    <p className="text-[var(--text-muted)] text-xs">
                      {connecting ? "Membuka..." : connected ? "Sudah terhubung" : "Hubungkan"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Hint multi-channel YouTube (note.md #14): satu koneksi = satu channel;
              channel lain = connect ulang & pilih akun Google channel tsb. */}
          {accounts.some((a) => a.platform === "youtube") && (
            <p className="text-[var(--text-muted)] text-xs">
              Tips YouTube: satu koneksi = satu channel. Untuk mengelola channel lain, hubungkan
              YouTube lagi — saat layar login Google, pilih akun channel yang dituju.
            </p>
          )}

          {/* Akun manual */}
          <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] border-dashed p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">Akun Manual (Reminder)</p>
                <p className="text-[var(--text-secondary)] text-xs">
                  Tambahkan akun sebagai pengingat posting manual
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPlatformDialogOpen(false);
                  setManualModal(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Manual
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal akun manual */}
      {manualModal && (
        <Modal open onClose={() => setManualModal(false)} title="Tambah Akun Manual">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              connectManual.mutate();
            }}
          >
            <div>
              <label className="mb-2 block font-medium text-sm" htmlFor="manual-username">
                Username
              </label>
              <Input
                id="manual-username"
                placeholder="mis. akun.instagramku"
                value={manualUsername}
                onChange={(e) => setManualUsername(e.target.value)}
                required
                maxLength={100}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setManualModal(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={connectManual.isPending || !manualUsername.trim()}>
                {connectManual.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Tambah
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Bluesky app password */}
      {blueskyModal && (
        <Modal open onClose={() => setBlueskyModal(false)} title="Hubungkan Bluesky">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              connectBluesky.mutate();
            }}
          >
            <div>
              <Label htmlFor="bluesky-handle">Handle</Label>
              <Input
                id="bluesky-handle"
                placeholder="mis. kreatorku.bsky.social"
                value={blueskyHandle}
                onChange={(e) => setBlueskyHandle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="bluesky-password">App Password</Label>
              <Input
                id="bluesky-password"
                type="password"
                placeholder="Buat di Settings → App passwords (bukan password utama)"
                value={blueskyPassword}
                onChange={(e) => setBlueskyPassword(e.target.value)}
                required
              />
            </div>
            <p className="text-[var(--text-muted)] text-xs">
              Gunakan App Password dari pengaturan keamanan Bluesky — bukan password akun Anda.
              Dapat dihapus kapan saja dari sisi Bluesky.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setBlueskyModal(false)}>
                Batal
              </Button>
              <Button
                type="submit"
                disabled={
                  connectBluesky.isPending || !blueskyHandle.trim() || !blueskyPassword.trim()
                }
              >
                {connectBluesky.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Hubungkan
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {/* Modal detail informasi akun */}
      {infoAccount && (
        <AccountInfoModal
          account={infoAccount}
          orgName={orgName}
          onClose={() => setInfoAccount(null)}
        />
      )}

      {/* Modal picker Page Meta (hasil OAuth multi-Page) */}
      {pendingModalOpen && pendingId && (
        <PagePickerModal
          pendingId={pendingId}
          onClose={() => {
            setPendingModalOpen(false);
            setSearchParams({}, { replace: true });
          }}
          onConnected={() => {
            setPendingModalOpen(false);
            setSearchParams({}, { replace: true });
            invalidate();
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal detail informasi akun — dibuka via tombol info (i) pada kartu akun.
 * Menampilkan identitas, status, dan waktu sinkronisasi terakhir.
 */
function AccountInfoModal({
  account,
  orgName,
  onClose,
}: {
  account: Account;
  orgName?: string;
  onClose: () => void;
}) {
  const cfg = PLATFORMS[account.platform as keyof typeof PLATFORMS];
  const Icon = cfg?.icon;
  const needsReconnection = !account.isConnected || !!account.lastError || account.needsReconnect;

  const expiryInfo = account.tokenExpiresAt
    ? (() => {
        const d = new Date(account.tokenExpiresAt);
        const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const suffix =
          daysLeft <= 0
            ? " (sudah expired)"
            : daysLeft <= 7
              ? ` (${daysLeft} hari lagi)`
              : "";
        return `${formatDate(account.tokenExpiresAt, "medium")}${suffix}`;
      })()
    : null;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Platform", value: cfg?.label ?? account.platform },
    { label: "Username", value: `@${account.username}` },
    ...(account.displayName ? [{ label: "Nama tampilan", value: account.displayName }] : []),
    { label: "Status", value: needsReconnection ? "Perlu dihubungkan ulang" : "Terhubung" },
    { label: "Terhubung sejak", value: formatDate(account.createdAt, "medium") },
    ...(expiryInfo ? [{ label: "Token berakhir", value: expiryInfo }] : []),
    ...(account.lastSyncedAt
      ? [
          {
            label: "Sinkronisasi terakhir",
            value: `${formatDate(account.lastSyncedAt, "medium")}${orgName ? ` oleh ${orgName}` : ""}`,
          },
        ]
      : []),
    ...(account.lastError ? [{ label: "Error terakhir", value: account.lastError }] : []),
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title="Informasi Akun"
      description={`Detail akun ${cfg?.label ?? account.platform}`}
    >
      <div className="space-y-4">
        {/* Identitas akun */}
        <div className="flex items-center gap-3">
          {account.avatarUrl ? (
            <Avatar
              src={account.avatarUrl}
              alt={account.displayName ?? account.username}
              name={account.displayName ?? account.username}
              size="lg"
            />
          ) : (
            Icon && (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: `${cfg.color}1a` }}
              >
                <Icon className="h-6 w-6" style={{ color: cfg.color }} />
              </div>
            )
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">{account.displayName ?? account.username}</p>
            <p className="text-[var(--text-muted)] text-sm">@{account.username}</p>
          </div>
          {needsReconnection ? (
            <Badge variant="warning" className="ml-auto">
              Needs reconnection
            </Badge>
          ) : (
            <Badge variant="success" className="ml-auto">
              connected
            </Badge>
          )}
        </div>

        {/* Detail rows */}
        <dl className="divide-y divide-[var(--border-light)]">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="text-[var(--text-secondary)] text-sm">{row.label}</dt>
              <dd className="max-w-[60%] break-words text-right text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Modal pilih entitas — muncul saat OAuth mengembalikan > 1 entitas
 * (Page Meta multi-Page / LinkedIn profil pribadi + company).
 * Sumber: ?pending=<id> (data tersimpan server-side 10 menit).
 */
function PagePickerModal({
  pendingId,
  onClose,
  onConnected,
}: {
  pendingId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounts-pending", pendingId],
    queryFn: () =>
      api.get<{
        platform: string;
        pages: Array<{
          pageId: string;
          pageName: string;
          hasInstagram: boolean;
          igUsername: string | null;
          isPersonal: boolean;
        }>;
      }>(`/accounts/pending/${pendingId}`),
    retry: false,
  });

  const select = useMutation({
    mutationFn: (pageId: string) =>
      api.post<{ ok: boolean; username: string }>(`/accounts/pending/${pendingId}/select`, {
        pageId,
      }),
    onSuccess: (res) => {
      toast.success(`@${res.username} terhubung`);
      onConnected();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isInstagramFlow = data?.platform === "instagram";
  const isLinkedInFlow = data?.platform === "linkedin";
  // linkedin_org = app Community Management API tanpa `openid` → hanya halaman company
  const isLinkedInOrgFlow = data?.platform === "linkedin_org";
  const isPinterestFlow = data?.platform === "pinterest";

  const title = isLinkedInOrgFlow
    ? "Pilih Halaman Company LinkedIn"
    : isLinkedInFlow
      ? "Pilih Profil LinkedIn"
      : isInstagramFlow
        ? "Pilih Halaman Instagram"
        : isPinterestFlow
          ? "Pilih Board Pinterest"
          : "Pilih Halaman Facebook";
  const description = isLinkedInOrgFlow
    ? "Pilih halaman company yang akan dihubungkan — hanya halaman tempat Anda ADMIN yang tampil"
    : isLinkedInFlow
      ? "Pilih profil yang akan dihubungkan — profil pribadi atau halaman company yang Anda kelola"
      : isPinterestFlow
        ? "Pilih board tujuan publish Pin — setiap board menjadi satu akun terhubung"
        : "Akun Meta Anda mengelola beberapa halaman — pilih satu untuk dihubungkan";

  return (
    <Modal open onClose={onClose} title={title} description={description} size="lg">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-gold)]" />
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-red-500 text-sm">{error.message}</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {data?.pages.map((page) => {
              const selected = selectedPageId === page.pageId;
              const disabled = isInstagramFlow && !page.hasInstagram;
              return (
                <button
                  key={page.pageId}
                  type="button"
                  onClick={() => setSelectedPageId(page.pageId)}
                  disabled={disabled}
                  className={`flex w-full items-center gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${
                    selected
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                      : "border-[var(--border)] hover:border-[var(--accent-gold)]"
                  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                    {isLinkedInFlow ? (
                      page.isPersonal ? (
                        <User className="h-5 w-5 text-[var(--text-secondary)]" />
                      ) : (
                        <Building2 className="h-5 w-5 text-[var(--text-secondary)]" />
                      )
                    ) : isPinterestFlow ? (
                      <Pin className="h-5 w-5 text-[var(--text-secondary)]" />
                    ) : page.hasInstagram ? (
                      <AtSign className="h-5 w-5 text-[var(--text-secondary)]" />
                    ) : (
                      <Info className="h-5 w-5 text-[var(--text-muted)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{page.pageName}</p>
                    <p className="text-[var(--text-muted)] text-xs">
                      {isLinkedInFlow || isLinkedInOrgFlow
                        ? page.isPersonal
                          ? "Profil pribadi"
                          : "Halaman company"
                        : isPinterestFlow
                          ? `Board — @${page.igUsername ?? "pinterest"}`
                          : page.hasInstagram
                            ? `IG: @${page.igUsername ?? "bisnis"}`
                            : "Tanpa Instagram Business"}
                    </p>
                  </div>
                  {selected && <Check className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" />}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button
              disabled={!selectedPageId || select.isPending}
              onClick={() => selectedPageId && select.mutate(selectedPageId)}
            >
              {select.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Hubungkan
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
