// Renderer halaman dokumentasi.
//
// Satu komponen melayani seluruh halaman di /panduan/* dan /developers/*:
// slug diambil dari URL, kontennya diambil dari src/content/<section>/<slug>.mdx
// lewat import.meta.glob (jadi setiap halaman jadi chunk sendiri dan hanya
// diunduh saat dibuka).
import { MDXProvider } from "@mdx-js/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ComponentType, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { mdxComponents } from "@/components/docs/mdx-components";
import { type DocsSection, docsHref, docsNeighbours, docsSectionForPath } from "@/lib/docs-nav";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";

// Semua file .mdx di src/content, dikunci per path relatif.
const MDX_MODULES = import.meta.glob<{ default: ComponentType }>("../../content/**/*.mdx");

/**
 * Komponen `lazy` dibuat SEKALI di module scope, bukan di dalam render.
 *
 * ⚠️ Kalau `lazy()` dipanggil saat render, setiap render ulang menghasilkan tipe
 * komponen BARU. React melihat tipe yang berbeda, membuang hasil render
 * sebelumnya, lalu mengimpor dari nol lagi — pohon komponen tersuspensi
 * terus-menerus dan halaman tampil KOSONG tanpa satu pun error. Pemetaan ini
 * dibangun sekali di sini supaya tipenya stabil.
 */
const LAZY_PAGES = new Map<string, ComponentType>(
  Object.entries(MDX_MODULES).map(([key, loader]) => [key, lazy(loader)]),
);

function moduleKey(sectionId: string, slug: string): string {
  return `../../content/${sectionId}/${slug || "index"}.mdx`;
}

// ---------- Daftar isi (dibangun dari heading yang benar-benar ter-render) ----------

type TocItem = { id: string; text: string; level: number };

function useDocHeadings(containerRef: React.RefObject<HTMLElement | null>, contentKey: string) {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState("");

  // Konten MDX dimuat asinkron, jadi heading baru ada setelah render pertama.
  // MutationObserver membuat daftar isi ikut terisi begitu konten muncul.
  // biome-ignore lint/correctness/useExhaustiveDependencies: contentKey memicu ulang saat pindah halaman
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function collect() {
      const nodes = container?.querySelectorAll<HTMLElement>("[data-doc-heading]");
      if (!nodes) return;
      setHeadings(
        Array.from(nodes).map((node) => ({
          id: node.id,
          text: node.textContent ?? "",
          level: Number(node.dataset.docHeading ?? 2),
        })),
      );
    }

    collect();
    const observer = new MutationObserver(collect);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [contentKey]);

  // Sorot heading yang sedang terlihat.
  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [headings]);

  return { headings, activeId };
}

// ---------- Halaman ----------

// Rangka konten saat chunk .mdx masih diunduh. Sengaja menyerupai tata letak
// judul + paragraf supaya tidak ada lompatan tata letak yang terasa.
function DocsContentSkeleton() {
  return (
    <div aria-hidden className="max-w-3xl animate-pulse space-y-4">
      <div className="h-8 w-2/3 rounded bg-[var(--bg-tertiary)]" />
      <div className="h-4 w-full rounded bg-[var(--bg-tertiary)]" />
      <div className="h-4 w-11/12 rounded bg-[var(--bg-tertiary)]" />
      <div className="h-4 w-4/5 rounded bg-[var(--bg-tertiary)]" />
      <div className="mt-8 h-6 w-1/3 rounded bg-[var(--bg-tertiary)]" />
      <div className="h-4 w-full rounded bg-[var(--bg-tertiary)]" />
      <div className="h-4 w-10/12 rounded bg-[var(--bg-tertiary)]" />
    </div>
  );
}

export function DocsPage() {
  const { pathname } = useLocation();
  const params = useParams();
  const articleRef = useRef<HTMLElement>(null);

  const section: DocsSection | null = docsSectionForPath(pathname);
  // Route memakai pola /panduan/* sehingga slug datang dari splat param.
  const slug = (params["*"] ?? "").replace(/\/+$/, "");
  const page = section?.pages.find((item) => item.slug === slug) ?? null;

  const href = section ? docsHref(section, slug) : pathname;
  const { prev, next } =
    section && page ? docsNeighbours(section, slug) : { prev: null, next: null };

  useSeo({
    title: page ? `${page.title} — ${section?.label}` : "Dokumentasi",
    description: page?.description ?? "Dokumentasi Sahabat Kreator.",
    path: href,
    noIndex: !page,
  });

  // Komponen sudah dibuat di module scope — di sini hanya mengambil referensi
  // yang stabil, supaya React tidak menganggapnya tipe baru tiap render.
  const Content = useMemo(() => {
    if (!section || !page) return null;
    return LAZY_PAGES.get(moduleKey(section.id, page.slug)) ?? null;
  }, [section, page]);

  const { headings, activeId } = useDocHeadings(articleRef, `${section?.id}/${slug}`);

  // Pindah halaman → kembali ke atas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu oleh perubahan URL
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  if (!section || !page || !Content) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold text-[var(--text-primary)] text-lg">
          Halaman dokumentasi tidak ditemukan
        </p>
        <p className="mt-2 text-[var(--text-secondary)] text-sm">
          Alamat yang Anda buka tidak ada. Mulai lagi dari{" "}
          <Link to="/panduan" className="text-[var(--accent-gold)] underline">
            Panduan Pengguna
          </Link>{" "}
          atau{" "}
          <Link to="/developers" className="text-[var(--accent-gold)] underline">
            Dokumentasi API
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-10">
      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb" className="mb-4 text-[var(--text-muted)] text-xs">
          <Link to={section.base} className="hover:text-[var(--text-primary)]">
            {section.label}
          </Link>
          {page.slug ? <span> / {page.title}</span> : null}
        </nav>

        <article ref={articleRef} className="max-w-3xl">
          {/* Suspense WAJIB: konten .mdx diimpor sebagai chunk terpisah, jadi
              render pertama pasti menunggu. Tanpa boundary di sini, penantian
              itu merambat ke root dan seluruh halaman — termasuk sidebar dan
              header — ikut kosong sampai chunk selesai diunduh. */}
          <Suspense fallback={<DocsContentSkeleton />}>
            <MDXProvider components={mdxComponents}>
              <Content />
            </MDXProvider>
          </Suspense>
        </article>

        {(prev || next) && (
          <div className="mt-12 grid max-w-3xl gap-3 border-[var(--border-light)] border-t pt-6 sm:grid-cols-2">
            {prev ? (
              <Link
                to={prev.href}
                className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] p-3 transition-colors hover:border-[var(--accent-gold)]/50"
              >
                <span className="flex items-center gap-1 text-[var(--text-muted)] text-xs">
                  <ChevronLeft className="h-3 w-3" /> Sebelumnya
                </span>
                <span className="mt-1 font-medium text-[var(--text-primary)] text-sm group-hover:text-[var(--accent-gold)]">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to={next.href}
                className="group flex flex-col items-end rounded-[var(--radius-lg)] border border-[var(--border)] p-3 text-right transition-colors hover:border-[var(--accent-gold)]/50 sm:col-start-2"
              >
                <span className="flex items-center gap-1 text-[var(--text-muted)] text-xs">
                  Berikutnya <ChevronRight className="h-3 w-3" />
                </span>
                <span className="mt-1 font-medium text-[var(--text-primary)] text-sm group-hover:text-[var(--accent-gold)]">
                  {next.title}
                </span>
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {headings.length > 2 ? (
        <aside className="hidden w-52 shrink-0 xl:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
            <p className="mb-2 font-semibold text-[var(--text-muted)] text-xs uppercase tracking-wide">
              Di halaman ini
            </p>
            <ul className="space-y-1 border-[var(--border-light)] border-l">
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a
                    href={`#${heading.id}`}
                    className={cn(
                      "-ml-px block border-l py-0.5 text-xs leading-snug transition-colors",
                      heading.level >= 3 ? "pl-5" : "pl-3",
                      activeId === heading.id
                        ? "border-[var(--accent-gold)] font-medium text-[var(--text-primary)]"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {heading.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
