// Admin: Blog Editor — tulis/edit artikel dengan SEO fields
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bold,
  Eye,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Save,
  Search,
  Underline,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { slugify } from "@/lib/format";

type BlogPostDetail = {
  id: string;
  title: string;
  slug: string;
  contentHtml: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  categoryId: string | null;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  isFeatured: boolean;
  tags: string[];
};

type Category = { id: string; name: string };

const STATUSES = ["draft", "review", "scheduled", "published", "archived"] as const;

export function AdminBlogEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [preview, setPreview] = useState(false);

  const { data: postData, isLoading } = useQuery({
    queryKey: ["admin-blog-post", id],
    queryFn: () => api.get<{ post: BlogPostDetail }>(`/blog/admin/posts/${id}`),
    enabled: !isNew,
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: () => api.get<{ categories: Category[] }>("/blog/categories"),
  });

  // Isi form dari data existing
  useEffect(() => {
    if (!postData?.post) return;
    const p = postData.post;
    setTitle(p.title);
    setSlug(p.slug);
    setExcerpt(p.excerpt ?? "");
    setContentHtml(p.contentHtml);
    setCoverImageUrl(p.coverImageUrl ?? "");
    setCategoryId(p.categoryId ?? "");
    setStatus(p.status);
    setMetaTitle(p.metaTitle ?? "");
    setMetaDescription(p.metaDescription ?? "");
    setCanonicalUrl(p.canonicalUrl ?? "");
    setIsFeatured(p.isFeatured);
    setTagsInput(p.tags.join(", "));
    if (editorRef.current) editorRef.current.innerHTML = p.contentHtml;
  }, [postData]);

  function execCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) setContentHtml(editorRef.current.innerHTML);
  }

  const save = useMutation({
    mutationFn: async () => {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10);

      const payload = {
        title,
        slug: slug || slugify(title),
        contentHtml,
        excerpt: excerpt || undefined,
        coverImageUrl: coverImageUrl || undefined,
        categoryId: categoryId || undefined,
        status: status as (typeof STATUSES)[number],
        metaTitle: metaTitle || undefined,
        metaDescription: metaDescription || undefined,
        canonicalUrl: canonicalUrl || undefined,
        isFeatured,
        tags,
      };

      if (isNew) {
        return api.post<{ id: string; slug: string }>("/blog/admin/posts", payload);
      }
      return api.patch(`/blog/admin/posts/${id}`, payload);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-blog-post"] });
      toast.success(isNew ? "Artikel dibuat" : "Artikel tersimpan");
      if (isNew && result) {
        navigate(`/admin/blog/${(result as { id: string }).id}`, { replace: true });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isNew && isLoading) return <PageLoader />;

  const slugPreview = slug || slugify(title) || "slug-otomatis-dari-judul";
  const metaTitleLen = (metaTitle || title).length;
  const metaDescLen = (metaDescription || excerpt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/blog">
            <Button variant="ghost" size="icon" aria-label="Kembali">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-2xl">{isNew ? "Tulis Artikel" : "Edit Artikel"}</h1>
            <p className="text-[var(--text-muted)] text-sm">/blog/{slugPreview}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPreview((v) => !v)}>
            <Eye className="h-4 w-4" />
            {preview ? "Edit" : "Pratinjau"}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !title.trim()}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Editor */}
        <div className="space-y-6 lg:col-span-2">
          <div className="card space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="title">Judul</Label>
              <Input
                id="title"
                placeholder="Judul artikel yang menarik..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
                className="font-semibold text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug URL</Label>
              <Input
                id="slug"
                placeholder="otomatis dari judul jika kosong"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="excerpt">Ringkasan (excerpt)</Label>
              <Textarea
                id="excerpt"
                placeholder="Ringkasan singkat untuk daftar blog dan meta description fallback..."
                rows={2}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                maxLength={300}
              />
            </div>
          </div>

          {/* Rich text editor */}
          <div className="card p-6">
            <Label className="mb-3 block">Konten</Label>
            {preview ? (
              <div
                className="article-content min-h-96"
                dangerouslySetInnerHTML={{ __html: contentHtml || "<p>Belum ada konten.</p>" }}
              />
            ) : (
              <>
                {/* Toolbar */}
                <div className="mb-2 flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--border)] p-1">
                  {[
                    { icon: Bold, cmd: "bold", title: "Bold" },
                    { icon: Italic, cmd: "italic", title: "Italic" },
                    { icon: Underline, cmd: "underline", title: "Underline" },
                    { icon: Heading2, cmd: "formatBlock", value: "h2", title: "Heading 2" },
                    { icon: Quote, cmd: "formatBlock", value: "blockquote", title: "Quote" },
                    { icon: List, cmd: "insertUnorderedList", title: "Bullet list" },
                    { icon: ListOrdered, cmd: "insertOrderedList", title: "Numbered list" },
                  ].map((btn) => (
                    <button
                      key={btn.cmd + (btn.value ?? "")}
                      type="button"
                      title={btn.title}
                      onClick={() => execCommand(btn.cmd, btn.value)}
                      className="flex h-8 w-8 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                    >
                      <btn.icon className="h-4 w-4" />
                    </button>
                  ))}
                  <button
                    type="button"
                    title="Sisipkan link"
                    onClick={() => {
                      const url = prompt("URL link:");
                      if (url) execCommand("createLink", url);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Sisipkan gambar dari URL"
                    onClick={() => {
                      const url = prompt("URL gambar:");
                      if (url) execCommand("insertImage", url);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="article-content min-h-96 rounded-[var(--radius-md)] border border-[var(--border)] p-4 outline-none focus:border-[var(--accent-gold)]"
                  onInput={(e) => setContentHtml((e.target as HTMLDivElement).innerHTML)}
                  dangerouslySetInnerHTML={{ __html: contentHtml }}
                />
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Publikasi */}
          <div className="card space-y-4 p-6">
            <h2 className="font-semibold">Publikasi</h2>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`rounded-full border px-3 py-1 text-xs capitalize ${
                      status === s
                        ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                        : "border-[var(--border)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Tanpa kategori</option>
                {(categoriesData?.categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tag (pisahkan dengan koma)</Label>
              <Input
                id="tags"
                placeholder="instagram, tips, konten"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent-gold)]"
              />
              Tampilkan sebagai artikel unggulan
            </label>
          </div>

          {/* Cover image */}
          <div className="card space-y-4 p-6">
            <h2 className="font-semibold">Gambar Cover</h2>
            <Input
              placeholder="https://... atau /uploads/cover.jpg"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
            />
            {coverImageUrl && (
              <img
                src={coverImageUrl}
                alt="Preview cover"
                className="aspect-video w-full rounded-[var(--radius-md)] object-cover"
              />
            )}
          </div>

          {/* SEO */}
          <div className="card space-y-4 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Search className="h-4 w-4" />
              SEO
            </h2>
            <div className="space-y-2">
              <Label htmlFor="meta-title">Meta Title</Label>
              <Input
                id="meta-title"
                placeholder="Fallback: judul artikel"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                maxLength={200}
              />
              <p
                className={`text-xs ${metaTitleLen > 60 ? "text-red-500" : "text-[var(--text-muted)]"}`}
              >
                {metaTitleLen}/60 karakter (ideal 50-60)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-desc">Meta Description</Label>
              <Textarea
                id="meta-desc"
                placeholder="Fallback: excerpt"
                rows={3}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                maxLength={300}
              />
              <p
                className={`text-xs ${metaDescLen > 160 ? "text-red-500" : "text-[var(--text-muted)]"}`}
              >
                {metaDescLen}/160 karakter (ideal 140-160)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="canonical">Canonical URL (opsional)</Label>
              <Input
                id="canonical"
                placeholder="https://sumber-asal.com/artikel"
                value={canonicalUrl}
                onChange={(e) => setCanonicalUrl(e.target.value)}
              />
            </div>
            {/* Preview SERP */}
            <div className="rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                Pratinjau Google
              </p>
              <p className="mt-1 truncate text-green-600 text-xs">
                sahabatkreator.com › blog › {slugPreview}
              </p>
              <p className="truncate font-medium text-blue-600 text-sm">
                {metaTitle || title || "Judul artikel"}
              </p>
              <p className="line-clamp-2 text-[var(--text-secondary)] text-xs">
                {metaDescription || excerpt || "Deskripsi artikel akan tampil di sini."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
