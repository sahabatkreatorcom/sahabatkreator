// SoundPicker — panel pilih musik/sound untuk konten video di compose
// Durasi riil dihitung client via Web Audio API saat upload (bukan hardcode seperti
// reference app), waveform 100 sampel untuk visualisasi.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Music, Pause, Play, Search, Trash2, Upload, VolumeX } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export type SoundTrack = {
  id: string;
  name: string;
  url: string;
  durationSeconds: number;
  waveformData: number[] | null;
  isFeatured: boolean;
  category: string | null;
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

export function SoundPicker({
  selectedTrackId,
  onSelect,
}: {
  selectedTrackId: string | null;
  onSelect: (track: SoundTrack | null) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"mine" | "featured">("mine");
  const [q, setQ] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["sound-tracks"],
    queryFn: () => api.get<{ items: SoundTrack[]; storageConfigured: boolean }>("/sound"),
  });

  const uploadSound = useMutation({
    mutationFn: async (file: File) => {
      // Analisa durasi riil + waveform dulu — server menolak durasi 0
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
      if (id === selectedTrackId) onSelect(null);
      toast.success("Sound dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (data?.items ?? []).filter(
    (t) =>
      (tab === "featured" ? t.isFeatured : !t.isFeatured) &&
      (q ? t.name.toLowerCase().includes(q.toLowerCase()) : true),
  );
  const selected = (data?.items ?? []).find((t) => t.id === selectedTrackId) ?? null;

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

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Music className="h-4 w-4" />
        Musik / Sound
      </h2>
      <p className="mb-4 text-[var(--text-muted)] text-xs">
        Untuk konten video (TikTok/Reels). Sound hanya sebagai referensi produksi — platform
        menangani mixing saat upload.
      </p>

      {/* Track terpilih */}
      {selected && (
        <div className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--accent-gold)] bg-[var(--accent-gold-light)] p-3">
          <button
            type="button"
            onClick={() => togglePlay(selected)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-gold)] text-white"
            aria-label={playingId === selected.id ? "Jeda" : "Putar"}
          >
            {playingId === selected.id ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{selected.name}</p>
            <p className="text-[var(--text-muted)] text-xs">
              {formatDuration(selected.durationSeconds)}
              {selected.category ? ` · ${selected.category}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 text-[var(--text-muted)] hover:text-red-500"
            aria-label="Hapus sound"
          >
            <VolumeX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tab */}
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

      {/* Search + Upload */}
      <div className="mb-3 flex gap-2">
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
        <p className="py-6 text-center text-[var(--text-muted)] text-xs">
          {tab === "mine"
            ? "Belum ada sound. Upload file audio (MP3/WAV, maks 20MB)."
            : "Belum ada featured sound dari platform."}
        </p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {items.map((track) => {
            const isSelected = track.id === selectedTrackId;
            return (
              <div
                key={track.id}
                className={`group flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 ${
                  isSelected ? "bg-[var(--accent-gold-light)]" : "hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => togglePlay(track)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--accent-gold)] hover:text-white"
                  aria-label={playingId === track.id ? "Jeda" : "Putar"}
                >
                  {playingId === track.id ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(isSelected ? null : track)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{track.name}</span>
                    <span className="block text-[10px] text-[var(--text-muted)]">
                      {formatDuration(track.durationSeconds)}
                      {track.category ? ` · ${track.category}` : ""}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="shrink-0 font-medium text-[10px] text-[var(--accent-gold)]">
                      terpilih
                    </span>
                  )}
                </button>
                {!track.isFeatured && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Hapus sound "${track.name}"?`)) removeSound.mutate(track.id);
                    }}
                    className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    aria-label="Hapus sound"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
