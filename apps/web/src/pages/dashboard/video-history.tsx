// Panel riwayat render (kolom kanan halaman Render Video) — dari pecahan
// video.tsx. Daftar job + filter status + pagination + aksi per job.
//
// Komponen diisolasi karena murni presentational: semua aksi (retry/delete/
// gallery toggle) di-pass dari hook useVideoRender, tidak ada state lokal
// selain filter & page miliknya sendiri.

import { Clapperboard, Film, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUS_META, type VideoJobRow } from "./video-types";

const HISTORY_PER_PAGE = 8;

type JobMutations = {
  retryJob: { isPending: boolean; mutate: (id: string) => void };
  deleteJob: { isPending: boolean; mutate: (id: string) => void };
  toggleGallery: {
    isPending: boolean;
    mutate: (vars: { id: string; published: boolean }) => void;
  };
};

export function VideoHistory({
  jobs,
  mutations,
}: {
  jobs: VideoJobRow[];
  mutations: JobMutations;
}) {
  const [filter, setFilter] = useState<"all" | VideoJobRow["status"]>("all");
  const [page, setPage] = useState(1);

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PER_PAGE));
  const pagedJobs = filtered.slice((page - 1) * HISTORY_PER_PAGE, page * HISTORY_PER_PAGE);

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[var(--text-secondary)] text-sm">Riwayat render</h2>
        <span className="text-[var(--text-muted)] text-xs">{filtered.length} job</span>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "done", "rendering", "failed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] transition",
              filter === f
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)]",
            )}
          >
            {f === "all"
              ? "Semua"
              : f === "done"
                ? "Selesai"
                : f === "rendering"
                  ? "Merender"
                  : "Gagal"}
          </button>
        ))}
      </div>

      {pagedJobs.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="h-5 w-5" />}
          title="Belum ada job render"
          description="Pilih base video di kiri dan mulai render pertama Anda."
        />
      ) : (
        <div className="space-y-2">
          {pagedJobs.map((job) => (
            <JobHistoryRow key={job.id} job={job} mutations={mutations} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[var(--text-muted)]">
            Hal {page} / {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobHistoryRow({ job, mutations }: { job: VideoJobRow; mutations: JobMutations }) {
  const meta = STATUS_META[job.status];
  const isBusy = job.status === "rendering" || job.status === "uploading";

  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5">
      {job.baseVideoThumbnailUrl ? (
        <img
          src={job.baseVideoThumbnailUrl}
          alt={job.baseVideoName ?? "video"}
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--bg-tertiary)]">
          <Film className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-xs">{job.baseVideoName ?? "video"}</span>
          <Badge className={cn("shrink-0 text-[10px]", meta.className)}>{meta.label}</Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <span>{formatRelativeTime(job.createdAt)}</span>
          <span>·</span>
          <span>{job.settings.orientation}</span>
        </div>
        {isBusy && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
            <div
              className="h-full bg-[var(--accent-gold)] transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
        {job.status === "failed" && job.errorMessage && (
          <p className="mt-0.5 truncate text-[10px] text-red-600" title={job.errorMessage}>
            {job.errorMessage}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {job.status === "done" && job.outputMediaId && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => window.open("/media", "_self")}
          >
            Lihat
          </Button>
        )}
        {(job.status === "failed" || job.status === "canceled") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5"
            disabled={mutations.retryJob.isPending}
            onClick={() => mutations.retryJob.mutate(job.id)}
            title="Render ulang"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        {job.status === "done" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            disabled={mutations.toggleGallery.isPending}
            onClick={() =>
              mutations.toggleGallery.mutate({
                id: job.id,
                published: !job.publishedToGallery,
              })
            }
            title={job.publishedToGallery ? "Hapus dari galeri publik" : "Publikasikan"}
          >
            {job.publishedToGallery ? "Privat" : "Publik"}
          </Button>
        )}
        {(job.status === "failed" || job.status === "canceled") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-red-600 hover:text-red-700"
            disabled={mutations.deleteJob.isPending}
            onClick={() => mutations.deleteJob.mutate(job.id)}
            title="Hapus dari riwayat"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
