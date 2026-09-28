// Halaman Akun Sosmed — hubungkan / putuskan akun social media
import { useMutation, useQuery } from "@tanstack/react-query";
import { AtSign, Building2, Check, Info, Loader2, Pin, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import { queryKeys } from "../../lib/query-keys";
import type { Account } from "./accounts-types";

export function BridgeStats({ accountId }: { accountId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.bridgeStats, accountId],
    queryFn: () =>
      api.get<{
        statistic: Record<string, number> | null;
        unsupported?: boolean;
      }>(`/accounts/${accountId}/statistic`),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mb-3 flex items-center gap-1.5 text-[var(--text-muted)] text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Memuat statistik bridge…
      </div>
    );
  }

  // Bridge terkadang tidak mengembalikan statistik (akun baru / endpoint
  // belum siap) — gagal secara senyap, bukan tampilkan error merah.
  if (error || !data?.statistic) return null;

  const s = data.statistic;
  const stats = [
    { label: "Post terjadwal", value: s.scheduledPosts ?? s.posts ?? 0 },
    { label: "Komentar", value: s.comments ?? 0 },
    { label: "DM belum dibaca", value: s.unreadChats ?? s.chats ?? 0 },
  ].filter((x) => x.value > 0);

  if (stats.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {stats.map((x) => (
        <span
          key={x.label}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
          title={`Statistik Repliz: ${x.label}`}
        >
          {x.label} <strong className="font-semibold">{x.value}</strong>
        </span>
      ))}
    </div>
  );
}

/**
 * Modal detail informasi akun — dibuka via tombol info (i) pada kartu akun.
 * Menampilkan identitas, status, dan waktu sinkronisasi terakhir.
 */
export function AccountInfoModal({
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
          daysLeft <= 0 ? " (sudah expired)" : daysLeft <= 7 ? ` (${daysLeft} hari lagi)` : "";
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
 * (Page Meta multi-Page / profil LinkedIn / halaman company LinkedIn).
 * Sumber: ?pending=<id> (data tersimpan server-side 10 menit).
 */
export function PagePickerModal({
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
    queryKey: [...queryKeys.accountsPending, pendingId],
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
  // linkedin_org = halaman company — native (app Community Management API) maupun
  // bridge (filter URN organization di repliz-callback), keduanya company-only.
  const isLinkedInOrgFlow = data?.platform === "linkedin_org";
  const isLinkedInAnyFlow = isLinkedInFlow || isLinkedInOrgFlow;
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
      ? "Pilih profil pribadi yang akan dihubungkan"
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
                    {isLinkedInAnyFlow ? (
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
                      {isLinkedInAnyFlow
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
