// Chip konten eksternal — dipublikasikan langsung di platform (bukan via SK).
// Non-draggable (tidak bisa dijadwalkan ulang); klik membuka modal detail,
// link ke post asli tersedia dari modal.
import { ExternalLink } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { type CalendarPostGroup, formatTimeId } from "./shared";

type ExternalPostChipProps = {
  group: CalendarPostGroup;
  /** Tampilkan jam tayang (untuk view timeline) */
  showTime?: boolean;
  /** Ukuran ringkas (untuk week view) */
  size?: "sm" | "xs";
  /** Klik chip → buka modal detail (jika tidak ada, chip jadi link ke platform) */
  onSelect?: (groupId: string) => void;
};

export function ExternalPostChip({
  group,
  showTime = false,
  size = "sm",
  onSelect,
}: ExternalPostChipProps) {
  const post = group.posts[0];
  const cfg = post ? PLATFORMS[post.platform as keyof typeof PLATFORMS] : undefined;
  const Icon = cfg?.icon;
  const url = post?.externalUrl ?? null;

  const containerCls =
    size === "xs"
      ? "mb-0.5 flex items-center gap-1 rounded border border-dashed border-[var(--border)] bg-[var(--bg-tertiary)] px-1 py-0.5 text-[10px] text-[var(--text-secondary)]"
      : "flex items-center gap-1 rounded border border-dashed border-[var(--border)] bg-[var(--bg-tertiary)] px-1.5 py-1 text-xs text-[var(--text-secondary)]";
  const iconCls = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";

  const inner = (
    <>
      {showTime && group.scheduledAt ? (
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {formatTimeId(group.scheduledAt)}
        </span>
      ) : null}
      {Icon ? <Icon className={iconCls} style={{ color: cfg?.color }} /> : null}
      <span className="truncate">{group.content || "Konten platform"}</span>
      <ExternalLink className={`${iconCls} shrink-0 opacity-60`} />
    </>
  );

  const title = group.content || "(konten platform)";

  // Dengan onSelect: klik → modal detail (post eksternal = virtual group dengan
  // id post, endpoint landing tetap valid). Tanpa onSelect: fallback link lama.
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(group.id)}
        title={title}
        className={`${containerCls} w-full text-left hover:bg-[var(--bg-primary)]`}
      >
        {inner}
      </button>
    );
  }

  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`${containerCls} hover:bg-[var(--bg-primary)]`}
    >
      {inner}
    </a>
  ) : (
    <div title={title} className={containerCls}>
      {inner}
    </div>
  );
}
