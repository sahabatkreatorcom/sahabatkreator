// Widget Ide Konten — hari besar Indonesia & internasional mendatang
// Data riil dari tabel holiday (seed apply-holiday.ts), bukan mock.
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Lightbulb, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";

type Holiday = {
  id: string;
  name: string;
  description: string | null;
  month: number;
  day: number;
  scope: "national" | "international";
  category: string;
  ideaTemplates: { angle: string; example: string }[] | null;
  suggestedHashtags: string[] | null;
  daysUntil: number;
};

function formatCountdown(days: number): string {
  if (days === 0) return "Hari ini";
  if (days === 1) return "Besok";
  if (days <= 7) return `${days} hari lagi`;
  return `${days} hari lagi`;
}

export function HolidayIdeasWidget() {
  const [selected, setSelected] = useState<Holiday | null>(null);

  const { data } = useQuery({
    queryKey: ["holiday-upcoming", 30],
    queryFn: () => api.get<{ holidays: Holiday[] }>("/holiday/upcoming?days=30"),
    staleTime: 1000 * 60 * 60, // 1 jam — data holiday tidak berubah sering
  });

  const holidays = data?.holidays ?? [];
  if (holidays.length === 0) return null;

  const detail = selected ?? holidays[0]!;

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--accent-pink)]" />
          Ide Konten Hari Besar
        </h2>
      </div>

      {/* Pilih hari besar */}
      <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
        {holidays.slice(0, 6).map((h) => (
          <button
            type="button"
            key={h.id}
            onClick={() => setSelected(h)}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-medium text-xs transition-colors ${
              detail.id === h.id
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]"
            }`}
          >
            {h.daysUntil === 0 ? "🔴 " : ""}
            {h.name.split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
      </div>

      {/* Detail */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
          <CalendarClock className="h-3.5 w-3.5" />
          {detail.day}/{detail.month} · {formatCountdown(detail.daysUntil)} ·{" "}
          {detail.scope === "national" ? "Indonesia" : "Internasional"}
        </div>

        {detail.description && (
          <p className="text-[var(--text-secondary)] text-sm">{detail.description}</p>
        )}

        {detail.ideaTemplates && detail.ideaTemplates.length > 0 && (
          <ul className="space-y-2">
            {detail.ideaTemplates.slice(0, 3).map((idea, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-[var(--bg-tertiary)] p-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-pink)]" />
                <div className="min-w-0">
                  <p className="font-semibold text-xs">{idea.angle}</p>
                  <p className="mt-0.5 text-[var(--text-secondary)] text-xs">{idea.example}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {detail.suggestedHashtags && detail.suggestedHashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {detail.suggestedHashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--accent-gold-light)] px-2 py-0.5 text-[var(--accent-gold)] text-xs"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
