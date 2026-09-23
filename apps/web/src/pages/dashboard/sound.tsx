// Halaman Sound — upload & kelola library BGM untuk render video
//
// API: GET /sound (list), POST /sound/upload (upload), PATCH /sound/:id (rename),
// DELETE /sound/:id (hapus). Durasi + waveform dikirim client (Web Audio API).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Music, Pause, Play, Search, Trash2, Upload, VolumeX } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

type SoundTrack = {
  id: string;
  name: string;
  url: string;
  durationSeconds: number;
  waveformData: number[] | null;
  isFeatured: boolean;
  category: string | null;
  mimeType: string;
  sizeBytes: number;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Decode audio client-side: durasi riil + waveform 100 sampel (Web Audio API) */
async function analyzeAudio(file: File): Promise<{ durationSeconds: number; waveform: number[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const SAMPLES = 100;
    const block = Math.floor(channel.length / SAMPLES) || 1;
    const waveform: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      let peak = 0;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(channel[i * block + j] ?? 0);
        if (v > peak) peak = v;
      }
      waveform.push(Math.round(peak * 100) / 100);
    }
    return { durationSeconds: audioBuffer.duration, waveform };
  } finally {
    void ctx.close();
  }
}

export function SoundPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"mine" | "featured">("mine");
  const [q, setQ] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sound-tracks"],
    queryFn: () => api.get<{ items: SoundTrack[]; storageConfigured: boolean }>("/sound"),
  });

  const uploadSound = useMutation({
    mutationFn: async (file: File) => {
      const analysis = await analyzeAudio(file);
      if (analysis.durationSeconds < 1) {
        throw new Error("Durasi audio terlalu pendek (minimal 1 detik)");
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));
      formData.append("durationSeconds", String(Math.round(analysis.durationSeconds)));
      formData.append("waveform", JSON.stringify(analysis.waveform));
      return api.upload<{ track: SoundTrack }>("/sound/upload", formData);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["sound-tracks"] });
      toast.success(`Sound "${res.track.name}" diupload`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSound = useMutation({
    mutationFn: (id: string) => api.delete(`/sound/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["sound-tracks"] });
      toast.success("Sound dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (data?.items ?? []).filter(
    (t) =>
      (tab === "featured" ? t.isFeatured : !t.isFeatured) &&
      (q ? t.name.toLowerCase().includes(q.toLowerCase()) : true),
  );

  function togglePlay(track: SoundTrack) {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlayingId(null);
    }
    if (playingId === track.id) {
      audioRef.current.pause();
      setPlayingId(null);
    } else {
      audioRef.current.src = track.url;
      void audioRef.current.play().catch(() => toast.error("Gagal memutar audio"));
      setPlayingId(track.id);
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Music className="h-5 w-5" /> Sound / BGM
        </h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Kelola library background music untuk render video. Upload file audio
          (MP3/WAV, maks 20MB) — durasi & waveform dideteksi otomatis.
        </p>
      </div>

      {/* Tab + Search + Upload */}
      <div className="card p-4">
        <div className="mb-3 flex gap-1 border-[var(--border-light)] border-b">
          {(
            [
              { key: "mine", label: "Sound Saya" },
              { key: "featured", label: "Featured" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === t.key
                  ? "border-[var(--accent-gold)] font-medium text-[var(--accent-gold)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari sound..."
              className="h-9 pl-9 text-sm"
            />
          </div>
          {tab === "mine" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadSound.isPending || !data?.storageConfigured}
            >
              {uploadSound.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/wave,audio/x-m4a,audio/ogg,audio/webm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadSound.mutate(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* List */}
        {items.length === 0 ? (
          <EmptyState
            icon={<Music className="h-5 w-5" />}
            title={tab === "mine" ? "Belum ada sound" : "Belum ada featured sound"}
            description={
              tab === "mine"
                ? "Upload file audio (MP3/WAV, maks 20MB) untuk BGM render video."
                : "Belum ada featured sound dari platform."
            }
          />
        ) : (
          <div className="space-y-1">
            {items.map((track) => (
              <div
                key={track.id}
                className="group flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 hover:bg-[var(--bg-tertiary)]"
              >
                <button
                  type="button"
                  onClick={() => togglePlay(track)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--accent-gold)] hover:text-white"
                  aria-label={playingId === track.id ? "Jeda" : "Putar"}
                >
                  {playingId === track.id ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Waveform mini */}
                {track.waveformData && (
                  <div className="hidden h-6 w-20 shrink-0 items-end gap-px sm:flex">
                    {track.waveformData.slice(0, 40).map((v, i) => (
                      <div
                        key={i}
                        className="w-full rounded-sm bg-[var(--accent-gold)] opacity-40"
                        style={{ height: `${Math.max(2, v * 100)}%` }}
                      />
                    ))}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{track.name}</p>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{formatDuration(track.durationSeconds)}</span>
                    <span>·</span>
                    <span>{formatBytes(track.sizeBytes)}</span>
                    {track.category && (
                      <>
                        <span>·</span>
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">
                          {track.category}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                {playingId === track.id && (
                  <VolumeX
                    className="h-4 w-4 shrink-0 cursor-pointer text-[var(--accent-gold)]"
                    onClick={() => {
                      audioRef.current?.pause();
                      setPlayingId(null);
                    }}
                  />
                )}

                {!track.isFeatured && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-red-600 opacity-0 transition-opacity hover:text-red-700 group-hover:opacity-100"
                    disabled={removeSound.isPending}
                    onClick={() => {
                      if (confirm(`Hapus sound "${track.name}"?`)) removeSound.mutate(track.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
