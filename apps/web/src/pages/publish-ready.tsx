// Landing push "Siap Publish" — dibuka dari push pengingat/published.
// Auto-copy caption ke clipboard + auto-download media + deep link ke platform,
// sehingga user tinggal paste di aplikasi platform (posting manual).
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, ExternalLink, Loader2, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type LandingPost = {
  id: string;
  platform: string;
  status: string;
  content: string | null;
  platformPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
};

type LandingResponse = {
  group: {
    id: string;
    content: string;
    scheduledAt: string | null;
    timezone: string;
  };
  posts: LandingPost[];
  media: { name: string; type: string; url: string; mimeType: string }[];
};

/** Web URL platform untuk posting manual (fallback deep link app) */
const PLATFORM_WEB_URLS: Record<string, string> = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/upload",
  facebook: "https://www.facebook.com/",
  x: "https://x.com/compose/post",
  twitter: "https://x.com/compose/post",
  youtube: "https://studio.youtube.com/",
  linkedin: "https://www.linkedin.com/feed/",
  linkedin_org: "https://www.linkedin.com/feed/",
  pinterest: "https://www.pinterest.com/",
  threads: "https://www.threads.net/",
  bluesky: "https://bsky.app/intent/compose",
  gmb: "https://business.google.com/",
  whatsapp: "https://web.whatsapp.com/",
  manual: "",
};

export function PublishReadyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const groupId = params.get("groupId");
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const { data, isLoading, isError } = useQuery<LandingResponse>({
    queryKey: ["post-landing", groupId],
    queryFn: () => api.get<LandingResponse>(`/posts/${groupId}/landing`),
    enabled: Boolean(groupId),
    retry: false,
  });

  // Fire-and-forget tandai published (posting manual selesai)
  const markMutation = useMutation({
    mutationFn: () => api.patch(`/posts/${groupId}`, { scheduledAt: new Date().toISOString() }),
  });

  // Auto-copy caption sekali saat data siap
  useEffect(() => {
    if (!data?.group.content || copied) return;
    navigator.clipboard
      .writeText(data.group.content)
      .then(() => setCopied(true))
      .catch(() => {
        /* clipboard butuh interaksi user di beberapa browser — abaikan */
      });
  }, [data, copied]);

  // Auto-download media sekali saat data siap
  useEffect(() => {
    if (!data?.media?.length || downloaded) return;
    setDownloaded(true);
    for (const m of data.media.slice(0, 5)) {
      fetch(m.url)
        .then((res) => res.blob())
        .then((blob) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = m.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(link.href);
        })
        .catch(() => {
          /* best-effort */
        });
    }
  }, [data, downloaded]);

  if (!groupId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <PartyPopper className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h1 className="font-semibold text-lg">Tautan tidak valid</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Notifikasi tidak menyertakan post yang dimaksud.
          </p>
          <Button className="mt-6 w-full" onClick={() => navigate("/dashboard")}>
            Kembali ke Dashboard
          </Button>
        </div>
      </main>
    );
  }

  const publishedPosts = (data?.posts ?? []).filter((p) => p.status === "published");

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
          <PartyPopper className="mx-auto mb-3 h-12 w-12 text-primary" />
          <h1 className="font-bold text-xl">Siap tayang!</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Caption sudah {copied ? "tersalin" : "disalin"} ke clipboard
            {data?.media?.length ? ` dan ${data.media.length} media diunduh otomatis` : ""}. Buka
            platform untuk menyelesaikan posting.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat detail post…
          </div>
        )}

        {isError && (
          <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm shadow-sm">
            Post tidak ditemukan atau Anda tidak punya akses.
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => navigate("/dashboard")}
            >
              Kembali ke Dashboard
            </Button>
          </div>
        )}

        {/* Status publish per platform */}
        {publishedPosts.length > 0 && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-sm">Berhasil tayang otomatis</h2>
            <ul className="mt-3 space-y-2">
              {publishedPosts.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{p.platform}</span>
                  {p.platformPostUrl ? (
                    <a
                      href={p.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Lihat post <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <Badge variant="secondary">Terbit</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Preview caption */}
        {data?.group.content?.trim() && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Caption</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard
                    .writeText(data.group.content)
                    .then(() => setCopied(true))
                    .catch(() => {});
                }}
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3" /> Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" /> Salin
                  </>
                )}
              </Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
              {data.group.content.slice(0, 600)}
              {data.group.content.length > 600 ? "…" : ""}
            </p>
          </div>
        )}

        {/* Media */}
        {data?.media && data.media.length > 0 && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-sm">Media</h2>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {data.media
                .slice(0, 8)
                .map((m) =>
                  m.type === "image" ? (
                    <img
                      key={m.url}
                      src={m.url}
                      alt={m.name}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ) : (
                    <video
                      key={m.url}
                      src={m.url}
                      className="aspect-square w-full rounded-lg object-cover"
                      muted
                    />
                  ),
                )}
            </div>
            <a
              href={data.media[0]?.url}
              download
              className="mt-3 inline-flex items-center gap-1 text-primary text-xs hover:underline"
            >
              <Download className="h-3 w-3" /> Unduh ulang media
            </a>
          </div>
        )}

        {/* Buka platform */}
        {data && data.posts.some((p) => p.status !== "published") && (
          <div className="space-y-2">
            {Array.from(
              new Set(data.posts.filter((p) => p.status !== "published").map((p) => p.platform)),
            ).map((platform) => (
              <Button
                key={platform}
                className="w-full"
                onClick={() => {
                  const url = PLATFORM_WEB_URLS[platform];
                  if (url) window.open(url, "_blank", "noopener");
                  markMutation.mutate();
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Buka {platform}
              </Button>
            ))}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={() => navigate("/calendar")}>
          Lihat Kalender
        </Button>
      </div>
    </main>
  );
}
