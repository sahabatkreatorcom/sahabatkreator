export type Account = {
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
  hasRefreshToken: boolean;
  createdAt: string;
  // True bila akun dikelola via bridge Repliz (token platform disimpan Repliz)
  isBridge: boolean;
};

/** Hitung status expiry token — null bila token tidak ada batasnya (manual/bluesky) */
export function tokenExpiryStatus(
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
