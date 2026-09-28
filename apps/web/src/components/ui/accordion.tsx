// Accordion — daftar item expand/collapse sederhana berbasis state React
// (styled custom, tanpa dependensi eksternal)
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export type AccordionItem = {
  /** ID unik item */
  value: string;
  /** Judul yang selalu terlihat */
  question: string;
  /** Isi yang muncul saat expand */
  answer: ReactNode;
};

export function Accordion({
  items,
  /** Bila true, hanya satu item terbuka dalam satu waktu */
  singleOpen = true,
  className,
  defaultOpen = null,
}: {
  items: AccordionItem[];
  singleOpen?: boolean;
  className?: string;
  defaultOpen?: string | null;
}) {
  const [open, setOpen] = useState<Set<string>>(defaultOpen ? new Set([defaultOpen]) : new Set());

  function toggle(value: string) {
    setOpen((prev) => {
      const next = new Set(singleOpen ? [] : prev);
      if (prev.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  return (
    <div className={cn("divide-y divide-[var(--border-light)]", className)}>
      {items.map((item) => {
        const expanded = open.has(item.value);
        return (
          <div key={item.value}>
            <button
              type="button"
              onClick={() => toggle(item.value)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-[var(--accent-gold)]"
            >
              <span className="font-medium">{item.question}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>
            {/* Grid trick untuk animasi height halus tanpa library */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="pb-4 text-[var(--text-secondary)] text-sm leading-relaxed">
                  {item.answer}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
