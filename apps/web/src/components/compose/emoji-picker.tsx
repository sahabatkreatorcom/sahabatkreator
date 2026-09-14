// Emoji picker ringan untuk caption Compose — tanpa dependensi eksternal.
// Popup berisi emoji yang sering dipakai konten kreator, dikelompokkan per tab.

import { Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Set emoji kurasi per kategori — cukup untuk kebutuhan caption sosmed */
const EMOJI_GROUPS = [
  {
    key: "populer",
    label: "Populer",
    emojis: [
      "🔥",
      "✨",
      "❤️",
      "😂",
      "😍",
      "🥰",
      "😎",
      "🤩",
      "👀",
      "💯",
      "👍",
      "🙌",
      "🎉",
      "🎯",
      "💡",
      "⭐",
    ],
  },
  {
    key: "reaksi",
    label: "Reaksi",
    emojis: [
      "😂",
      "🥹",
      "😮",
      "😱",
      "🤔",
      "😢",
      "😭",
      "🤯",
      "😤",
      "🫶",
      "👏",
      "🙏",
      "🤝",
      "💪",
      "🫡",
      "😴",
    ],
  },
  {
    key: "konten",
    label: "Konten",
    emojis: [
      "📸",
      "🎬",
      "🎤",
      "🎧",
      "📝",
      "📊",
      "📈",
      "💡",
      "🗓️",
      "📌",
      "🏷️",
      "🔗",
      "💬",
      "📢",
      "🛍️",
      "💰",
    ],
  },
  {
    key: "status",
    label: "Status",
    emojis: [
      "✅",
      "❌",
      "⚠️",
      "🆕",
      "🔝",
      "⏰",
      "⚡",
      "🚀",
      "🏆",
      "🎁",
      "☕",
      "🌴",
      "☀️",
      "🌙",
      "🍕",
      "🌈",
    ],
  },
] as const;

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<(typeof EMOJI_GROUPS)[number]["key"]>("populer");
  const ref = useRef<HTMLDivElement>(null);

  // Tutup popup saat klik di luar
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const activeGroup = EMOJI_GROUPS.find((g) => g.key === group) ?? EMOJI_GROUPS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        title="Sisipkan emoji"
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
          open
            ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
        )}
      >
        <Smile className="h-3.5 w-3.5" />
        Emoji
      </button>

      {open && (
        <div className="card absolute bottom-full left-0 z-20 mb-2 w-64 p-3 shadow-lg">
          {/* Tab kategori */}
          <div className="mb-2 flex gap-1">
            {EMOJI_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroup(g.key)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  g.key === group
                    ? "bg-[var(--accent-gold-light)] font-medium"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          {/* Grid emoji */}
          <div className="grid grid-cols-8 gap-0.5">
            {activeGroup.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onPick(emoji)}
                className="rounded-md p-1 text-lg leading-none transition-transform hover:scale-125 hover:bg-[var(--bg-tertiary)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
