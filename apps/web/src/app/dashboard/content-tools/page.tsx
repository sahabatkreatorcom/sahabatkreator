"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Edit3, FolderTree, Hash, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Pillar {
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string | null;
    createdAt: string;
}

interface CaptionTemplate {
    id: string;
    name: string;
    caption: string;
    hashtags: string[];
    category: string | null;
    platforms: string[];
    usageCount: number;
    createdAt: string;
    updatedAt: string;
}

interface HashtagCollection {
    id: string;
    name: string;
    hashtags: string[];
    usageCount: number;
    createdAt: string;
    updatedAt: string;
}

type Tab = "pillars" | "templates" | "hashtags";

const COLOR_OPTIONS = ["#D4A574", "#7C9A6E", "#5B7C99", "#A06E8C", "#C08B4C", "#6E8CA0", "#8C6E5B", "#B5A66E"];

export default function ContentToolsPage() {
    const [tab, setTab] = useState<Tab>("pillars");

    const [pillars, setPillars] = useState<Pillar[]>([]);
    const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
    const [collections, setCollections] = useState<HashtagCollection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [pillarOpen, setPillarOpen] = useState(false);
    const [pillarEdit, setPillarEdit] = useState<Pillar | null>(null);
    const [pillarName, setPillarName] = useState("");
    const [pillarDesc, setPillarDesc] = useState("");
    const [pillarColor, setPillarColor] = useState(COLOR_OPTIONS[0]);

    const [templateOpen, setTemplateOpen] = useState(false);
    const [templateEdit, setTemplateEdit] = useState<CaptionTemplate | null>(null);
    const [templateName, setTemplateName] = useState("");
    const [templateCaption, setTemplateCaption] = useState("");
    const [templateCategory, setTemplateCategory] = useState("");
    const [templateHashtags, setTemplateHashtags] = useState("");

    const [collectionOpen, setCollectionOpen] = useState(false);
    const [collectionEdit, setCollectionEdit] = useState<HashtagCollection | null>(null);
    const [collectionName, setCollectionName] = useState("");
    const [collectionTags, setCollectionTags] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [p, t, c] = await Promise.all([
                fetch("/api/pillars").then((r) => r.json()),
                fetch("/api/caption-templates").then((r) => r.json()),
                fetch("/api/hashtag-collections").then((r) => r.json()),
            ]);
            setPillars(p.pillars ?? []);
            setTemplates(t.templates ?? []);
            setCollections(c.collections ?? []);
        } catch {
            setError("Gagal memuat data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function api(url: string, method: string, body?: unknown) {
        const res = await fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Gagal menyimpan.");
        return data;
    }

    // ── Pillars ──
    async function savePillar() {
        if (!pillarName.trim()) return;
        try {
            setError(null);
            if (pillarEdit) {
                await api(`/api/pillars/${pillarEdit.id}`, "PATCH", {
                    name: pillarName,
                    description: pillarDesc || null,
                    color: pillarColor,
                });
            } else {
                await api("/api/pillars", "POST", { name: pillarName, description: pillarDesc || null, color: pillarColor });
            }
            setPillarOpen(false);
            setPillarEdit(null);
            setPillarName("");
            setPillarDesc("");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan pilar.");
        }
    }

    async function removePillar(p: Pillar) {
        if (!confirm(`Hapus pilar "${p.name}"?`)) return;
        try {
            setError(null);
            await api(`/api/pillars/${p.id}`, "DELETE");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus.");
        }
    }

    // ── Caption templates ──
    async function saveTemplate() {
        if (!templateName.trim() || !templateCaption.trim()) return;
        try {
            setError(null);
            const hashtags = templateHashtags.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean);
            const body = {
                name: templateName,
                caption: templateCaption,
                category: templateCategory || undefined,
                hashtags,
            };
            if (templateEdit) {
                await api(`/api/caption-templates/${templateEdit.id}`, "PATCH", body);
            } else {
                await api("/api/caption-templates", "POST", body);
            }
            setTemplateOpen(false);
            setTemplateEdit(null);
            setTemplateName("");
            setTemplateCaption("");
            setTemplateCategory("");
            setTemplateHashtags("");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan template.");
        }
    }

    async function removeTemplate(t: CaptionTemplate) {
        if (!confirm(`Hapus template "${t.name}"?`)) return;
        try {
            setError(null);
            await api(`/api/caption-templates/${t.id}`, "DELETE");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus.");
        }
    }

    // ── Hashtag collections ──
    async function saveCollection() {
        if (!collectionName.trim() || !collectionTags.trim()) return;
        try {
            setError(null);
            const hashtags = collectionTags.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean);
            const body = { name: collectionName, hashtags };
            if (collectionEdit) {
                await api(`/api/hashtag-collections/${collectionEdit.id}`, "PATCH", body);
            } else {
                await api("/api/hashtag-collections", "POST", body);
            }
            setCollectionOpen(false);
            setCollectionEdit(null);
            setCollectionName("");
            setCollectionTags("");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan koleksi.");
        }
    }

    async function removeCollection(c: HashtagCollection) {
        if (!confirm(`Hapus koleksi "${c.name}"?`)) return;
        try {
            setError(null);
            await api(`/api/hashtag-collections/${c.id}`, "DELETE");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus.");
        }
    }

    const TAB_BUTTONS: { value: Tab; label: string; icon: React.ReactNode }[] = [
        { value: "pillars", label: "Pilar konten", icon: <FolderTree className="h-4 w-4" /> },
        { value: "templates", label: "Template caption", icon: <LayoutTemplate className="h-4 w-4" /> },
        { value: "hashtags", label: "Koleksi hashtag", icon: <Hash className="h-4 w-4" /> },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Content tools</h1>
                    <p className="text-sm text-muted-foreground">Pilar konten, template caption, dan koleksi hashtag untuk mempercepat pembuatan post.</p>
                </div>
                <Button
                    size="sm"
                    onClick={() => {
                        if (tab === "pillars") {
                            setPillarEdit(null); setPillarName(""); setPillarDesc(""); setPillarColor(COLOR_OPTIONS[0]); setPillarOpen(true);
                        } else if (tab === "templates") {
                            setTemplateEdit(null); setTemplateName(""); setTemplateCaption(""); setTemplateCategory(""); setTemplateHashtags(""); setTemplateOpen(true);
                        } else {
                            setCollectionEdit(null); setCollectionName(""); setCollectionTags(""); setCollectionOpen(true);
                        }
                    }}
                >
                    <Plus className="h-4 w-4" />
                    Tambah
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="flex flex-wrap gap-1.5">
                {TAB_BUTTONS.map((b) => (
                    <button
                        key={b.value}
                        onClick={() => setTab(b.value)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                            tab === b.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {b.icon}
                        {b.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="py-8 text-sm text-muted-foreground">Memuat…</p>
            ) : tab === "pillars" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pillars.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Belum ada pilar konten. Buat yang pertama.</p>}
                    {pillars.map((p) => (
                        <div key={p.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.color }} />
                                    <h3 className="font-medium">{p.name}</h3>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => {
                                            setPillarEdit(p); setPillarName(p.name); setPillarDesc(p.description ?? ""); setPillarColor(p.color); setPillarOpen(true);
                                        }}
                                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => removePillar(p)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
                        </div>
                    ))}
                </div>
            ) : tab === "templates" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Belum ada template caption.</p>}
                    {templates.map((t) => (
                        <div key={t.id} className="flex flex-col rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="font-medium">{t.name}</h3>
                                    {t.category && <span className="text-xs text-muted-foreground">{t.category}</span>}
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => {
                                            setTemplateEdit(t); setTemplateName(t.name); setTemplateCaption(t.caption); setTemplateCategory(t.category ?? ""); setTemplateHashtags(t.hashtags.join(", ")); setTemplateOpen(true);
                                        }}
                                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => removeTemplate(t)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{t.caption}</p>
                            {t.hashtags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {t.hashtags.slice(0, 6).map((h) => (
                                        <span key={h} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">#{h}</span>
                                    ))}
                                    {t.hashtags.length > 6 && <span className="text-xs text-muted-foreground">+{t.hashtags.length - 6}</span>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {collections.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Belum ada koleksi hashtag.</p>}
                    {collections.map((c) => (
                        <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="font-medium">{c.name}</h3>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => {
                                            setCollectionEdit(c); setCollectionName(c.name); setCollectionTags(c.hashtags.join(", ")); setCollectionOpen(true);
                                        }}
                                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => removeCollection(c)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {c.hashtags.map((h) => (
                                    <span key={h} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">#{h}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Dialog pilar */}
            <Dialog open={pillarOpen} onClose={() => setPillarOpen(false)} title={pillarEdit ? "Ubah pilar" : "Pilar baru"}>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="pillar-name">Nama</Label>
                        <Input id="pillar-name" value={pillarName} onChange={(e) => setPillarName(e.target.value)} placeholder="mis. Edukasi" />
                    </div>
                    <div>
                        <Label htmlFor="pillar-desc">Deskripsi</Label>
                        <Input id="pillar-desc" value={pillarDesc} onChange={(e) => setPillarDesc(e.target.value)} placeholder="opsional" />
                    </div>
                    <div>
                        <Label>Warna</Label>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {COLOR_OPTIONS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setPillarColor(c)}
                                    className={cn("h-7 w-7 rounded-full border-2", pillarColor === c ? "border-primary" : "border-transparent")}
                                    style={{ background: c }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setPillarOpen(false)}>Batal</Button>
                        <Button size="sm" onClick={savePillar}>Simpan</Button>
                    </div>
                </div>
            </Dialog>

            {/* Dialog template */}
            <Dialog open={templateOpen} onClose={() => setTemplateOpen(false)} title={templateEdit ? "Ubah template" : "Template caption baru"}>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="tmpl-name">Nama</Label>
                        <Input id="tmpl-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="mis. Promo produk baru" />
                    </div>
                    <div>
                        <Label htmlFor="tmpl-cat">Kategori</Label>
                        <Input id="tmpl-cat" value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value)} placeholder="mis. Promosi" />
                    </div>
                    <div>
                        <Label htmlFor="tmpl-caption">Caption</Label>
                        <textarea
                            id="tmpl-caption"
                            value={templateCaption}
                            onChange={(e) => setTemplateCaption(e.target.value)}
                            rows={4}
                            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                            placeholder="Tulis template caption…"
                        />
                    </div>
                    <div>
                        <Label htmlFor="tmpl-tags">Hashtag (pisahkan dengan koma)</Label>
                        <Input id="tmpl-tags" value={templateHashtags} onChange={(e) => setTemplateHashtags(e.target.value)} placeholder="kuliner, promo, baru" />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(false)}>Batal</Button>
                        <Button size="sm" onClick={saveTemplate}>Simpan</Button>
                    </div>
                </div>
            </Dialog>

            {/* Dialog koleksi hashtag */}
            <Dialog open={collectionOpen} onClose={() => setCollectionOpen(false)} title={collectionEdit ? "Ubah koleksi" : "Koleksi hashtag baru"}>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="coll-name">Nama</Label>
                        <Input id="coll-name" value={collectionName} onChange={(e) => setCollectionName(e.target.value)} placeholder="mis. Foodie campaign" />
                    </div>
                    <div>
                        <Label htmlFor="coll-tags">Hashtag (pisahkan dengan koma)</Label>
                        <Input id="coll-tags" value={collectionTags} onChange={(e) => setCollectionTags(e.target.value)} placeholder="kuliner, makan, foodie" />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setCollectionOpen(false)}>Batal</Button>
                        <Button size="sm" onClick={saveCollection}>Simpan</Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
