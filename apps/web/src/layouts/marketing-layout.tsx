import { env } from "@sahabatkreator/env/web";
import { useHead } from "@unhead/react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/ui/logo";
import { useTheme } from "@/lib/theme";

const NAV = [
  { label: "Fitur", to: "/#fitur" },
  { label: "Harga", to: "/harga" },
  { label: "Perbandingan", to: "/compare" },
  { label: "Blog", to: "/blog" },
  { label: "Tentang", to: "/tentang" },
  { label: "Kontak", to: "/kontak" },
  { label: "FAQ", to: "/faq" },
  { label: "Changelog", to: "/changelog" },
];

/** JSON-LD sitewide: Organization + WebSite (sitelinks searchbox) */
function useSitewideJsonLd() {
  useHead({
    script: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify([
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Sahabat Kreator",
            url: env.VITE_WEB_URL,
            logo: `${env.VITE_WEB_URL}/pwa-512.png`,
            description:
              "Platform manajemen social media all-in-one untuk kreator dan bisnis Indonesia — jadwal posting, analitik, dan kolaborasi tim.",
            sameAs: [
              "https://www.facebook.com/sahabatkreatorcom",
              "https://www.instagram.com/sahabatkreatorcom",
              "https://www.youtube.com/@sahabatkreatorcom",
              "https://www.tiktok.com/@sahabatkreatorcom",
              "https://www.threads.com/@sahabatkreatorcom",
              "https://www.linkedin.com/company/sahabat-kreator",
              "https://www.pinterest.com/sahabatkreator",
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Sahabat Kreator",
            url: env.VITE_WEB_URL,
            inLanguage: "id-ID",
          },
        ]),
      },
    ],
  });
}

export function MarketingLayout() {
  const { toggle, resolved } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useSitewideJsonLd();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-40 border-[var(--border-light)] border-b bg-[var(--bg-primary)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="Beranda Sahabat Kreator">
            <LogoFull />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="font-medium text-[var(--text-secondary)] text-sm transition-colors hover:text-[var(--text-primary)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Ganti tema">
              {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Link to="/login" className="hidden md:block">
              <Button variant="ghost">Masuk</Button>
            </Link>
            <Link to="/register" className="hidden md:block">
              <Button>Daftar Gratis</Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-[var(--border-light)] border-t bg-[var(--bg-secondary)] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-[var(--radius-md)] px-3 py-2 font-medium text-sm hover:bg-[var(--bg-tertiary)]"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 flex gap-2">
                <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full">
                    Masuk
                  </Button>
                </Link>
                <Link to="/register" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button className="w-full">Daftar</Button>
                </Link>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main key={location.pathname}>
        <Outlet />
      </main>

      <footer className="border-[var(--border-light)] border-t bg-[var(--bg-secondary)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
          <div className="space-y-3">
            <LogoFull />
            <p className="text-[var(--text-secondary)] text-sm">
              Sahabat terbaik kreator Indonesia untuk mengelola konten social media.
            </p>
          </div>
          <div>
            <h4 className="mb-3 font-semibold text-sm">Produk</h4>
            <ul className="space-y-2 text-[var(--text-secondary)] text-sm">
              <li>
                <Link to="/#fitur" className="hover:text-[var(--text-primary)]">
                  Fitur
                </Link>
              </li>
              <li>
                <Link to="/harga" className="hover:text-[var(--text-primary)]">
                  Harga
                </Link>
              </li>
              <li>
                <Link to="/compare" className="hover:text-[var(--text-primary)]">
                  Perbandingan
                </Link>
              </li>
              <li>
                <Link to="/blog" className="hover:text-[var(--text-primary)]">
                  Blog
                </Link>
              </li>
              <li>
                <Link to="/faq" className="hover:text-[var(--text-primary)]">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/changelog" className="hover:text-[var(--text-primary)]">
                  Changelog
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 font-semibold text-sm">Perusahaan</h4>
            <ul className="space-y-2 text-[var(--text-secondary)] text-sm">
              <li>
                <Link to="/tentang" className="hover:text-[var(--text-primary)]">
                  Tentang Kami
                </Link>
              </li>
              <li>
                <Link to="/kontak" className="hover:text-[var(--text-primary)]">
                  Kontak
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 font-semibold text-sm">Legal</h4>
            <ul className="space-y-2 text-[var(--text-secondary)] text-sm">
              <li>
                <Link to="/kebijakan-privasi" className="hover:text-[var(--text-primary)]">
                  Kebijakan Privasi
                </Link>
              </li>
              <li>
                <Link to="/syarat-ketentuan" className="hover:text-[var(--text-primary)]">
                  Syarat &amp; Ketentuan
                </Link>
              </li>
              <li>
                <Link to="/kebijakan-cookie" className="hover:text-[var(--text-primary)]">
                  Kebijakan Cookie
                </Link>
              </li>
              <li>
                <Link to="/penghapusan-data" className="hover:text-[var(--text-primary)]">
                  Penghapusan Data
                </Link>
              </li>
              <li>
                <Link to="/kebijakan-refund" className="hover:text-[var(--text-primary)]">
                  Kebijakan Refund
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-[var(--border-light)] border-t py-4 text-center text-[var(--text-muted)] text-xs">
          © {new Date().getFullYear()} Sahabat Kreator. Hak cipta dilindungi.
        </div>
      </footer>
    </div>
  );
}
