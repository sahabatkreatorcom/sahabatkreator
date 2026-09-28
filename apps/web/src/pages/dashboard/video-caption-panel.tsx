// Panel Auto-caption (Whisper) + Headline — dari pecahan video.tsx.
//
// Murni kontrol form; menulis caption + captionEnabled + headline* milik
// halaman. Tidak tahu kontrak server.
import { Captions, Type } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type CaptionSettings, FONT_COLORS, LANGS, WHISPER_MODELS } from "./video-types";

export function CaptionPanel({
  caption,
  captionEnabled,
  setCaption,
  setCaptionEnabled,
  voiceoverId,
  bgmTrackId,
  removeOriginalAudio,
}: {
  caption: CaptionSettings;
  captionEnabled: boolean;
  setCaption: (v: CaptionSettings | ((prev: CaptionSettings) => CaptionSettings)) => void;
  setCaptionEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  voiceoverId: string | null;
  bgmTrackId: string | null;
  removeOriginalAudio: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Captions className="h-4 w-4" /> Auto-caption (Whisper)
      </Label>
      <button
        type="button"
        onClick={() => setCaptionEnabled((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition",
          captionEnabled
            ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
            : "border-[var(--border)] text-[var(--text-secondary)]",
        )}
      >
        <span
          className={cn(
            "h-4 w-7 rounded-full p-0.5 transition",
            captionEnabled ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]",
          )}
        >
          <span
            className={cn(
              "block h-3 w-3 rounded-full bg-white transition",
              captionEnabled ? "translate-x-3" : "translate-x-0",
            )}
          />
        </span>
        {captionEnabled ? "Subtitle aktif" : "Subtitle nonaktif"}
      </button>

      {captionEnabled && !voiceoverId && !bgmTrackId && removeOriginalAudio && (
        <p className="text-[var(--text-muted)] text-xs">
          Tidak ada audio untuk ditranskripsi: pilih voiceover atau BGM, atau pertahankan audio asli
          di atas. Tanpa itu, subtitle tidak akan muncul di hasil render.
        </p>
      )}

      {captionEnabled && (
        <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">Bahasa</Label>
            <Select
              className="w-full"
              value={caption.language}
              onChange={(e) =>
                setCaption((c) => ({
                  ...c,
                  language: e.target.value as CaptionSettings["language"],
                }))
              }
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">Model Whisper</Label>
            <Select
              className="w-full"
              value={caption.model}
              onChange={(e) =>
                setCaption((c) => ({
                  ...c,
                  model: e.target.value as CaptionSettings["model"],
                }))
              }
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">
              Ukuran font — {caption.fontSize}px
            </Label>
            <input
              type="range"
              min={12}
              max={72}
              step={1}
              value={caption.fontSize}
              onChange={(e) => setCaption((c) => ({ ...c, fontSize: Number(e.target.value) }))}
              className="w-full accent-[var(--accent-gold)]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">Posisi subtitle</Label>
            <div className="flex gap-1.5">
              {(["bottom", "center", "top"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCaption((c) => ({ ...c, position: p }))}
                  className={cn(
                    "flex-1 rounded-[var(--radius-md)] border px-1.5 py-1 text-xs transition",
                    caption.position === p
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)] text-[var(--text-secondary)]",
                  )}
                >
                  {p === "bottom" ? "Bawah" : p === "center" ? "Tengah" : "Atas"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">Warna teks</Label>
            <div className="flex gap-1.5">
              {FONT_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setCaption((c) => ({ ...c, fontColor: col }))}
                  className={cn(
                    "h-7 flex-1 rounded-[var(--radius-md)] border transition",
                    caption.fontColor === col
                      ? "ring-2 ring-[var(--accent-gold)] ring-offset-1"
                      : "",
                  )}
                  style={{
                    backgroundColor:
                      col === "white" ? "#ffffff" : col === "black" ? "#000000" : col,
                  }}
                  aria-label={col}
                />
              ))}
            </div>
          </div>

          <div className="flex items-end pb-1">
            <button
              type="button"
              onClick={() => setCaption((c) => ({ ...c, wordHighlight: !c.wordHighlight }))}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs transition",
                caption.wordHighlight
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                  : "border-[var(--border)] text-[var(--text-secondary)]",
              )}
            >
              <span
                className={cn(
                  "h-3.5 w-6 rounded-full p-0.5 transition",
                  caption.wordHighlight ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]",
                )}
              >
                <span
                  className={cn(
                    "block h-2.5 w-2.5 rounded-full bg-white transition",
                    caption.wordHighlight ? "translate-x-2.5" : "translate-x-0",
                  )}
                />
              </span>
              Highlight kata aktif
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HeadlinePanel({
  headlineText,
  headlineFontSize,
  headlineColor,
  setHeadlineText,
  setHeadlineFontSize,
  setHeadlineColor,
}: {
  headlineText: string;
  headlineFontSize: number;
  headlineColor: string;
  setHeadlineText: (v: string) => void;
  setHeadlineFontSize: (v: number) => void;
  setHeadlineColor: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Type className="h-4 w-4" /> Headline (opsional)
      </Label>
      <Input
        placeholder="Teks besar di atas video (hook)…"
        value={headlineText}
        onChange={(e) => setHeadlineText(e.target.value.slice(0, 120))}
        maxLength={120}
      />
      {headlineText.trim() && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">
              Ukuran font — {headlineFontSize}px
            </Label>
            <input
              type="range"
              min={16}
              max={120}
              step={1}
              value={headlineFontSize}
              onChange={(e) => setHeadlineFontSize(Number(e.target.value))}
              className="w-full accent-[var(--accent-gold)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">Warna headline</Label>
            <div className="flex gap-1.5">
              {FONT_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setHeadlineColor(col)}
                  className={cn(
                    "h-7 flex-1 rounded-[var(--radius-md)] border transition",
                    headlineColor === col ? "ring-2 ring-[var(--accent-gold)] ring-offset-1" : "",
                  )}
                  style={{
                    backgroundColor:
                      col === "white" ? "#ffffff" : col === "black" ? "#000000" : col,
                  }}
                  aria-label={col}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
