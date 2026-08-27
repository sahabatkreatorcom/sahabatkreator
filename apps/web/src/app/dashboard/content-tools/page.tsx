"use client";

import {
  FolderTree,
  Hash,
  LayoutTemplate,
  Link2,
  Music,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Tab =
  | "pillars"
  | "templates"
  | "hashtags"
  | "tiktok-music"
  | "shopee"
  | "link-metadata";

const COLOR_OPTIONS = [
  "#D4A574",
  "#7C9A6E",
  "#5B7C99",
  "#A06E8C",
  "#C08B4C",
  "#6E8CA0",
  "#8C6E5B",
  "#B5A66E",
  "#E07B7B",
  "#7BB5E0",
  "#B5E07B",
  "#E0B57B",
];

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
  const [pillarSaving, setPillarSaving] = useState(false);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateEdit, setTemplateEdit] = useState<CaptionTemplate | null>(
    null,
  );
  const [templateName, setTemplateName] = useState("");
  const [templateCaption, setTemplateCaption] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [templateHashtags, setTemplateHashtags] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionEdit, setCollectionEdit] =
    useState<HashtagCollection | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionTags, setCollectionTags] = useState("");
  const [collectionSaving, setCollectionSaving] = useState(false);

  const [tiktokMusic, setTiktokMusic] = useState<
    Array<{
      id: string;
      title: string;
      artist: string;
      usageCount: number;
      trendScore: number;
    }>
  >([]);
  const [tiktokSearch, setTiktokSearch] = useState("");
  const [tiktokLoading, setTiktokLoading] = useState(false);

  const [shopeeProducts, setShopeeProducts] = useState<
    Array<{
      itemId: string;
      name: string;
      price: number;
      priceFormatted: string;
      image: string;
      rating: number;
      sold: number;
    }>
  >([]);
  const [shopeeSearch, setShopeeSearch] = useState("");
  const [shopeeLoading, setShopeeLoading] = useState(false);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkMetadata, setLinkMetadata] = useState<{
    title: string;
    description: string;
    image?: string;
    siteName?: string;
  } | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

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
    setPillarSaving(true);
    setError(null);
    try {
      if (pillarEdit) {
        await api(`/api/pillars/${pillarEdit.id}`, "PATCH", {
          name: pillarName,
          description: pillarDesc || null,
          color: pillarColor,
        });
      } else {
        await api("/api/pillars", "POST", {
          name: pillarName,
          description: pillarDesc || null,
          color: pillarColor,
        });
      }
      setPillarOpen(false);
      setPillarEdit(null);
      setPillarName("");
      setPillarDesc("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan pilar.");
    } finally {
      setPillarSaving(false);
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
    setTemplateSaving(true);
    setError(null);
    try {
      const hashtags = templateHashtags
        .split(",")
        .map((h) => h.trim().replace(/^#/, ""))
        .filter(Boolean);
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
    } finally {
      setTemplateSaving(false);
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
    setCollectionSaving(true);
    setError(null);
    try {
      const hashtags = collectionTags
        .split(",")
        .map((h) => h.trim().replace(/^#/, ""))
        .filter(Boolean);
      const body = { name: collectionName, hashtags };
      if (collectionEdit) {
        await api(
          `/api/hashtag-collections/${collectionEdit.id}`,
          "PATCH",
          body,
        );
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
    } finally {
      setCollectionSaving(false);
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

  // ── TikTok Music ──
  async function searchTiktokMusic() {
    if (!tiktokSearch.trim()) return;
    setTiktokLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/content-tools/tiktok-music?action=search&q=${encodeURIComponent(tiktokSearch)}`,
      );
      const data = await res.json();
      setTiktokMusic(data.music ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencari musik.");
    } finally {
      setTiktokLoading(false);
    }
  }

  async function loadTrendingMusic() {
    setTiktokLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/content-tools/tiktok-music?action=trending&region=ID&limit=20",
      );
      const data = await res.json();
      setTiktokMusic(data.music ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat trending music.");
    } finally {
      setTiktokLoading(false);
    }
  }

  // ── Shopee ──
  async function searchShopeeProducts() {
    if (!shopeeSearch.trim()) return;
    setShopeeLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/content-tools/shopee?action=search&q=${encodeURIComponent(shopeeSearch)}`,
      );
      const data = await res.json();
      setShopeeProducts(data.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencari produk.");
    } finally {
      setShopeeLoading(false);
    }
  }

  // ── Link Metadata ──
  async function fetchLinkMetadata() {
    if (!linkUrl.trim()) return;
    setLinkLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/content-tools/link-metadata?action=metadata&url=${encodeURIComponent(linkUrl)}`,
      );
      const data = await res.json();
      setLinkMetadata(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil metadata.");
    } finally {
      setLinkLoading(false);
    }
  }

  const TAB_BUTTONS: { value: Tab; label: string; icon: React.ReactNode }[] = [
    {
      value: "pillars",
      label: "Pilar konten",
      icon: <FolderTree className="h-4 w-4" />,
    },
    {
      value: "templates",
      label: "Template caption",
      icon: <LayoutTemplate className="h-4 w-4" />,
    },
    {
      value: "hashtags",
      label: "Koleksi hashtag",
      icon: <Hash className="h-4 w-4" />,
    },
    {
      value: "tiktok-music",
      label: "TikTok Music",
      icon: <Music className="h-4 w-4" />,
    },
    {
      value: "shopee",
      label: "Shopee",
      icon: <ShoppingBag className="h-4 w-4" />,
    },
    {
      value: "link-metadata",
      label: "Link Preview",
      icon: <Link2 className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Content tools</h1>
          <p className="text-sm text-muted-foreground">
            Pilar konten, template caption, dan koleksi hashtag untuk
            mempercepat pembuatan post.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (tab === "pillars") {
              setPillarEdit(null);
              setPillarName("");
              setPillarDesc("");
              setPillarColor(COLOR_OPTIONS[0]);
              setPillarOpen(true);
            } else if (tab === "templates") {
              setTemplateEdit(null);
              setTemplateName("");
              setTemplateCaption("");
              setTemplateCategory("");
              setTemplateHashtags("");
              setTemplateOpen(true);
            } else {
              setCollectionEdit(null);
              setCollectionName("");
              setCollectionTags("");
              setCollectionOpen(true);
            }
          }}
        >
          <Plus className="h-4 w-4" />
          Tambah
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TAB_BUTTONS.map((b) => (
          <Button
            key={b.value}
            type="button"
            onClick={() => setTab(b.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              tab === b.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {b.icon}
            {b.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-sm text-muted-foreground">Memuat…</p>
      ) : tab === "tiktok-music" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={tiktokSearch}
              onChange={(e) => setTiktokSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchTiktokMusic()}
              placeholder="Cari musik TikTok..."
            />
            <Button
              size="sm"
              onClick={searchTiktokMusic}
              loading={tiktokLoading}
            >
              Cari
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={loadTrendingMusic}
              loading={tiktokLoading}
            >
              Trending
            </Button>
          </div>
          {tiktokMusic.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cari musik atau lihat trending untuk memulai.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tiktokMusic.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{m.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {m.artist}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {m.trendScore}%
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {m.usageCount.toLocaleString()} video
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "shopee" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={shopeeSearch}
              onChange={(e) => setShopeeSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchShopeeProducts()}
              placeholder="Cari produk Shopee..."
            />
            <Button
              size="sm"
              onClick={searchShopeeProducts}
              loading={shopeeLoading}
            >
              Cari
            </Button>
          </div>
          {shopeeProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cari produk untuk memulai.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shopeeProducts.map((p) => (
                <div
                  key={p.itemId}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-16 w-16 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium line-clamp-2">{p.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-primary">
                        {p.priceFormatted}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>⭐ {p.rating}</span>
                        <span>•</span>
                        <span>{p.sold} terjual</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "link-metadata" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLinkMetadata()}
              placeholder="Masukkan URL untuk preview..."
            />
            <Button size="sm" onClick={fetchLinkMetadata} loading={linkLoading}>
              Preview
            </Button>
          </div>
          {linkMetadata && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-4">
                {linkMetadata.image && (
                  <img
                    src={linkMetadata.image}
                    alt={linkMetadata.title}
                    className="h-24 w-24 rounded object-cover"
                  />
                )}
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">
                    {linkMetadata.siteName}
                  </p>
                  <h3 className="font-medium">{linkMetadata.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {linkMetadata.description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : tab === "pillars" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              Belum ada pilar konten. Buat yang pertama.
            </p>
          )}
          {pillars.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{ background: p.color }}
                  />
                  <h3 className="font-medium">{p.name}</h3>
                </div>
                <div className="flex gap-1">
                  <Button
                    onClick={() => {
                      setPillarEdit(p);
                      setPillarName(p.name);
                      setPillarDesc(p.description ?? "");
                      setPillarColor(p.color);
                      setPillarOpen(true);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    onClick={() => removePillar(p)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {p.description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {p.description}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : tab === "templates" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              Belum ada template caption.
            </p>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex flex-col rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{t.name}</h3>
                  {t.category && (
                    <span className="text-xs text-muted-foreground">
                      {t.category}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    onClick={() => {
                      setTemplateEdit(t);
                      setTemplateName(t.name);
                      setTemplateCaption(t.caption);
                      setTemplateCategory(t.category ?? "");
                      setTemplateHashtags(t.hashtags.join(", "));
                      setTemplateOpen(true);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    onClick={() => removeTemplate(t)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {t.caption}
              </p>
              {t.hashtags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.hashtags.slice(0, 6).map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      #{h}
                    </span>
                  ))}
                  {t.hashtags.length > 6 && (
                    <span className="text-xs text-muted-foreground">
                      +{t.hashtags.length - 6}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              Belum ada koleksi hashtag.
            </p>
          )}
          {collections.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{c.name}</h3>
                <div className="flex gap-1">
                  <Button
                    onClick={() => {
                      setCollectionEdit(c);
                      setCollectionName(c.name);
                      setCollectionTags(c.hashtags.join(", "));
                      setCollectionOpen(true);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    onClick={() => removeCollection(c)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    #{h}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog pilar */}
      <Dialog
        open={pillarOpen}
        onClose={() => setPillarOpen(false)}
        title={pillarEdit ? "Ubah pilar" : "Pilar baru"}
      >
        <div className="space-y-3">
          {error && (
            <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
              {error}
            </p>
          )}
          <div>
            <Label htmlFor="pillar-name">Nama</Label>
            <Input
              id="pillar-name"
              value={pillarName}
              onChange={(e) => setPillarName(e.target.value)}
              placeholder="mis. Edukasi"
            />
          </div>
          <div>
            <Label htmlFor="pillar-desc">Deskripsi</Label>
            <Input
              id="pillar-desc"
              value={pillarDesc}
              onChange={(e) => setPillarDesc(e.target.value)}
              placeholder="opsional"
            />
          </div>
          <div>
            <Label>Warna</Label>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {COLOR_OPTIONS.map((c) => (
                <Button
                  key={c}
                  type="button"
                  onClick={() => setPillarColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-md border-2 transition-all",
                    pillarColor === c
                      ? "border-primary scale-110 ring-2 ring-primary/30"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPillarOpen(false)}
            >
              Batal
            </Button>
            <Button size="sm" onClick={savePillar} loading={pillarSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Dialog template */}
      <Dialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title={templateEdit ? "Ubah template" : "Template caption baru"}
      >
        <div className="space-y-3">
          {error && (
            <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
              {error}
            </p>
          )}
          <div>
            <Label htmlFor="tmpl-name">Nama</Label>
            <Input
              id="tmpl-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="mis. Promo produk baru"
            />
          </div>
          <div>
            <Label htmlFor="tmpl-cat">Kategori</Label>
            <Input
              id="tmpl-cat"
              value={templateCategory}
              onChange={(e) => setTemplateCategory(e.target.value)}
              placeholder="mis. Promosi"
            />
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
            <Input
              id="tmpl-tags"
              value={templateHashtags}
              onChange={(e) => setTemplateHashtags(e.target.value)}
              placeholder="kuliner, promo, baru"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTemplateOpen(false)}
            >
              Batal
            </Button>
            <Button size="sm" onClick={saveTemplate} loading={templateSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Dialog koleksi hashtag */}
      <Dialog
        open={collectionOpen}
        onClose={() => setCollectionOpen(false)}
        title={collectionEdit ? "Ubah koleksi" : "Koleksi hashtag baru"}
      >
        <div className="space-y-3">
          {error && (
            <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
              {error}
            </p>
          )}
          <div>
            <Label htmlFor="coll-name">Nama</Label>
            <Input
              id="coll-name"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              placeholder="mis. Foodie campaign"
            />
          </div>
          <div>
            <Label htmlFor="coll-tags">Hashtag (pisahkan dengan koma)</Label>
            <Input
              id="coll-tags"
              value={collectionTags}
              onChange={(e) => setCollectionTags(e.target.value)}
              placeholder="kuliner, makan, foodie"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollectionOpen(false)}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={saveCollection}
              loading={collectionSaving}
            >
              Simpan
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
