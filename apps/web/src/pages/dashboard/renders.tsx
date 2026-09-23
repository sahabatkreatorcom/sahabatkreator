// Halaman Renders — pustaka video hasil render (manifest via API terauthentikasi)
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Clapperboard,
  Copy,
  Download,
  Film,
  Monitor,
  Smartphone,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Satu entry manifest — dibangun dari job done yang opt-in publikasi. */
type RenderEntry = {
  id: string;
  project: string;
  title: string;
  orientation: "landscape" | "portrait" | "square";
  videoUrl: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  commitSha: string;
  branch: string;
  renderedAt: string;
};

type RendersManifest = {
  version: number;
  generatedAt: string;
  renders: RenderEntry[];
};

type OrientationFilter = "all" | "landscape" | "portrait" | "square";

const ORIENTATION_META: Record<
  OrientationFilter,
  { label: string; icon: typeof Monitor }
> = {
  all: { label: "Semua", icon: Film },
  landscape: { label: "Landscape 16:9", icon: Monitor },
  portrait: { label: "Portrait 9:16", icon: Smartphone },
  square: { label: "Square 1:1", icon: Film },
};

export function RendersPage() {
  const [filter, setFilter] = useState<OrientationFilter>("all");
  const [preview, setPreview] = useState<RenderEntry | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["renders-manifest"],
    queryFn: () => api.get<RendersManifest>("/renders/manifest"),
    staleTime: 60_000,
    retry: 1,
  });

  const renders = useMemo(() => {
    const list = data?.renders ?? [];
    return [...list].sort(
      (a, b) => new Date(b.renderedAt).getTime() - new Date(a.renderedAt).getTime(),
    );
  }, [data]);

  const counts = useMemo(() => {
    return {
      all: renders.length,
      landscape: renders.filter((r) => r.orientation === "landscape").length,
      portrait: renders.filter((r) => r.orientation === "portrait").length,
      square: renders.filter((r) => r.orientation === "square").length,
    } satisfies Record<OrientationFilter, number>;
  }, [renders]);

  const visible = useMemo(
    () => (filter === "all" ? renders : renders.filter((r) => r.orientation === filter)),
    [renders, filter],
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <PageHeader />
        <PageLoader label="Memuat manifest render…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <PageHeader />
        <EmptyState
          icon={<X className="h-6 w-6" />}
          title="Tidak dapat memuat manifest"
          description="URL manifest tidak bisa dijangkau atau formatnya rusak. Periksa konfigurasi R2 dan apakah publish job CI sudah berjalan."
          action={
            <Button variant="outline" onClick={() => window.location.reload()}>
              Coba lagi
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <PageHeader total={renders.length} lastGenerated={data?.generatedAt} />

      {/* Filter orientasi */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(ORIENTATION_META) as OrientationFilter[]).map((key) => {
          const meta = ORIENTATION_META[key];
          const Icon = meta.icon;
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-transparent bg-gradient text-white"
                  : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {meta.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-white/20" : "bg-[var(--bg-tertiary)]",
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="h-6 w-6" />}
          title="Belum ada video untuk orientasi ini"
          description="Render pertama Anda akan muncul di sini setelah publish job CI selesai mengunggah manifest."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((render) => (
            <RenderCard key={render.id} render={render} onPreview={setPreview} />
          ))}
        </div>
      )}

      <PreviewModal render={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function PageHeader({ total, lastGenerated }: { total?: number; lastGenerated?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-6 w-6 text-[var(--accent-gold)]" />
        <h1 className="text-2xl font-bold tracking-tight">Video Renders</h1>
        {total !== undefined && (
          <Badge variant="primary" className="ml-1">
            {total} video
          </Badge>
        )}
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        Hasil render otomatis dari CI — siap dipakai untuk TikTok, Reels, Shorts, atau YouTube.
        {lastGenerated
          ? ` Diperbarui ${formatRelativeTime(lastGenerated)}.`
          : ""}
      </p>
    </div>
  );
}

function RenderCard({
  render,
  onPreview,
}: {
  render: RenderEntry;
  onPreview: (render: RenderEntry) => void;
}) {
  const isPortrait = render.orientation === "portrait";

  return (
    <Card className="group overflow-hidden p-0">
      {/* Preview — aspect ratio mengikuti orientasi asli */}
      <button
        type="button"
        onClick={() => onPreview(render)}
        className={cn(
          "relative block w-full cursor-zoom-in bg-black",
          isPortrait ? "aspect-[9/16]" : "aspect-video",
        )}
        aria-label={`Pratinjau ${render.title}`}
      >
        <video
          src={render.videoUrl}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          playsInline
          // Putar saat hover untuk preview cepat
          onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <Badge
          variant="default"
          className="absolute top-2 left-2 bg-black/70 text-white backdrop-blur-sm"
        >
          {isPortrait ? "9:16" : render.orientation === "square" ? "1:1" : "16:9"}
        </Badge>
        <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {render.durationSeconds}s
        </span>
      </button>

      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-1 font-semibold">{render.title}</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {render.project} · {render.width}×{render.height} · {formatBytes(render.sizeBytes)}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Render {formatRelativeTime(render.renderedAt)}
            {render.branch ? ` · ${render.branch}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CopyLinkButton url={render.videoUrl} />
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onPreview(render)}
          >
            <Film className="h-4 w-4" />
            Pratinjau
          </Button>
          <a href={render.videoUrl} download target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" />
              Unduh
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link video disalin");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin link");
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-label="Salin link video">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function PreviewModal({
  render,
  onClose,
}: {
  render: RenderEntry | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!render}
      onClose={onClose}
      title={render?.title ?? ""}
      description={
        render
          ? `${render.project} · ${render.width}×${render.height} · ${render.durationSeconds}s`
          : undefined
      }
      size="xl"
    >
      {render && (
        <div className="space-y-4">
          <div className="flex justify-center bg-black rounded-[var(--radius-md)] overflow-hidden">
            <video
              key={render.videoUrl}
              src={render.videoUrl}
              className="max-h-[60vh] w-auto"
              controls
              autoPlay
              playsInline
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <CopyLinkButton url={render.videoUrl} />
            <a href={render.videoUrl} download target="_blank" rel="noopener noreferrer">
              <Button variant="primary">
                <Download className="h-4 w-4" />
                Unduh MP4
              </Button>
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default RendersPage;
