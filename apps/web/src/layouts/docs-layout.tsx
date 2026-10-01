// Kerangka halaman dokumentasi publik (/panduan dan /developers).
//
// Sengaja berdiri sendiri, terpisah dari MarketingLayout: dokumentasi butuh
// sidebar navigasi yang lengket, sedangkan header marketing punya menu yang
// berbeda. Yang dipertahankan sama: logo, tombol tema, dan tautan masuk/daftar
// supaya pengunjung tidak merasa keluar dari situs.
import { Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { DocsSearch } from "@/components/docs/docs-search";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/ui/logo";
import { DOCS_SECTIONS, docsHref, docsSectionForPath } from "@/lib/docs-nav";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function DocsNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const activeSection = docsSectionForPath(location.pathname);

  return (
    <nav className="space-y-6">
      {DOCS_SECTIONS.map((section) => {
        const isActive = activeSection?.id === section.id;
        return (
          <div key={section.id}>
            <p
              className={cn(
                "mb-2 px-3 font-semibold text-xs uppercase tracking-wide",
                isActive ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)]",
              )}
            >
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.pages.map((page) => {
                const href = docsHref(section, page.slug);
                const current = location.pathname === href;
                return (
                  <li key={href}>
                    <Link
                      to={href}
                      onClick={onNavigate}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "block rounded-[var(--radius-md)] px-3 py-1.5 text-sm transition-colors",
                        current
                          ? "bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      {page.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function DocsLayout() {
  const { toggle, resolved } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Tutup sidebar mobile setiap kali pindah halaman.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu oleh pathname
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-40 border-[var(--border-light)] border-b bg-[var(--bg-primary)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link to="/" aria-label="Beranda Sahabat Kreator" className="shrink-0">
            <LogoFull />
          </Link>

          <span className="hidden shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] text-xs lg:inline">
            Dokumentasi
          </span>

          <div className="flex flex-1 justify-end lg:justify-center">
            <div className="hidden w-full max-w-xs lg:block">
              <DocsSearch />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* /v1/docs dilayani server (Scalar), bukan route SPA — pakai <a>,
                kalau lewat react-router akan jatuh ke halaman 404. */}
            <a href="/v1/docs" className="hidden xl:block">
              <Button variant="ghost" size="sm">
                Referensi API
              </Button>
            </a>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Ganti tema">
              {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Link to="/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Masuk
              </Button>
            </Link>
            <Link to="/register" className="hidden sm:block">
              <Button size="sm">Daftar Gratis</Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen((value) => !value)}
              aria-label="Menu dokumentasi"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-[var(--border-light)] border-t bg-[var(--bg-secondary)] px-4 py-4 lg:hidden">
            <div className="mb-4">
              <DocsSearch />
            </div>
            <DocsNavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8">
            <DocsNavLinks />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <footer className="border-[var(--border-light)] border-t bg-[var(--bg-secondary)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-[var(--text-secondary)] text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Sahabat Kreator. Hak cipta dilindungi.</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link to="/panduan" className="hover:text-[var(--text-primary)]">
              Panduan
            </Link>
            <Link to="/developers" className="hover:text-[var(--text-primary)]">
              API
            </Link>
            <a href="/v1/docs" className="hover:text-[var(--text-primary)]">
              Referensi API
            </a>
            <Link to="/faq" className="hover:text-[var(--text-primary)]">
              FAQ
            </Link>
            <Link to="/kontak" className="hover:text-[var(--text-primary)]">
              Kontak
            </Link>
            <Link to="/kebijakan-privasi" className="hover:text-[var(--text-primary)]">
              Privasi
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
