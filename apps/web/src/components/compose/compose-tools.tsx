// Toolbar alat Compose — tombol kompak (AI, strategi, UTM, sound, produk, CSV,
// waktu optimal) yang membuka panel terkait sebagai section accordion di bawah
// toolbar. Hanya satu alat yang terbuka pada satu waktu (perilaku Buffer).
import { CalendarClock, Lightbulb, Link2, Music, Package, Sparkles, Table } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

/** Kunci alat — null = semua tertutup */
export type ComposeTool = "ai" | "strategy" | "utm" | "sound" | "product" | "csv" | "times";

const TOOLS: { key: ComposeTool; label: string; icon: typeof Sparkles }[] = [
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "strategy", label: "Strategi", icon: Lightbulb },
  { key: "utm", label: "UTM", icon: Link2 },
  { key: "sound", label: "Sound", icon: Music },
  { key: "product", label: "Produk", icon: Package },
  { key: "times", label: "Waktu Optimal", icon: CalendarClock },
  { key: "csv", label: "Import CSV", icon: Table },
];

export function ComposeTools({
  children,
}: {
  /** Slot render panel alat aktif — dipanggil hanya saat tool terbuka */
  children: (openTool: ComposeTool) => ReactNode;
}) {
  const [openTool, setOpenTool] = useState<ComposeTool | null>(null);

  return (
    <div className="space-y-3">
      {/* Toolbar tombol alat */}
      <div className="flex flex-wrap gap-1.5">
        {TOOLS.map((tool) => {
          const active = openTool === tool.key;
          const Icon = tool.icon;
          return (
            <button
              key={tool.key}
              type="button"
              onClick={() => setOpenTool(active ? null : tool.key)}
              aria-pressed={active}
              title={tool.label}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                active
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tool.label}
            </button>
          );
        })}
      </div>

      {/* Panel alat aktif (accordion) */}
      {openTool && (
        <div className="animate-fade-in" key={openTool}>
          {children(openTool)}
        </div>
      )}
    </div>
  );
}
