"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Eye, Calendar, Trash2 } from "lucide-react";
import Link from "next/link";

interface PostData {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED";
  publishedAt?: string;
  tags: string[];
}

export default function BlogEditorPage({ params }: { params: Promise<{ id?: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const isEdit = !!id;

  const [post, setPost] = useState<PostData>({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImage: "",
    status: "DRAFT",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) {
      fetch(`/api/admin/blog/posts/${id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setPost(data.data);
          }
        })
        .catch(console.error);
    }
  }, [id, isEdit]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleTitleChange = (value: string) => {
    setPost((prev) => ({
      ...prev,
      title: value,
      slug: generateSlug(value),
    }));
  };

  const addTag = () => {
    if (tagInput.trim() && !post.tags.includes(tagInput.trim())) {
      setPost((prev) => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setPost((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleSubmit = async (status: "DRAFT" | "PUBLISHED") => {
    setLoading(true);
    setError(null);

    try {
      const url = isEdit
        ? `/api/admin/blog/posts/${id}`
        : "/api/admin/blog/posts";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...post, status }),
      });

      const data = await res.json();
      if (data.success) {
        router.push("/admin/blog");
      } else {
        setError(data.error || "Failed to save post");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Apakah Anda yakin ingin menghapus post ini?")) return;

    try {
      const res = await fetch(`/api/admin/blog/posts/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        router.push("/admin/blog");
      }
    } catch (err) {
      setError("Failed to delete post");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/blog">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? "Edit Post" : "Post Baru"}</h1>
          <p className="text-muted-foreground">Buat dan kelola artikel blog</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-2">
            <Label htmlFor="title">Judul</Label>
            <Input
              id="title"
              value={post.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Masukkan judul post..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={post.slug}
              onChange={(e) => setPost((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="judul-post-anda"
            />
            <p className="text-xs text-muted-foreground">
              https://sahabatkreator.com/blog/{post.slug || "..."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt (ringkasan)</Label>
            <Textarea
              id="excerpt"
              value={post.excerpt}
              onChange={(e) => setPost((prev) => ({ ...prev, excerpt: e.target.value }))}
              placeholder="Deskripsi singkat untuk SEO..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Konten</Label>
            <Textarea
              id="content"
              value={post.content}
              onChange={(e) => setPost((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Tulis konten post di sini..."
              rows={15}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverImage">Cover Image URL</Label>
            <Input
              id="coverImage"
              value={post.coverImage}
              onChange={(e) => setPost((prev) => ({ ...prev, coverImage: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Tambah tag..."
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                Tambah
              </Button>
            </div>
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-4 font-semibold">Publishing</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={post.status}
                  onValueChange={(value) => setPost((prev) => ({ ...prev, status: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {post.status === "SCHEDULED" && (
                <div className="space-y-2">
                  <Label htmlFor="publishedAt">Tanggal Publish</Label>
                  <Input
                    id="publishedAt"
                    type="datetime-local"
                    value={post.publishedAt}
                    onChange={(e) => setPost((prev) => ({ ...prev, publishedAt: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 space-y-2">
              <Button
                className="w-full gap-2"
                onClick={() => handleSubmit("DRAFT")}
                disabled={loading}
              >
                <Save className="h-4 w-4" />
                Simpan Draft
              </Button>
              <Button
                className="w-full gap-2"
                variant="secondary"
                onClick={() => handleSubmit("PUBLISHED")}
                disabled={loading}
              >
                <Eye className="h-4 w-4" />
                Publish
              </Button>
              {isEdit && (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus Post
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-2 font-semibold">Preview SEO</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Title:</span>
                <p className="font-medium">{post.title || "Belum diisi"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">URL:</span>
                <p className="text-muted-foreground">/blog/{post.slug || "..."}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Excerpt:</span>
                <p className="text-muted-foreground line-clamp-2">{post.excerpt || "Belum diisi"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
