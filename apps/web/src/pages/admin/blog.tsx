// Admin: Blog — daftar semua post + kategori management
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";

type Post = {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: string | null;
  viewCount: number;
  isFeatured: boolean;
  updatedAt: string;
  categoryName: string | null;
  authorName: string | null;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  postCount: number;
};

const STATUS_VARIANT: Record<string, "success" | "secondary" | "primary" | "destructive"> = {
  published: "success",
  draft: "secondary",
  review: "primary",
  scheduled: "primary",
  archived: "destructive",
};

export function AdminBlogPage() {
  const queryClient = useQueryClient();
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: () => api.get<{ posts: Post[] }>("/blog/admin/posts"),
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: () => api.get<{ categories: Category[] }>("/blog/categories"),
  });

  const deletePost = useMutation({
    mutationFn: (id: string) => api.delete(`/blog/admin/posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast.success("Post dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCategory = useMutation({
    mutationFn: () => api.post("/blog/admin/categories", { name: categoryName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
      setCategoryModal(false);
      setCategoryName("");
      toast.success("Kategori dibuat");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.delete(`/blog/admin/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
      toast.success("Kategori dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <PageLoader />;

  const posts = data?.posts ?? [];
  const categories = categoriesData?.categories ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Blog</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">{posts.length} artikel</p>
        </div>
        <Link to="/admin/blog/new">
          <Button>
            <Plus className="h-4 w-4" />
            Tulis Artikel
          </Button>
        </Link>
      </div>

      {/* Kategori */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-sm">
            <Tag className="h-4 w-4" />
            Kategori
          </h2>
          <Button size="sm" variant="outline" onClick={() => setCategoryModal(true)}>
            <Plus className="h-3.5 w-3.5" />
            Tambah
          </Button>
        </div>
        {categories.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">Belum ada kategori.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat.id}
                className="group flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-sm"
              >
                {cat.name}
                <span className="text-[var(--text-muted)] text-xs">{cat.postCount}</span>
                <button
                  type="button"
                  onClick={() => deleteCategory.mutate(cat.id)}
                  className="hidden text-red-500 group-hover:block"
                  aria-label={`Hapus kategori ${cat.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabel post */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs">
              <th className="px-5 py-3 font-medium">Judul</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Kategori</th>
              <th className="px-5 py-3 font-medium">Views</th>
              <th className="px-5 py-3 font-medium">Diperbarui</th>
              <th className="px-5 py-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-light)]">
            {posts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[var(--text-muted)]">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  Belum ada artikel. Klik "Tulis Artikel" untuk memulai.
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id} className="hover:bg-[var(--bg-secondary)]">
                  <td className="px-5 py-3">
                    <Link
                      to={`/admin/blog/${post.id}`}
                      className="font-medium hover:text-[var(--accent-gold)]"
                    >
                      {post.title}
                    </Link>
                    {post.isFeatured && (
                      <Badge variant="primary" className="ml-2 text-[10px]">
                        unggulan
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[post.status] ?? "secondary"}>
                      {post.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)] text-xs">
                    {post.categoryName ?? "—"}
                  </td>
                  <td className="px-5 py-3">{formatNumber(post.viewCount)}</td>
                  <td className="px-5 py-3 text-[var(--text-muted)] text-xs">
                    {formatDate(post.updatedAt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {post.status === "published" && (
                        <Link to={`/blog/${post.slug}`}>
                          <Button size="sm" variant="ghost">
                            Lihat
                          </Button>
                        </Link>
                      )}
                      <Link to={`/admin/blog/${post.id}`}>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => {
                          if (confirm(`Hapus "${post.title}"?`)) {
                            deletePost.mutate(post.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal kategori */}
      {categoryModal && (
        <Modal open onClose={() => setCategoryModal(false)} title="Kategori Baru">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createCategory.mutate();
            }}
          >
            <Input
              placeholder="Nama kategori (mis. Tips Instagram)"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
              maxLength={100}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCategoryModal(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createCategory.isPending || !categoryName.trim()}>
                {createCategory.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Buat
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
