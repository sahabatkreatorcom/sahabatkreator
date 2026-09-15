// Floating AI chat — tombol sticky kanan bawah, tampil di semua halaman.
// Guest → kartu CTA masuk; user login → panel chat SEB ringkas.
import { useQuery } from "@tanstack/react-query";
import { Bot, MessageCircle, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link, Outlet } from "react-router";
import { SebChatPanel } from "@/components/seb/chat-panel";
import { meQueryOptions } from "@/layouts/require-auth";

/** Shell global — halaman + floating chat (dipasang sebagai pathless root route) */
export function AppShell() {
  return (
    <>
      <Outlet />
      <FloatingChat />
    </>
  );
}

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery(meQueryOptions);

  // Jangan tampilkan apapun sebelum status auth diketahui (hindari kedipan)
  if (isLoading) return null;

  return (
    <>
      {/* Panel chat / CTA */}
      {open && (
        <div className="fixed right-4 bottom-20 z-40 flex max-h-[70vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl sm:w-96 lg:bottom-24">
          {/* Header */}
          <div className="flex items-center gap-2 border-[var(--border-light)] border-b bg-[var(--bg-secondary)] px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">SEB — AI Coach</p>
              <p className="text-[var(--text-muted)] text-xs">
                Tanya apa saja soal konten & performa sosmed
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Tutup chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Isi: chat bila login, CTA bila guest */}
          {data?.authenticated ? (
            <SebChatPanel className="h-auto min-h-0 flex-1 rounded-none border-0 shadow-none" />
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold">Kenalin, aku SEB</p>
                <p className="mt-1 text-[var(--text-secondary)] text-sm">
                  AI coach yang bantu bikin caption, ide konten, dan strategi sosmed kamu. Masuk
                  dulu untuk mulai ngobrol.
                </p>
              </div>
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-1 rounded-[var(--radius-md)] bg-[var(--accent-gold)] px-4 py-2 font-medium text-sm text-white transition-opacity hover:opacity-90"
              >
                Masuk & Chat SEB
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tombol floating (FAB) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Tutup chat SEB" : "Buka chat SEB"}
        className="fixed right-4 bottom-20 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient text-white shadow-lg transition-transform hover:scale-105 lg:bottom-4"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </>
  );
}
