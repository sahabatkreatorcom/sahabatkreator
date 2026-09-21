// Inbox DM — daftar percakapan (list kiri master-detail)
import { MailOpen, MessagesSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";

export type DmConversation = {
  id: string;
  platform: string;
  accountUsername: string;
  partnerId: string;
  partnerUsername: string | null;
  partnerName: string | null;
  partnerAvatarUrl: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageDirection: "inbound" | "outbound";
  unreadCount: number;
  assignedMemberId: string | null;
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: DmConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <MessagesSquare className="h-10 w-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-secondary)] text-sm">
          Belum ada percakapan. Klik <strong>Sinkronkan sekarang</strong> untuk mengambil pesan terbaru.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border-light)] overflow-y-auto">
      {conversations.map((conv) => {
        const isActive = conv.id === selectedId;
        const partnerName = conv.partnerName ?? conv.partnerUsername ?? conv.partnerId;
        const PlatformIcon = PLATFORMS[conv.platform as keyof typeof PLATFORMS]?.icon;
        return (
          <li key={conv.id}>
            <button
              type="button"
              onClick={() => onSelect(conv.id)}
              className={`flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-[var(--bg-tertiary)] ${
                isActive ? "bg-[var(--bg-tertiary)]" : ""
              }`}
            >
              <div className="relative shrink-0">
                <Avatar
                  name={partnerName}
                  src={conv.partnerAvatarUrl ?? undefined}
                  className="h-10 w-10 text-sm"
                />
                {PlatformIcon && (
                  <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-primary)]">
                    <PlatformIcon className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm ${
                      conv.unreadCount > 0 ? "font-bold" : "font-medium"
                    }`}
                  >
                    {partnerName}
                  </span>
                  <span className="shrink-0 text-[var(--text-muted)] text-xs">
                    {formatRelativeTime(conv.lastMessageAt)}
                  </span>
                </div>
                <p
                  className={`mt-0.5 truncate text-xs ${
                    conv.unreadCount > 0
                      ? "font-medium text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {conv.lastMessageDirection === "outbound" && "Anda: "}
                  {conv.lastMessagePreview || "[Media]"}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="truncate text-[var(--text-muted)] text-xs">
                    @{conv.accountUsername}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-gold)] px-1.5 font-semibold text-white text-xs">
                      {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Header list: search, filter unread, mark all read */
export function ConversationListHeader({
  q,
  onQChange,
  unreadOnly,
  onUnreadOnlyChange,
  onMarkAllRead,
  unreadTotal,
  canMarkAll,
}: {
  q: string;
  onQChange: (v: string) => void;
  unreadOnly: boolean;
  onUnreadOnlyChange: (v: boolean) => void;
  onMarkAllRead: () => void;
  unreadTotal: number;
  canMarkAll: boolean;
}) {
  return (
    <div className="space-y-2 border-[var(--border-light)] border-b p-3">
      <input
        type="search"
        value={q}
        onChange={(e) => onQChange(e.target.value)}
        placeholder="Cari nama atau username…"
        className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 text-sm outline-none focus:border-[var(--accent-gold)]"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onUnreadOnlyChange(!unreadOnly)}
          className={`rounded-full px-3 py-1 font-medium text-xs transition-colors ${
            unreadOnly
              ? "bg-[var(--accent-gold)] text-white"
              : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Belum dibaca {unreadTotal > 0 && `(${unreadTotal})`}
        </button>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={!canMarkAll}
          className="flex items-center gap-1 rounded-full px-3 py-1 font-medium text-[var(--text-secondary)] text-xs transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <MailOpen className="h-3 w-3" />
          Tandai semua dibaca
        </button>
      </div>
    </div>
  );
}
