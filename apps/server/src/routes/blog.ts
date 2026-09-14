// API Blog — public (SEO friendly) + CRUD untuk editor admin

import { db } from "@sahabatkreator/db";
import { blogCategory, blogPost, blogPostTag, user } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const blogRoute = new Hono();

// ---------- Public endpoints (tanpa auth) ----------

/** GET /blog/posts — daftar post published (public) */
blogRoute.get("/posts", async (c) => {
  const page = Math.max(Number(c.req.query("page") ?? 1), 1);
  const perPage = Math.min(Number(c.req.query("perPage") ?? 10), 50);
  const categorySlug = c.req.query("category");
  const tag = c.req.query("tag");
  const search = c.req.query("q");

  const conditions = [eq(blogPost.status, "published")];
  if (categorySlug) {
    const [cat] = await db
      .select({ id: blogCategory.id })
      .from(blogCategory)
      .where(eq(blogCategory.slug, categorySlug))
      .limit(1);
    if (cat) conditions.push(eq(blogPost.categoryId, cat.id));
  }
  if (search) {
    conditions.push(
      sql`(${blogPost.title} ilike ${`%${search}%`} or ${blogPost.excerpt} ilike ${`%${search}%`})`,
    );
  }

  const posts = await db
    .select({
      id: blogPost.id,
      title: blogPost.title,
      slug: blogPost.slug,
      excerpt: blogPost.excerpt,
      coverImageUrl: blogPost.coverImageUrl,
      publishedAt: blogPost.publishedAt,
      readingTimeMinutes: blogPost.readingTimeMinutes,
      metaDescription: blogPost.metaDescription,
      authorName: user.name,
      authorImage: user.image,
      categoryName: blogCategory.name,
      categorySlug: blogCategory.slug,
    })
    .from(blogPost)
    .leftJoin(user, eq(blogPost.authorId, user.id))
    .leftJoin(blogCategory, eq(blogPost.categoryId, blogCategory.id))
    .where(and(...conditions))
    .orderBy(desc(blogPost.publishedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Filter by tag jika ada (post-processing sederhana)
  let items = posts;
  if (tag) {
    const taggedIds = await db
      .select({ postId: blogPostTag.postId })
      .from(blogPostTag)
      .where(eq(blogPostTag.tag, tag));
    const idSet = new Set(taggedIds.map((t) => t.postId));
    items = posts.filter((p) => idSet.has(p.id));
  }

  return c.json({ posts: items, page, perPage });
});

/** GET /blog/posts/:slug — detail post published (public) */
blogRoute.get("/posts/:slug", async (c) => {
  const [post] = await db
    .select({
      id: blogPost.id,
      title: blogPost.title,
      slug: blogPost.slug,
      contentHtml: blogPost.contentHtml,
      excerpt: blogPost.excerpt,
      coverImageUrl: blogPost.coverImageUrl,
      coverImageAlt: blogPost.coverImageAlt,
      publishedAt: blogPost.publishedAt,
      updatedAt: blogPost.updatedAt,
      readingTimeMinutes: blogPost.readingTimeMinutes,
      metaTitle: blogPost.metaTitle,
      metaDescription: blogPost.metaDescription,
      ogImageUrl: blogPost.ogImageUrl,
      canonicalUrl: blogPost.canonicalUrl,
      viewCount: blogPost.viewCount,
      authorName: user.name,
      authorImage: user.image,
      categoryName: blogCategory.name,
      categorySlug: blogCategory.slug,
    })
    .from(blogPost)
    .leftJoin(user, eq(blogPost.authorId, user.id))
    .leftJoin(blogCategory, eq(blogPost.categoryId, blogCategory.id))
    .where(and(eq(blogPost.slug, c.req.param("slug")), eq(blogPost.status, "published")))
    .limit(1);

  if (!post) return c.json({ message: "Artikel tidak ditemukan" }, 404);

  // Increment view count (fire and forget)
  db.update(blogPost)
    .set({ viewCount: sql`${blogPost.viewCount} + 1` })
    .where(eq(blogPost.id, post.id))
    .catch(() => {});

  const tags = await db
    .select({ tag: blogPostTag.tag })
    .from(blogPostTag)
    .where(eq(blogPostTag.postId, post.id));

  return c.json({ post: { ...post, tags: tags.map((t) => t.tag) } });
});

/** GET /blog/categories — daftar kategori (public) */
blogRoute.get("/categories", async (c) => {
  const categories = await db
    .select({
      id: blogCategory.id,
      name: blogCategory.name,
      slug: blogCategory.slug,
      description: blogCategory.description,
      postCount: sql<number>`(select count(*)::int from ${blogPost} where ${blogPost.categoryId} = ${blogCategory.id} and ${blogPost.status} = 'published')`,
    })
    .from(blogCategory)
    .orderBy(blogCategory.name);
  return c.json({ categories });
});

/**
 * Build XML sitemap artikel blog published. Dipakai endpoint root
 * /sitemap-blog.xml (liwat apps/server/src/index.ts) — URL selalu absolut
 * berbasis env.WEB_URL (canonical produksi) sehingga staging tidak pernah
 * menghasilkan URL kanonik palsu.
 */
export async function buildBlogSitemapXml(): Promise<string> {
  const posts = await db
    .select({
      slug: blogPost.slug,
      updatedAt: blogPost.updatedAt,
      publishedAt: blogPost.publishedAt,
    })
    .from(blogPost)
    .where(eq(blogPost.status, "published"))
    .orderBy(desc(blogPost.publishedAt));

  const baseUrl = env.WEB_URL.replace(/\/$/, "");
  const urls = posts
    .map((p) => {
      const lastmod = (p.updatedAt ?? p.publishedAt)?.toISOString().slice(0, 10) ?? "";
      return `  <url>
    <loc>${baseUrl}/blog/${p.slug}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// ---------- Admin endpoints (superadmin) ----------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function estimateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** GET /blog/admin/posts — semua post (semua status) */
blogRoute.get("/admin/posts", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const posts = await db
      .select({
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
        status: blogPost.status,
        publishedAt: blogPost.publishedAt,
        viewCount: blogPost.viewCount,
        isFeatured: blogPost.isFeatured,
        updatedAt: blogPost.updatedAt,
        categoryName: blogCategory.name,
        authorName: user.name,
      })
      .from(blogPost)
      .leftJoin(blogCategory, eq(blogPost.categoryId, blogCategory.id))
      .leftJoin(user, eq(blogPost.authorId, user.id))
      .orderBy(desc(blogPost.updatedAt));
    return c.json({ posts });
  } catch (error) {
    return errorResponse(error);
  }
});

const upsertPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(120).optional(),
  contentHtml: z.string().default(""),
  excerpt: z.string().max(300).optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  coverImageAlt: z.string().max(200).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  status: z.enum(["draft", "review", "scheduled", "published", "archived"]).optional(),
  publishedAt: z.string().datetime().optional().nullable(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(300).optional(),
  ogImageUrl: z.string().url().optional().nullable(),
  canonicalUrl: z.string().url().optional().nullable(),
  isFeatured: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

/** POST /blog/admin/posts — buat post baru */
blogRoute.post("/admin/posts", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = upsertPostSchema.parse(await c.req.json());

    const id = generateId("blog");
    const slug = slugify(input.slug || input.title);
    const status = input.status ?? "draft";

    await db.insert(blogPost).values({
      id,
      title: input.title,
      slug,
      contentHtml: input.contentHtml,
      excerpt: input.excerpt ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      coverImageAlt: input.coverImageAlt ?? null,
      categoryId: input.categoryId ?? null,
      authorId: ctx.user.id,
      status,
      publishedAt: status === "published" ? new Date() : null,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      ogImageUrl: input.ogImageUrl ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      readingTimeMinutes: estimateReadingTime(input.contentHtml),
      isFeatured: input.isFeatured ?? false,
    });

    if (input.tags?.length) {
      await db.insert(blogPostTag).values(
        input.tags.map((tag) => ({
          id: generateId("tag"),
          postId: id,
          tag,
        })),
      );
    }

    return c.json({ id, slug }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /blog/admin/posts/:id — detail untuk editor */
blogRoute.get("/admin/posts/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const [post] = await db
      .select()
      .from(blogPost)
      .where(eq(blogPost.id, c.req.param("id")))
      .limit(1);
    if (!post) return c.json({ message: "Post tidak ditemukan" }, 404);

    const tags = await db
      .select({ tag: blogPostTag.tag })
      .from(blogPostTag)
      .where(eq(blogPostTag.postId, post.id));

    return c.json({ post: { ...post, tags: tags.map((t) => t.tag) } });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /blog/admin/posts/:id — update post */
blogRoute.patch("/admin/posts/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const input = upsertPostSchema.partial().parse(await c.req.json());

    const [existing] = await db
      .select()
      .from(blogPost)
      .where(eq(blogPost.id, c.req.param("id")))
      .limit(1);
    if (!existing) return c.json({ message: "Post tidak ditemukan" }, 404);

    const status = input.status ?? existing.status;
    const contentHtml = input.contentHtml ?? existing.contentHtml;

    await db
      .update(blogPost)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.slug !== undefined ? { slug: slugify(input.slug) } : {}),
        ...(input.contentHtml !== undefined ? { contentHtml } : {}),
        ...(input.excerpt !== undefined ? { excerpt: input.excerpt ?? null } : {}),
        ...(input.coverImageUrl !== undefined
          ? { coverImageUrl: input.coverImageUrl ?? null }
          : {}),
        ...(input.coverImageAlt !== undefined
          ? { coverImageAlt: input.coverImageAlt ?? null }
          : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
        ...(input.status !== undefined ? { status } : {}),
        ...(input.publishedAt !== undefined
          ? { publishedAt: input.publishedAt ? new Date(input.publishedAt) : null }
          : {}),
        ...(status === "published" && !existing.publishedAt && !input.publishedAt
          ? { publishedAt: new Date() }
          : {}),
        ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle ?? null } : {}),
        ...(input.metaDescription !== undefined
          ? { metaDescription: input.metaDescription ?? null }
          : {}),
        ...(input.ogImageUrl !== undefined ? { ogImageUrl: input.ogImageUrl ?? null } : {}),
        ...(input.canonicalUrl !== undefined ? { canonicalUrl: input.canonicalUrl ?? null } : {}),
        ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
        ...(input.contentHtml !== undefined
          ? { readingTimeMinutes: estimateReadingTime(contentHtml) }
          : {}),
      })
      .where(eq(blogPost.id, existing.id));

    if (input.tags !== undefined) {
      await db.delete(blogPostTag).where(eq(blogPostTag.postId, existing.id));
      if (input.tags.length > 0) {
        await db.insert(blogPostTag).values(
          input.tags.map((tag) => ({
            id: generateId("tag"),
            postId: existing.id,
            tag,
          })),
        );
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /blog/admin/posts/:id */
blogRoute.delete("/admin/posts/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    await db.delete(blogPost).where(eq(blogPost.id, c.req.param("id")));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Kategori (admin) ----------

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
});

blogRoute.post("/admin/categories", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const input = categorySchema.parse(await c.req.json());
    const id = generateId("cat");
    await db.insert(blogCategory).values({
      id,
      name: input.name,
      slug: slugify(input.name),
      description: input.description ?? null,
    });
    return c.json({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

blogRoute.delete("/admin/categories/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    await db.delete(blogCategory).where(eq(blogCategory.id, c.req.param("id")));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
