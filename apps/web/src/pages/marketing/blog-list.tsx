// Halaman Blog — daftar artikel published (SEO friendly)
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Clock, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useSeo } from "@/lib/seo";

type BlogPostItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  readingTimeMinutes: number | null;
  authorName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

export function BlogListPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  useSeo({
    title: "Blog — Tips & Insight Social Media",
    description:
      "Artikel terbaru seputar strategi social media, content creation, dan pertumbuhan audiens untuk kreator Indonesia.",
    path: "/blog",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["blog-posts", query],
    queryFn: () =>
      api.get<{ posts: BlogPostItem[] }>(
        `/blog/posts${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      ),
  });

  const posts = data?.posts ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
      <div className="mb-10 text-center">
        <h1 className="font-bold text-4xl md:text-5xl">
          Blog <span className="text-gradient">Sahabat Kreator</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)] text-lg">
          Tips, strategi, dan insight untuk membantu Anda tumbuh di social media.
        </p>
      </div>

      {/* Search */}
      <form
        className="mx-auto mb-12 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Cari artikel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Cari
        </Button>
      </form>

      {isLoading ? (
        <PageLoader />
      ) : posts.length === 0 ? (
        <EmptyState
          title={query ? "Tidak ada hasil" : "Belum ada artikel"}
          description={
            query
              ? `Tidak ditemukan artikel untuk "${query}". Coba kata kunci lain.`
              : "Artikel pertama akan segera hadir. Nantikan ya!"
          }
        />
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <article key={post.id} className="card card-hover overflow-hidden">
              {post.coverImageUrl && (
                <Link to={`/blog/${post.slug}`} className="block">
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                </Link>
              )}
              <div className="p-5">
                {post.categoryName && (
                  <span className="mb-2 inline-block font-medium text-[var(--accent-gold)] text-xs uppercase tracking-wide">
                    {post.categoryName}
                  </span>
                )}
                <h2 className="mb-2 font-semibold text-lg leading-snug">
                  <Link to={`/blog/${post.slug}`} className="hover:text-[var(--accent-gold)]">
                    {post.title}
                  </Link>
                </h2>
                <p className="mb-4 line-clamp-2 text-[var(--text-secondary)] text-sm">
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-3 text-[var(--text-muted)] text-xs">
                  {post.authorName && <span>{post.authorName}</span>}
                  {post.publishedAt && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {formatDate(post.publishedAt)}
                    </span>
                  )}
                  {post.readingTimeMinutes && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {post.readingTimeMinutes} mnt
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!isLoading && posts.length > 0 && (
        <div className="mt-12 text-center">
          <Link to="/register">
            <Button variant="outline">
              Mulai Buat Konten Lebih Baik
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
