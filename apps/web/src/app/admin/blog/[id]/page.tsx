"use client";

import { useState, useEffect, useRef, use, useCallback } from "react";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ArrowLeft,
    Save,
    Eye,
    Calendar,
    Trash2,
    Clock,
    FileText,
    ImageIcon,
    CheckCircle2,
    Loader2,
    X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const readingTime = (text: string) => Math.max(1, Math.ceil(wordCount(text) / 200));

/** Render ringan: paragraf, heading, bold, italic, link, list — tanpa dependensi. */
function renderContent(text: string) {
    const lines = text.split("\n");
    const blocks: React.ReactNode[] = [];
    let listBuffer: string[] = [];
    let key = 0;

    const flushList = () => {
        if (listBuffer.length === 0) return;
        blocks.push(
            <ul key={key++} className="mb-4 list-disc space-y-1 pl-5">
                {listBuffer.map((li, i) => (
                    <li key={i}>{renderInline(li.replace(/^[-*]\s+/, ""))}</li>
                ))}
            </ul>
        );
        listBuffer = [];
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();
        if (!trimmed) {
            flushList();
            continue;
        }
        if (/^[-*]\s+/.test(trimmed)) {
            listBuffer.push(trimmed);
            continue;
        }
        flushList();
        const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            const Tag = (["h1", "h2", "h3"] as const)[level - 1];
            blocks.push(
                <Tag key={key++} className={cn("mb-3 font-bold", level === 1 && "text-2xl", level === 2 && "text-xl", level === 3 && "text-lg")}>
                    {renderInline(heading[2])}
                </Tag>
            );
            continue;
        }
        blocks.push(
            <p key={key++} className="mb-4 text-muted-foreground">
                {renderInline(trimmed)}
            </p>
        );
    }
    flushList();
    return blocks;
}

function renderInline(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
    return parts.map((part, i) => {
        const bold = part.match(/^\*\*(.*)\*\*$/);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const italic = part.match(/^\*(.*)\*$/);
        if (italic) return <em key={i}>{italic[1]}</em>;
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link)
            return (
                <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                    {link[1]}
                </a>
            );
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
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
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [previewMode, setPreviewMode] = useState<"write" | "preview">("write");
    const dirtyRef = useRef(false);

    const markDirty = useCallback(() => {
        dirtyRef.current = true;
        setDirty(true);
    }, []);

    useEffect(() => {
        if (isEdit) {
            fetch(`/api/admin/blog/posts/${id}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.success) {
                        setPost(data.data);
                    } else {
                        setError(data.error || "Gagal memuat post.");
                    }
                })
                .catch(() => setError("Gagal memuat post."))
                .finally(() => setLoading(false));
        }
    }, [id, isEdit]);

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (dirtyRef.current) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, []);

    const generateSlug = (title: string) =>
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

    const handleTitleChange = (value: string) => {
        setPost((prev) => ({ ...prev, title: value, slug: generateSlug(value) }));
        markDirty();
    };

    const setField = (key: keyof PostData, value: string | string[]) => {
        setPost((prev) => ({ ...prev, [key]: value }));
        markDirty();
    };

    const addTag = () => {
        if (tagInput.trim() && !post.tags.includes(tagInput.trim())) {
            setPost((prev) => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
            setTagInput("");
            markDirty();
        }
    };

    const removeTag = (tag: string) => {
        setPost((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
        markDirty();
    };

    const validate = (status: "DRAFT" | "PUBLISHED" | "SCHEDULED"): string | null => {
        if (!post.title.trim()) return "Judul wajib diisi.";
        if (!post.slug.trim()) return "Slug wajib diisi.";
        if (!post.content.trim()) return "Konten masih kosong.";
        if (status === "SCHEDULED" && !post.publishedAt) return "Tanggal jadwal publish wajib diisi.";
        return null;
    };

    const handleSubmit = async (status: "DRAFT" | "PUBLISHED" | "SCHEDULED") => {
        const invalid = validate(status);
        if (invalid) {
            setError(invalid);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const url = isEdit ? `/api/admin/blog/posts/${id}` : "/api/admin/blog/posts";
            const method = isEdit ? "PATCH" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...post, status }),
            });

            const data = await res.json();
            if (data.success) {
                setSaved(true);
                dirtyRef.current = false;
                setDirty(false);
                setTimeout(() => router.push("/admin/blog"), 800);
            } else {
                setError(data.error || "Gagal menyimpan post.");
            }
        } catch (err) {
            setError("Terjadi kesalahan jaringan.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Apakah Anda yakin ingin menghapus post ini?")) return;
        setDeleting(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/blog/posts/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                router.push("/admin/blog");
            } else {
                setError(data.error || "Gagal menghapus post.");
                setDeleting(false);
            }
        } catch (err) {
            setError("Terjadi kesalahan jaringan.");
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
                    <div className="space-y-2">
                        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
                    </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="space-y-4 lg:col-span-2">
                        {[24, 10, 10, 40].map((h, i) => (
                            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" style={{ height: h * 4 }} />
                        ))}
                    </div>
                    <div className="h-72 animate-pulse rounded-lg border border-border bg-muted" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
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
                <div className="flex items-center gap-2">
                    {dirty && !saved && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
                            <Clock className="h-3.5 w-3.5" />
                            Perubahan belum disimpan
                        </span>
                    )}
                    {saved && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Tersimpan
                        </span>
                    )}
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-accent-red/30 bg-accent-red/10 p-4 text-sm text-accent-red">
                    <X className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
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
                            className="text-base"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="slug" className="shrink-0">
                                Slug
                            </Label>
                            <span className="text-xs text-muted-foreground">
                                https://sahabatkreator.com/blog/{post.slug || "..."}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                id="slug"
                                value={post.slug}
                                onChange={(e) => setField("slug", e.target.value)}
                                placeholder="judul-post-anda"
                                className="flex-1 font-mono text-sm"
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                onClick={() => setField("slug", generateSlug(post.title))}
                            >
                                Buat ulang
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="excerpt">Excerpt (ringkasan)</Label>
                        <Textarea
                            id="excerpt"
                            value={post.excerpt}
                            onChange={(e) => setField("excerpt", e.target.value)}
                            placeholder="Deskripsi singkat untuk SEO..."
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                            {post.excerpt.length}/160 karakter
                            <span className={cn("ml-2 font-medium", post.excerpt.length > 160 ? "text-accent-red" : "text-emerald-600")}>
                                {post.excerpt.length > 160 ? "Terlalu panjang untuk SEO" : "Rekomendasi meta description ≤ 160 karakter"}
                            </span>
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="content">Konten</Label>
                            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode("write")}
                                    className={cn(
                                        "rounded px-3 py-1 text-xs font-medium transition-colors",
                                        previewMode === "write" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Tulis
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode("preview")}
                                    className={cn(
                                        "rounded px-3 py-1 text-xs font-medium transition-colors",
                                        previewMode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        Preview
                                    </span>
                                </button>
                            </div>
                        </div>

                        {previewMode === "write" ? (
                            <Textarea
                                id="content"
                                value={post.content}
                                onChange={(e) => setField("content", e.target.value)}
                                placeholder="Tulis konten post di sini..."
                                rows={18}
                                className="font-mono text-sm"
                            />
                        ) : (
                            <div className="min-h-[360px] rounded-md border border-border bg-background p-5">
                                {post.content.trim() ? (
                                    renderContent(post.content)
                                ) : (
                                    <p className="text-sm text-muted-foreground">Konten masih kosong.</p>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <FileText className="h-3.5 w-3.5" />
                                {wordCount(post.content)} kata
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                ±{readingTime(post.content)} mnt baca
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="coverImage">Cover Image URL</Label>
                        <Input
                            id="coverImage"
                            value={post.coverImage}
                            onChange={(e) => setField("coverImage", e.target.value)}
                            placeholder="https://..."
                        />
                        {post.coverImage && (
                            <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={post.coverImage}
                                    alt="Preview cover"
                                    onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).classList.add("hidden");
                                        const fallback = e.currentTarget.parentElement?.querySelector(".cover-fallback");
                                        fallback?.classList.remove("hidden");
                                    }}
                                    className="h-full w-full object-cover"
                                />
                                <div className="cover-fallback hidden absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-2">
                                        <ImageIcon className="h-4 w-4" />
                                        Gambar tidak dapat dimuat
                                    </span>
                                </div>
                            </div>
                        )}
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
                            <div className="mt-2 flex flex-wrap gap-2">
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
                                    onValueChange={(value) => setField("status", value as PostData["status"])}
                                >
                                    <SelectTrigger id="status">
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
                                        onChange={(e) => setField("publishedAt", e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="mt-6 space-y-2">
                            <Button className="w-full gap-2" onClick={() => handleSubmit("DRAFT")} disabled={saving} loading={saving && post.status === "DRAFT"}>
                                <Save className="h-4 w-4" />
                                Simpan Draft
                            </Button>
                            {post.status === "SCHEDULED" ? (
                                <Button
                                    className="w-full gap-2"
                                    variant="secondary"
                                    onClick={() => handleSubmit("SCHEDULED")}
                                    disabled={saving}
                                    loading={saving && post.status === "SCHEDULED"}
                                >
                                    <Calendar className="h-4 w-4" />
                                    Jadwalkan
                                </Button>
                            ) : (
                                <Button
                                    className="w-full gap-2"
                                    variant="secondary"
                                    onClick={() => handleSubmit("PUBLISHED")}
                                    disabled={saving}
                                    loading={saving && post.status === "PUBLISHED"}
                                >
                                    <Eye className="h-4 w-4" />
                                    Publish
                                </Button>
                            )}
                            {isEdit && (
                                <Button
                                    className="w-full"
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={saving || deleting}
                                    loading={deleting}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Hapus Post
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-lg border border-border p-4">
                        <h3 className="mb-3 font-semibold">Preview SEO</h3>
                        <div className="rounded-md border border-border bg-background p-3">
                            <div className="text-sm">
                                <div className="mb-1 truncate text-xs text-emerald-700">
                                    sahabatkreator.com › blog › {post.slug || "..."}
                                </div>
                                <div className="mb-1 truncate text-[15px] font-medium text-[#1a0dab]">
                                    {post.title || "Judul post di sini"}
                                </div>
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                    {post.excerpt || "Ringkasan (excerpt) post akan tampil di sini untuk hasil pencarian."}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            <p>
                                Judul: <span className={cn("font-medium", post.title.length > 60 ? "text-accent-red" : "text-emerald-600")}>{post.title.length}/60</span>
                            </p>
                            <p>
                                Deskripsi: <span className={cn("font-medium", post.excerpt.length > 160 ? "text-accent-red" : "text-emerald-600")}>{post.excerpt.length}/160</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}