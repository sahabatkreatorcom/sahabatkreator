import Link from "next/link";
import { db, schema } from "@sahabat-kreator/db";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Eye, Calendar } from "lucide-react";
import { requireAuth } from "@/lib/api";

export default async function AdminBlogPage() {
  // Check auth
  const auth = await requireAuth();
  if (!auth) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Silakan login terlebih dahulu.</p>
      </div>
    );
  }

  const posts = await db.select({
    id: schema.blogPost.id,
    slug: schema.blogPost.slug,
    title: schema.blogPost.title,
    excerpt: schema.blogPost.excerpt,
    status: schema.blogPost.status,
    publishedAt: schema.blogPost.publishedAt,
    createdAt: schema.blogPost.createdAt,
  }).from(schema.blogPost).limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Blog Posts</h1>
          <p className="text-muted-foreground">Kelola artikel blog untuk SEO</p>
        </div>
        <Link href="/admin/blog/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Post Baru
          </Button>
        </Link>
      </div>

      <div className="rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Judul</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Published</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada post. Buat post pertama Anda!
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{post.title}</div>
                    <div className="text-xs text-muted-foreground">{post.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      post.status === "PUBLISHED" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      post.status === "DRAFT" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                      "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                    }`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("id-ID") : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/blog/${post.slug}`} target="_blank">
                        <Button variant="ghost" size="icon" title="Lihat">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/admin/blog/${post.id}`}>
                        <Button variant="ghost" size="icon" title="Edit">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
