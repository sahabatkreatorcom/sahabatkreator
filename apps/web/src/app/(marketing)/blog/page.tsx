import type { Metadata } from "next";
import Link from "next/link";
import { getAllPublishedPosts } from "@/lib/blog";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, ArrowRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

// Halaman membaca DB — jangan di-prerender saat build (DB hanya ada saat runtime).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Blog | Sahabat Kreator - Tips & Panduan Sosial Media",
    description:
      "Baca tips, tutorial, dan panduan lengkap tentang manajemen media sosial, konten kreator, dan strategi digital marketing dari Sahabat Kreator.",
    openGraph: {
      title: "Blog | Sahabat Kreator",
      description: "Tips, tutorial, dan panduan manajemen media sosial dari Sahabat Kreator.",
      url: "https://sahabatkreator.com/blog",
      siteName: "Sahabat Kreator",
      type: "website",
      locale: "id_ID",
    },
    alternates: {
      canonical: "https://sahabatkreator.com/blog",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

function formatDate(date: Date | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPage() {
  const posts = await getAllPublishedPosts();

  return (
    <>

      {/* Hero */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Blog & <span className="text-primary">Tips</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground md:max-w-2xl mx-auto">
            Panduan lengkap tentang manajemen media sosial, strategi konten, dan tips untuk meningkatkan engagement
          </p>
        </div>
      </section>

      {/* Blog List */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground">Belum ada artikel yang dipublikasikan.</p>
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link href={`/blog/${encodeURIComponent(post.slug)}`} key={post.id}>
                  <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lg">
                    {post.coverImage && (
                      <div className="aspect-video overflow-hidden bg-muted">
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    )}
                    <CardContent className="p-6">
                      {post.tags && post.tags.length > 0 && (
                        <div className="mb-3 flex gap-2">
                          {post.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                            >
                              <Tag className="h-3 w-3" />
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <h2 className="text-xl font-semibold leading-tight group-hover:text-primary">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" />
                          {formatDate(post.publishedAt)}
                        </span>
                        <span className="flex items-center gap-1 text-primary">
                          Baca Selengkapnya
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold">Siap Meningkatkan Konten Anda?</h2>
          <p className="mt-2 text-muted-foreground">Coba Sahabat Kreator gratis 14 hari</p>
          <Link href="/register" className="mt-6 inline-block">
            <Button size="md">Mulai Gratis</Button>
          </Link>
        </div>
      </section>

    </>
  );
}
