// Pencarian dokumentasi (sisi klien, tanpa layanan eksternal).
// Indeksnya dibangun dari src/lib/docs-nav.ts sehingga halaman baru otomatis
// ikut terindeks begitu ditambahkan ke peta navigasi.
import { CornerDownLeft, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { searchDocs } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => searchDocs(query), [query]);

  // Pintasan ⌘K / Ctrl+K — sama seperti command palette di dalam aplikasi.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Fokus setelah overlay terpasang.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Setiap query baru mengembalikan sorotan ke hasil pertama. `query` memang
  // tidak dibaca di dalam efek — ia sengaja jadi pemicunya, bukan nilai yang dipakai.
  // biome-ignore lint/correctness/useExhaustiveDependencies: query dipakai sebagai pemicu
  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-left text-[var(--text-muted)] text-sm transition-colors hover:border-[var(--accent-gold)]/50 sm:w-64"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Cari dokumentasi…</span>
        <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] sm:block">
          ⌘K
        </kbd>
      </button>

      {/* Overlay dirender lewat portal ke <body>.
          WAJIB: DocsSearch dipasang di dalam <header> yang memakai
          `backdrop-blur-md`. Per CSS, `backdrop-filter` (≠ none) membentuk
          containing block untuk descendant `position: fixed` — jadi tanpa
          portal, `fixed inset-0` mengacu ke header setinggi 64px dan kartu
          pencarian tampak terpotong. */}
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Cari dokumentasi"
            >
              {/* Klik di area gelap menutup pencarian */}
              <button
                type="button"
                aria-label="Tutup pencarian"
                className="absolute inset-0 cursor-default"
                onClick={() => setOpen(false)}
              />
              <div className="relative w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
                <div className="flex items-center gap-2 border-[var(--border)] border-b px-3">
                  <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActive((index) => Math.min(index + 1, results.length - 1));
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActive((index) => Math.max(index - 1, 0));
                      } else if (event.key === "Enter" && results[active]) {
                        go(results[active].href);
                      }
                    }}
                    placeholder="Cari fitur, istilah, atau endpoint…"
                    className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Tutup"
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="max-h-[50vh] overflow-y-auto p-2">
                  {query.trim() === "" ? (
                    <p className="px-3 py-6 text-center text-[var(--text-muted)] text-sm">
                      Ketik untuk mencari di seluruh panduan dan dokumentasi API.
                    </p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[var(--text-muted)] text-sm">
                      Tidak ada hasil untuk “{query}”.
                    </p>
                  ) : (
                    results.map((result, index) => (
                      <button
                        type="button"
                        key={result.href}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(result.href)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left",
                          index === active ? "bg-[var(--bg-tertiary)]" : "",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-[var(--text-primary)] text-sm">
                            {result.title}
                          </p>
                          <p className="truncate text-[var(--text-muted)] text-xs">
                            {result.sectionLabel} · {result.description}
                          </p>
                        </div>
                        {index === active ? (
                          <CornerDownLeft
                            className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
