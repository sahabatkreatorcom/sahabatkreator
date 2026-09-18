// Section Tren Media — data NYATA (bukan mock):
// - Lagu: Apple Music Top 100 Indonesia (RSS publik)
// - Video: YouTube mostPopular region ID (butuh akun YouTube org terhubung)
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Music2, Play, Sparkles, Video } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatCompact } from "@/lib/format";

type MusicTrendItem = {
  rank: number;
  title: string;
  artist: string;
  genre: string | null;
  artworkUrl: string | null;
  url: string | null;
};

type YoutubeTrendItem = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number | null;
  url: string;
};

function MusicCard({ song }: { song: MusicTrendItem }) {
  const navigate = useNavigate();
  return (
    <div className="card flex items-center gap-3 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] font-bold text-xs">
        {song.rank}
      </span>
      {song.artworkUrl ? (
        <img
          src={song.artworkUrl}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-[var(--radius-md)] object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]">
          <Music2 className="h-4 w-4 text-[var(--text-muted)]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-sm" title={song.title}>
          {song.title}
        </p>
        <p className="truncate text-[var(--text-secondary)] text-xs">{song.artist}</p>
        {song.genre && <p className="text-[11px] text-[var(--text-muted)]">{song.genre}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {song.url && (
          <a
            href={song.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-gold)]"
            title="Buka di Apple Music"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate("/compose", {
              state: {
                content: [
                  `Ide konten dari lagu yang sedang tren: "${song.title}" — ${song.artist}`,
                  "",
                  `Lagu ini sedang populer di Indonesia (peringkat #${song.rank} Apple Music${song.genre ? `, ${song.genre}` : ""}).`,
                  "",
                  "Susun konten Reels/TikTok yang memakai lagu ini dengan hook di 3 detik pertama.",
                ].join("\n"),
              },
            })
          }
        >
          <Sparkles className="h-3.5 w-3.5" />
          Pakai ide
        </Button>
      </div>
    </div>
  );
}

function YoutubeCard({ video }: { video: YoutubeTrendItem }) {
  const navigate = useNavigate();
  return (
    <div className="card overflow-hidden">
      {video.thumbnailUrl && (
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
        </a>
      )}
      <div className="p-3">
        <p className="line-clamp-2 font-semibold text-sm" title={video.title}>
          {video.title}
        </p>
        <p className="mt-0.5 truncate text-[var(--text-secondary)] text-xs">{video.channelTitle}</p>
        <div className="mt-1 flex items-center gap-2 text-[var(--text-muted)] text-xs">
          {typeof video.viewCount === "number" && (
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              {formatCompact(video.viewCount)} views
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Tonton
          </a>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() =>
              navigate("/compose", {
                state: {
                  content: [
                    `Ide konten dari video populer YouTube Indonesia: "${video.title}" (${video.channelTitle})`,
                    "",
                    "Adaptasi topik ini ke format konten Anda — jangan sekadar meniru, tambahkan sudut pandang/brand Anda.",
                  ].join("\n"),
                },
              })
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            Pakai ide
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MediaTrendsSection() {
  const musicQuery = useQuery({
    queryKey: ["trends-music"],
    queryFn: () =>
      api.get<{ songs: MusicTrendItem[]; available: boolean }>("/trends/music?limit=25"),
    staleTime: 30 * 60 * 1000,
  });

  const youtubeQuery = useQuery({
    queryKey: ["trends-youtube"],
    queryFn: () =>
      api.get<{
        videos: YoutubeTrendItem[];
        available: boolean;
        message?: string;
        reason?: string;
      }>("/trends/youtube?limit=12"),
    staleTime: 30 * 60 * 1000,
  });

  const songs = musicQuery.data?.songs ?? [];
  const videos = youtubeQuery.data?.videos ?? [];

  return (
    <div className="space-y-8">
      {/* Tren musik (Apple Music ID) */}
      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-xl">
            <Music2 className="h-5 w-5 text-[var(--accent-gold)]" />
            Lagu Populer Indonesia
          </h2>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Chart Apple Music Indonesia (data nyata) — manfaatkan untuk Reels/TikTok.
          </p>
        </div>
        {musicQuery.isLoading ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat chart…
          </div>
        ) : songs.length === 0 ? (
          <p className="card p-4 text-[var(--text-secondary)] text-sm">
            Chart lagu belum bisa diambil saat ini.
          </p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {songs.map((song) => (
              <MusicCard key={`${song.rank}-${song.title}`} song={song} />
            ))}
          </div>
        )}
      </section>

      {/* Video populer YouTube ID */}
      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-xl">
            <Video className="h-5 w-5 text-red-500" />
            Video Populer YouTube Indonesia
          </h2>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Paling banyak ditonton hari ini (region Indonesia) — sumber ide konten.
          </p>
        </div>
        {youtubeQuery.isLoading ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat video…
          </div>
        ) : !youtubeQuery.data?.available ? (
          <p className="card p-4 text-[var(--text-secondary)] text-sm">
            {youtubeQuery.data?.message ??
              "Video populer belum tersedia. Hubungkan akun YouTube untuk mengaktifkan."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map((video) => (
              <YoutubeCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
