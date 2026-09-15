// Landing push "Post Gagal" — dibuka dari web push notification post_failed.
// Menampilkan error publish, preview caption + media, dan aksi:
// - Retry Publishing → POST /posts/:id/publish (publish ulang post failed)
// - Buka Composer → edit post group sebelum retry manual
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

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

/** Saran perbaikan berdasarkan kode error umum */
function suggestionFor(code: string | null): string {
  switch (code) {
    case "token_expired":
      return "Sesi platform sudah kedaluwarsa. Hubungkan ulang akun di halaman Akun, lalu coba lagi.";
    case "insufficient_permissions":
      return "Aplikasi belum diberi izin publish oleh platform. Hubungkan ulang akun dan setujui semua izin yang diminta.";
    case "rate_limited":
      return "Platform sedang membatasi jumlah posting. Tunggu beberapa menit lalu coba lagi.";
    case "media_invalid":
      return "Media tidak memenuhi spesifikasi platform (format/durasi/ukuran). Periksa media lalu publish ulang.";
    case "tiktok_publish_failed":
      return "TikTok menolak media ini — bila berupa foto, pastikan formatnya JPEG/WebP (PNG tidak didukung). Konversi lewat editor gambar/resize di media library, lalu publish ulang.";
    case "tiktok_photo_format":
      return "TikTok hanya mendukung foto JPEG/WebP. Konversi foto lewat editor gambar atau fitur resize di media library, lalu publish ulang.";
    case "duplicate_content":
      return "Platform mendeteksi konten duplikat. Ubah caption atau media sebelum mencoba lagi.";
    default:
      return "Periksa koneksi akun dan coba lagi. Jika masih gagal, publish manual di platform.";
  }
}

export function PostFailedPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const groupId = params.get("groupId");
  const autoRetry = params.get("action") === "retry";
  const [retryDone, setRetryDone] = useState(false);

  const { data, isLoading, isError } = useQuery<LandingResponse>({
    queryKey: ["post-landing", groupId],
    queryFn: () => api.get<LandingResponse>(`/posts/${groupId}/landing`),
    enabled: Boolean(groupId),
    retry: false,
  });

  const retryMutation = useMutation({
    mutationFn: () => api.post(`/posts/${groupId}/publish`),
    onSuccess: () => {
      setRetryDone(true);
      // Beri waktu user melihat status lalu arahkan ke antrean
      setTimeout(() => navigate("/queue"), 2500);
    },
  });

  // Auto-retry bila push membawa ?action=retry
  useEffect(() => {
    if (autoRetry && data && !retryMutation.isPending && !retryDone) {
      retryMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRetry, data]);

  if (!groupId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
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

  const failedPosts = (data?.posts ?? []).filter((p) => p.status === "failed");
  const otherPosts = (data?.posts ?? []).filter((p) => p.status !== "failed");

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
          {retryDone || retryMutation.isSuccess ? (
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
          ) : (
            <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-destructive" />
          )}
          <h1 className="font-bold text-xl">
            {retryDone || retryMutation.isSuccess ? "Retry dikirim" : "Post gagal tayang"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {retryDone || retryMutation.isSuccess
              ? "Post dimasukkan kembali ke antrean. Mengalihkan ke halaman antrean…"
              : "Ada post yang tidak berhasil dipublikasikan ke platform. Berikut detailnya."}
          </p>
          {data?.group.scheduledAt && (
            <p className="mt-2 inline-flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3 w-3" />
              Dijadwalkan {formatRelativeTime(new Date(data.group.scheduledAt))}
            </p>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat detail post…
          </div>
        )}

        {isError && (
          <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm shadow-sm">
            Post tidak ditemukan atau Anda tidak punya akses.
            <Button variant="outline" className="mt-4 w-full" onClick={() => navigate("/posts")}>
              Buka Daftar Post
            </Button>
          </div>
        )}

        {/* Error per platform */}
        {failedPosts.map((p) => (
          <div
            key={p.id}
            className="space-y-3 rounded-xl border border-destructive/30 bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold capitalize">{p.platform}</span>
              <Badge variant="destructive">Gagal</Badge>
            </div>
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-mono text-destructive text-xs">{p.errorCode ?? "unknown_error"}</p>
              <p className="mt-1 text-foreground">
                {p.errorMessage ?? "Terjadi kesalahan saat publish."}
              </p>
            </div>
            <p className="text-muted-foreground text-xs">💡 {suggestionFor(p.errorCode)}</p>
          </div>
        ))}

        {/* Post lain dalam group */}
        {otherPosts.length > 0 && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-sm">Post lain di grup ini</h2>
            <ul className="mt-3 space-y-2">
              {otherPosts.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{p.platform}</span>
                  <span className="flex items-center gap-2 text-muted-foreground text-xs">
                    {p.status === "published" && p.platformPostUrl ? (
                      <a
                        href={p.platformPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Terbit <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="capitalize">{p.status}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Preview caption + media */}
        {data && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-sm">Preview</h2>
            {data.group.content.trim() && (
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
                {data.group.content.slice(0, 400)}
                {data.group.content.length > 400 ? "…" : ""}
              </p>
            )}
            {data.media.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.media
                  .slice(0, 4)
                  .map((m) =>
                    m.type === "image" ? (
                      <img
                        key={m.url}
                        src={m.url}
                        alt={m.name}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <video
                        key={m.url}
                        src={m.url}
                        className="h-16 w-16 rounded-lg object-cover"
                        muted
                      />
                    ),
                  )}
              </div>
            )}
          </div>
        )}

        {/* Aksi */}
        {data && (
          <div className="space-y-3">
            <Button
              className="w-full"
              disabled={retryMutation.isPending || failedPosts.length === 0}
              onClick={() => retryMutation.mutate()}
            >
              {retryMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mencoba ulang…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" /> Coba Publish Ulang
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate(`/publish-ready?groupId=${groupId}`)}
            >
              Posting Manual
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
              Nanti saja
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
