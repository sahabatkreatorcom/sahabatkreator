// ============================================================
// Pemetaan komponen untuk seluruh file .mdx di src/content/.
//
// Dipasang lewat <MDXProvider> di DocsPage (lihat vite.config.ts →
// `providerImportSource: "@mdx-js/react"`). Karena itu penulis dokumentasi
// cukup menulis markdown biasa, dan komponen tambahan di bawah (<Callout>,
// <Screenshot>, <Steps>, …) bisa dipakai tanpa import apa pun di file .mdx.
// ============================================================

import { AlertTriangle, Info, Lightbulb, type LucideIcon } from "lucide-react";
import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

// ---------- Utilitas heading ----------

/**
 * Ubah judul heading menjadi anchor id yang stabil, mis.
 * "Rate limit & batas" → "rate-limit-batas". Dipakai daftar isi di DocsPage,
 * jadi heading otomatis bisa ditautkan tanpa penulis menulis id manual.
 */
function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "bagian"
  );
}

/** Ambil teks polos dari children React (heading bisa memuat <code> / <strong>). */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function heading(level: 1 | 2 | 3 | 4) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  const sizes: Record<number, string> = {
    1: "mt-0 mb-4 font-bold text-3xl tracking-tight",
    2: "mt-10 mb-3 scroll-mt-24 border-[var(--border-light)] border-b pb-2 font-bold text-2xl tracking-tight",
    3: "mt-8 mb-2 scroll-mt-24 font-semibold text-lg",
    4: "mt-6 mb-2 scroll-mt-24 font-semibold text-base",
  };
  return function Heading({ children }: { children?: ReactNode }) {
    // H1 pertama halaman tidak perlu masuk daftar isi.
    const id = level === 1 ? undefined : slugifyHeading(textOf(children));
    return (
      <Tag
        id={id}
        data-doc-heading={level === 1 ? undefined : level}
        className={cn("text-[var(--text-primary)]", sizes[level])}
      >
        {children}
      </Tag>
    );
  };
}

function Anchor({ href = "", children }: { href?: string; children?: ReactNode }) {
  const className =
    "font-medium text-[var(--accent-gold)] underline decoration-[var(--accent-gold)]/40 underline-offset-2 transition-colors hover:decoration-[var(--accent-gold)]";
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

// ---------- Komponen kustom untuk .mdx ----------

const CALLOUT_STYLES = {
  info: {
    icon: Info,
    wrapper: "border-[var(--border)] bg-[var(--bg-secondary)]",
    iconClass: "text-[var(--text-secondary)]",
  },
  tip: {
    icon: Lightbulb,
    wrapper: "border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/8",
    iconClass: "text-[var(--accent-gold)]",
  },
  warning: {
    icon: AlertTriangle,
    wrapper: "border-amber-500/40 bg-amber-500/8",
    iconClass: "text-amber-500",
  },
} satisfies Record<string, { icon: LucideIcon; wrapper: string; iconClass: string }>;

export type CalloutVariant = keyof typeof CALLOUT_STYLES;

/**
 * Kotak sorotan.
 * Dipakai di .mdx: `<Callout variant="tip" title="Judul">isi</Callout>`
 */
export function Callout({
  variant = "info",
  title,
  children,
}: {
  variant?: CalloutVariant;
  title?: string;
  children?: ReactNode;
}) {
  const style = CALLOUT_STYLES[variant] ?? CALLOUT_STYLES.info;
  const Icon = style.icon;
  return (
    <div
      className={cn(
        "my-6 flex gap-3 rounded-[var(--radius-lg)] border p-4 text-sm leading-relaxed",
        style.wrapper,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="mb-1 font-semibold text-[var(--text-primary)]">{title}</p> : null}
        <div className="space-y-2 text-[var(--text-secondary)] [&>p]:m-0">{children}</div>
      </div>
    </div>
  );
}

/**
 * Tangkapan layar antarmuka. Semua berkas ada di public/docs/ dan dihasilkan
 * oleh `bun run docs:screenshots` (Playwright, zoom 130%).
 *
 * Dipakai di .mdx: `<Screenshot src="/docs/panduan/kalender.png" alt="…" caption="…" />`
 */
export function Screenshot({
  src,
  alt,
  caption,
  /** true = tanpa bingkai, untuk potongan kecil */
  bare = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  bare?: boolean;
}) {
  return (
    <figure className="my-6">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          "w-full rounded-[var(--radius-lg)]",
          bare ? "" : "border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm",
        )}
      />
      {caption ? (
        <figcaption className="mt-2 text-center text-[var(--text-muted)] text-xs">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Grid kartu untuk halaman indeks. */
export function CardGrid({ children }: { children?: ReactNode }) {
  return <div className="my-6 grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** Satu kartu di dalam CardGrid — biasanya berisi tautan. */
export function CardLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Link
      to={href}
      className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4 transition-colors hover:border-[var(--accent-gold)]/50"
    >
      <p className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)]">
        {title}
      </p>
      <p className="mt-1 text-[var(--text-secondary)] text-sm leading-relaxed">{children}</p>
    </Link>
  );
}

/** Langkah bernomor: `<Steps><Step title="…">…</Step></Steps>` */
export function Steps({ children }: { children?: ReactNode }) {
  return <ol className="my-6 space-y-4 border-[var(--border)] border-l pl-0">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <li className="relative list-none pl-6">
      <span className="absolute top-1 -left-[9px] h-4 w-4 rounded-full border-2 border-[var(--accent-gold)] bg-[var(--bg-primary)]" />
      <p className="font-semibold text-[var(--text-primary)]">{title}</p>
      <div className="mt-1 space-y-2 text-[var(--text-secondary)] text-sm leading-relaxed [&>p]:m-0">
        {children}
      </div>
    </li>
  );
}

// ---------- Peta lengkap ----------

export const mdxComponents: MDXComponents = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  a: Anchor,

  p: ({ children }) => (
    <p className="my-4 text-[var(--text-secondary)] leading-relaxed">{children}</p>
  ),

  ul: ({ children }) => (
    <ul className="my-4 ml-5 list-disc space-y-1.5 text-[var(--text-secondary)] leading-relaxed">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="my-4 ml-5 list-decimal space-y-1.5 text-[var(--text-secondary)] leading-relaxed">
      {children}
    </ol>
  ),

  li: ({ children }) => <li className="pl-1">{children}</li>,

  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-6 border-[var(--accent-gold)] border-l-2 pl-4 text-[var(--text-secondary)] italic">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-8 border-[var(--border-light)]" />,

  // Kode inline; blok kode ditangani `pre` di bawah.
  code: ({ children, className }) => {
    if (typeof className === "string" && className.includes("language-")) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--text-primary)]">
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-tertiary)] p-4 font-mono text-[13px] leading-relaxed">
      {children}
    </pre>
  ),

  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),

  thead: ({ children }) => <thead className="bg-[var(--bg-tertiary)] text-left">{children}</thead>,

  th: ({ children }) => (
    <th className="border-[var(--border)] border-b px-3 py-2 font-semibold text-[var(--text-primary)]">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="border-[var(--border)] border-b px-3 py-2 align-top text-[var(--text-secondary)]">
      {children}
    </td>
  ),

  img: ({ src, alt }) => (
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className="my-6 w-full rounded-[var(--radius-lg)] border border-[var(--border)]"
    />
  ),

  // Komponen kustom — dipakai di .mdx tanpa import
  Callout,
  Screenshot,
  CardGrid,
  CardLink,
  Steps,
  Step,
};
