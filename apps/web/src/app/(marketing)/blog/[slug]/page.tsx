import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Tag, ThumbsUp, MessageSquare, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ slug: string }>;
}

// Halaman membaca DB — jangan di-prerender saat build (DB hanya ada saat runtime).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await db.query.blogPost.findFirst({
    where: eq(schema.blogPost.slug, slug),
  });

  if (!post || post.status !== "PUBLISHED") {
    return {
      title: "Post Tidak Ditemukan | Sahabat Kreator",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sahabatkreator.com";

  return {
    title: `${post.title} | Sahabat Kreator`,
    description: post.excerpt || `Baca artikel tentang ${post.title} di Sahabat Kreator`,
    openGraph: {
      title: post.title,
      description: post.excerpt || `Baca artikel tentang ${post.title}`,
      url: `${baseUrl}/blog/${slug}`,
      type: "article",
      publishedTime: post.publishedAt?.toISOString() || new Date().toISOString(),
      siteName: "Sahabat Kreator",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt || `Baca artikel tentang ${post.title}`,
    },
    alternates: {
      canonical: `${baseUrl}/blog/${slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  
  const post = await db.query.blogPost.findFirst({
    where: eq(schema.blogPost.slug, slug),
    with: {
      tags: {
        with: {
          tag: true,
        },
      },
    },
  });

  if (!post || post.status !== "PUBLISHED") {
    notFound();
  }

  const tags: any[] = post.tags?.map((pt: any) => pt.tag) || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-3xl">
          {/* Back Link */}
          <Link href="/blog" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Blog
          </Link>

          {/* Header */}
          <header className="mb-8">
            {tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {tags.map((tag: any) => (
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
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{post.title}</h1>
            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {new Date(post.publishedAt || post.createdAt).toLocaleDateString("id-ID", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            {post.excerpt && (
              <p className="mt-4 text-lg text-muted-foreground">{post.excerpt}</p>
            )}
          </header>

          {/* Cover Image */}
          {post.coverImage && (
            <div className="mb-8 aspect-video overflow-hidden rounded-lg">
              <img
                src={post.coverImage}
                alt={post.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {/* Article Content */}
          <article className="prose prose-lg dark:prose-invert max-w-none">
            {post.content.split("\n").map((paragraph, index) => (
              <p key={index} className="mb-4 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </article>

          {/* Actions */}
          <div className="mt-12 flex items-center gap-4 border-t border-border pt-6">
            <Button variant="secondary" size="sm" className="gap-2">
              <ThumbsUp className="h-4 w-4" />
              Like
            </Button>
            <Button variant="secondary" size="sm" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Komentar ({0})
            </Button>
            <Button variant="secondary" size="sm" className="gap-2">
              <Share2 className="h-4 w-4" />
              Bagikan
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
