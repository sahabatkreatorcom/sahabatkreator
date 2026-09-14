// Modal detail post dari kalender. Post native → fetch /posts/:id/landing
// (group + posts + media). Post eksternal (virtual group, id = post id —
// bukan id post group) → render langsung dari data group kalender.
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import type { CalendarPostGroup } from "./shared";

type LandingResponse = {
  group: {
    id: string;
    content: string;
    scheduledAt: string | null;
    timezone: string;
  };
  posts: {
    id: string;
    platform: string;
    status: string;
    content: string;
    platformPostUrl: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    publishedAt: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  }[];
  media: {
    name: string;
    type: string;
    url: string;
    thumbnailUrl: string | null;
    mimeType: string;
  }[];
};

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "secondary" | "success" | "danger" | "warning" | "info" }
> = {
  draft: { label: "Draf", variant: "secondary" },
  scheduled: { label: "Terjadwal", variant: "info" },
  publishing: { label: "Publishing", variant: "warning" },
  processing: { label: "Diproses", variant: "warning" },
  published: { label: "Terbit", variant: "success" },
  failed: { label: "Gagal", variant: "danger" },
  canceled: { label: "Dibatalkan", variant: "secondary" },
};

type PostDetailModalProps = {
  /** Post group terpilih dari data kalender — null = modal tertutup */
  group: CalendarPostGroup | null;
  onClose: () => void;
};

export function PostDetailModal({ group, onClose }: PostDetailModalProps) {
  // Hanya post native yang di-fetch — eksternal dirender dari data group
  const nativeGroupId = group && !group.isExternal ? group.id : null;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["post-landing", nativeGroupId],
    queryFn: () => api.get<LandingResponse>(`/posts/${nativeGroupId}/landing`),
    enabled: nativeGroupId !== null,
    retry: false,
  });

  return (
    <Modal open={Boolean(group)} onClose={onClose} title="Detail Post" size="lg">
      {group?.isExternal ? (
        // Post eksternal — data terbatas dari sync platform
        <ExternalDetail group={group} />
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[var(--text-muted)] text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat detail…
        </div>
      ) : isError || !data ? (
        <div className="flex flex-col items-center gap-2 py-12 text-[var(--text-muted)] text-sm">
          <AlertCircle className="h-6 w-6 text-[var(--error)]" />
          Detail post tidak dapat dimuat.
        </div>
      ) : (
        <div className="space-y-5">
          {data.group.scheduledAt && (
            <p className="flex items-center gap-1.5 text-[var(--text-secondary)] text-sm">
              <CalendarClock className="h-4 w-4 text-[var(--text-muted)]" />
              {formatDate(data.group.scheduledAt, "long")}
            </p>
          )}

          {data.media.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.media.map((m) =>
                m.mimeType.startsWith("image/") ? (
                  <img
                    key={m.url}
                    src={m.url}
                    alt={m.name}
                    className="aspect-square w-full rounded-[var(--radius-md)] object-cover"
                    loading="lazy"
                  />
                ) : (
                  <video
                    key={m.url}
                    src={m.url}
                    poster={m.thumbnailUrl ?? undefined}
                    muted
                    playsInline
                    preload="metadata"
                    className="aspect-square w-full rounded-[var(--radius-md)] object-cover"
                  />
                ),
              )}
            </div>
          )}

          <div>
            <h3 className="mb-1.5 font-medium text-[var(--text-secondary)] text-xs uppercase">
              Caption
            </h3>
            <p className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-sm">
              {data.group.content || "(tanpa caption)"}
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 font-medium text-[var(--text-secondary)] text-xs uppercase">
              Akun
            </h3>
            <div className="space-y-2">
              {data.posts.map((p) => {
                const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                const Icon = cfg?.icon;
                const badge = STATUS_BADGE[p.status];
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-light)] p-2.5"
                  >
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: cfg?.color }} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.displayName || p.username || cfg?.label || p.platform}
                      {p.username && p.displayName ? (
                        <span className="text-[var(--text-muted)]"> · @{p.username}</span>
                      ) : null}
                    </span>
                    {badge && (
                      <Badge variant={badge.variant} className="shrink-0">
                        {badge.label}
                      </Badge>
                    )}
                    {p.platformPostUrl && (
                      <a
                        href={p.platformPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Buka post di platform"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {data.posts.some((p) => p.status === "failed") && (
            <div>
              <h3 className="mb-1.5 font-medium text-[var(--text-secondary)] text-xs uppercase">
                Error
              </h3>
              <div className="space-y-1.5">
                {data.posts
                  .filter((p) => p.status === "failed")
                  .map((p) => (
                    <p
                      key={p.id}
                      className="rounded-[var(--radius-md)] bg-[var(--error-light)] p-2 text-[var(--error)] text-xs"
                    >
                      {p.errorMessage ?? p.errorCode ?? "Gagal dipublikasikan"}
                    </p>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Detail post eksternal — dipublikasikan langsung di platform (bukan via SK) */
function ExternalDetail({ group }: { group: CalendarPostGroup }) {
  const post = group.posts[0];
  const cfg = post ? PLATFORMS[post.platform as keyof typeof PLATFORMS] : undefined;
  const Icon = cfg?.icon;

  return (
    <div className="space-y-5">
      {post?.externalThumbnailUrl && (
        <img
          src={post.externalThumbnailUrl}
          alt=""
          className="max-h-64 w-full rounded-[var(--radius-md)] object-cover"
        />
      )}

      {group.scheduledAt && (
        <p className="flex items-center gap-1.5 text-[var(--text-secondary)] text-sm">
          <CalendarClock className="h-4 w-4 text-[var(--text-muted)]" />
          Terbit {formatDate(group.scheduledAt, "long")}
        </p>
      )}

      <div>
        <h3 className="mb-1.5 font-medium text-[var(--text-secondary)] text-xs uppercase">
          Caption
        </h3>
        <p className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3 text-sm">
          {group.content || "(tanpa caption)"}
        </p>
      </div>

      <div>
        <h3 className="mb-1.5 font-medium text-[var(--text-secondary)] text-xs uppercase">Akun</h3>
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-light)] p-2.5">
          {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: cfg?.color }} />}
          <span className="min-w-0 flex-1 truncate text-sm">
            {cfg?.label ?? post?.platform}
            {post?.username ? (
              <span className="text-[var(--text-muted)]"> · @{post.username}</span>
            ) : null}
          </span>
          <Badge variant="outline" className="shrink-0">
            Konten platform
          </Badge>
          {post?.externalUrl && (
            <a
              href={post.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Buka post di platform"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
