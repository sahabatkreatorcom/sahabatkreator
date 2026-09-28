// Panel publikasi & submit di Compose — mode (sekarang/jadwalkan/draft),
// input jadwal, dan sticky submit bar dengan skor prediksi.
import { CalendarClock, Hash, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ScheduleMode = "now" | "schedule" | "draft";

const MODES = [
  { value: "now", label: "Sekarang", icon: Send },
  { value: "schedule", label: "Jadwalkan", icon: CalendarClock },
  { value: "draft", label: "Draft", icon: Save },
] as const;

/** Segmented control mode publikasi + input tanggal & waktu */
export function PublishModeSelector({
  mode,
  scheduledAt,
  onModeChange,
  onScheduledAtChange,
}: {
  mode: ScheduleMode;
  scheduledAt: string;
  onModeChange: (mode: ScheduleMode) => void;
  onScheduledAtChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((opt) => {
          const active = mode === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onModeChange(opt.value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-3 text-xs",
                active
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                  : "border-[var(--border)] hover:border-[var(--accent-gold)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {mode === "schedule" && (
        <div className="space-y-2">
          <Label htmlFor="scheduledAt">Tanggal & Waktu</Label>
          <Input
            id="scheduledAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            required
          />
          <p className="text-[var(--text-muted)] text-xs">Zona waktu: Asia/Jakarta (WIB)</p>
        </div>
      )}
    </div>
  );
}

/** Submit bar sticky — mode aktif + tombol aksi utama */
export function SubmitBar({
  mode,
  pending,
  disabled,
  title,
  score,
}: {
  mode: ScheduleMode;
  pending: boolean;
  disabled: boolean;
  /** Tooltip saat disabled (error validasi) */
  title: string | undefined;
  /** Skor prediksi engagement */
  score: React.ReactNode;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">{score}</div>
      <Button
        type="submit"
        size="lg"
        disabled={pending || disabled}
        title={title}
        className="shrink-0"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : mode === "now" ? (
          <Send className="h-4 w-4" />
        ) : mode === "schedule" ? (
          <CalendarClock className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {mode === "now" ? "Posting Sekarang" : mode === "schedule" ? "Jadwalkan" : "Simpan Draft"}
      </Button>
    </div>
  );
}

/** Placeholder kolom preview saat belum ada konten/akun */
export function PreviewEmptyState({ hasAccounts }: { hasAccounts: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-[var(--text-muted)]">
      <Hash className="h-8 w-8 opacity-40" />
      <p className="text-sm">{hasAccounts ? "Preview muncul di sini" : "Pilih akun dulu"}</p>
      <p className="max-w-[220px] text-xs">
        {hasAccounts
          ? "Pilih akun dan tulis konten atau lampirkan media untuk melihat preview per platform."
          : "Hubungkan minimal satu akun sosmed untuk mulai membuat konten."}
      </p>
    </div>
  );
}
