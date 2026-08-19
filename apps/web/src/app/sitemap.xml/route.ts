import { NextResponse } from "next/server";
import { db, schema } from "@sahabat-kreator/db";
import { eq, desc } from "drizzle-orm";

// Membaca DB — jangan di-prerender saat build (DB hanya ada saat runtime).
export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await db
    .select({
      slug: schema.blogPost.slug,
      publishedAt: schema.blogPost.publishedAt,
    })
    .from(schema.blogPost)
    .where(eq(schema.blogPost.status, "PUBLISHED"))
    .orderBy(desc(schema.blogPost.publishedAt));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sahabatkreator.com";
  
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/fitur</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/harga</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/tentang</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/faq</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/syarat-ketentuan</loc>
    <changefreq>yearly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${baseUrl}/kebijakan-privasi</loc>
    <changefreq>yearly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${baseUrl}/penghapusan-data</loc>
    <changefreq>yearly</changefreq>
    <priority>0.4</priority>
  </url>
`;

  for (const post of posts) {
    const lastMod = post.publishedAt
      ? new Date(post.publishedAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    sitemap += `
  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  }

  sitemap += `
</urlset>`;

  return new NextResponse(sitemap, {
    headers: {
      "Content-Type": "application/xml",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
