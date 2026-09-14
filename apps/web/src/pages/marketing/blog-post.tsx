// Halaman detail artikel blog — SEO lengkap (OG article, JSON-LD, canonical)

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Clock, Eye, Tag } from "lucide-react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { toAbsoluteUrl, useSeo } from "@/lib/seo";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  contentHtml: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  ogImageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readingTimeMinutes: number | null;
  viewCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  authorName: string | null;
  authorImage: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  tags: string[];
};

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: () => api.get<{ post: BlogPost }>(`/blog/posts/${slug}`),
    enabled: !!slug,
    retry: false,
  });

  const post = data?.post;
  // OG image khusus (custom) > cover image. Keduanya sudah absolut dari DB/R2.
  const socialImage = post?.ogImageUrl ?? post?.coverImageUrl ?? undefined;

  useSeo({
    title: post?.metaTitle ?? post?.title ?? "Artikel",
    description: post?.metaDescription ?? post?.excerpt ?? undefined,
    path: `/blog/${slug}`,
    ogImage: socialImage,
    ogImageAlt: post?.coverImageAlt ?? post?.title ?? undefined,
    // Cover/OG image umumnya 16:9 (1200x630) — sesuai rasio aspek-video di UI
    ...(socialImage ? { ogImageWidth: 1200, ogImageHeight: 630 } : {}),
    ogType: "article",
    // Canonical: hormati custom canonical URL dari editor jika ada (bisa eksternal)
    ...(post?.canonicalUrl ? { path: post.canonicalUrl } : {}),
    jsonLd: post
      ? {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.metaDescription ?? post.excerpt ?? undefined,
          image: socialImage ? toAbsoluteUrl(socialImage) : undefined,
          datePublished: post.publishedAt ?? undefined,
          dateModified: post.updatedAt ?? undefined,
          author: post.authorName ? { "@type": "Person", name: post.authorName } : undefined,
          publisher: {
            "@type": "Organization",
            name: "Sahabat Kreator",
          },
          mainEntityOfPage: post.canonicalUrl ?? `/blog/${post.slug}`,
          inLanguage: "id-ID",
        }
      : undefined,
  });

  if (isLoading) return <PageLoader />;

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <EmptyState
          title="Artikel tidak ditemukan"
          description="Artikel mungkin sudah dihapus atau URL-nya salah."
          action={
            <Link to="/blog">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Blog
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      {/* Breadcrumb */}
      <nav className="mb-6 text-[var(--text-muted)] text-sm">
        <Link to="/" className="hover:text-[var(--accent-gold)]">
          Beranda
        </Link>
        <span className="mx-2">/</span>
        <Link to="/blog" className="hover:text-[var(--accent-gold)]">
          Blog
        </Link>
        {post.categoryName && (
          <>
            <span className="mx-2">/</span>
            <span>{post.categoryName}</span>
          </>
        )}
      </nav>

      <header className="mb-8">
        <h1 className="font-bold text-3xl leading-tight md:text-4xl">{post.title}</h1>
        {post.excerpt && (
          <p className="mt-4 text-[var(--text-secondary)] text-lg">{post.excerpt}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-[var(--text-muted)] text-sm">
          {post.authorName && (
            <span className="font-medium text-[var(--text-secondary)]">{post.authorName}</span>
          )}
          {post.publishedAt && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {formatDate(post.publishedAt)}
            </span>
          )}
          {post.readingTimeMinutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {post.readingTimeMinutes} menit baca
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {formatNumber(post.viewCount)} dibaca
          </span>
        </div>
      </header>

      {post.coverImageUrl && (
        <img
          src={post.coverImageUrl}
          alt={post.coverImageAlt ?? post.title}
          className="mb-8 aspect-video w-full rounded-[var(--radius-lg)] object-cover"
        />
      )}

      {/* Konten artikel — dirender dari HTML editor admin */}
      <div className="article-content" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

      {post.tags.length > 0 && (
        <div className="mt-10 flex flex-wrap items-center gap-2 border-[var(--border-light)] border-t pt-6">
          <Tag className="h-4 w-4 text-[var(--text-muted)]" />
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="card mt-12 bg-gradient p-8 text-center text-white">
        <h2 className="font-bold text-2xl">Siap naik level konten Anda?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/80">
          Kelola semua social media Anda dari satu tempat dengan Sahabat Kreator.
        </p>
        <Link to="/register" className="mt-5 inline-block">
          <Button variant="secondary" size="lg">
            Coba Gratis Sekarang
          </Button>
        </Link>
      </div>
    </article>
  );
}
