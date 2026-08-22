"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    Plus,
    Trash2,
    Edit2,
    Tag,
    Palette,
    FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Pillar {
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string | null;
    posts: number;
    percentage: number;
    createdAt: string;
}

const COLOR_OPTIONS = [
    "#D4A574", "#7C9A6E", "#5B7C99", "#A06E8C",
    "#C08B4C", "#6E8CA0", "#8C6E5B", "#B5A66E",
    "#E07B7B", "#7BB5E0", "#B5E07B", "#E0B57B",
];

export default function PillarsPage() {
    const [pillars, setPillars] = useState<Pillar[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Form states
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [color, setColor] = useState("#D4A574");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/pillars");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat pilar.");
            setPillars(json.pillars);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat pilar.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/pillars", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, color }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal membuat pilar.");
            setName("");
            setDescription("");
            setColor("#D4A574");
            setCreateOpen(false);
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal membuat pilar.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Yakin ingin menghapus pilar ini?")) return;
        setError(null);
        try {
            const res = await fetch(`/api/pillars?id=${encodeURIComponent(id)}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal menghapus pilar.");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus pilar.");
        }
    }

    const totalPosts = pillars.reduce((sum, p) => sum + (Number(p.posts) || 0), 0);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Content Pillars</h1>
                    <p className="text-sm text-muted-foreground">
                        Organisir strategi konten berdasarkan pilar.
                    </p>
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Tambah Pilar
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-12 text-sm text-muted-foreground">Memuat pilar…</p>
            ) : pillars.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                    <Tag className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm font-medium">Belum ada pilar konten</p>
                    <p className="text-sm text-muted-foreground">
                        Buat pilar untuk mengorganisir strategi konten Anda.
                    </p>
                    <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Buat Pilar Pertama
                    </Button>
                </div>
            ) : (
                <>
                    {/* Summary */}
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">Total Pilar</p>
                            <p className="mt-1 text-2xl font-semibold">{pillars.length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">Total Postingan</p>
                            <p className="mt-1 text-2xl font-semibold">{totalPosts}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">Rata-rata</p>
                            <p className="mt-1 text-2xl font-semibold">
                                {pillars.length > 0 ? Math.round(totalPosts / pillars.length) : 0}
                            </p>
                        </div>
                    </div>

                    {/* Pillar Grid */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {pillars.map((pillar) => (
                            <div
                                key={pillar.id}
                                className="rounded-lg border border-border bg-card p-4"
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                                        style={{ background: pillar.color }}
                                    >
                                        <Tag className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{pillar.name}</p>
                                        {pillar.description && (
                                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                                {pillar.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <FileText className="h-3 w-3" />
                                        <span>{pillar.posts} postingan</span>
                                    </div>
                                    {pillar.percentage > 0 && (
                                        <span className="text-xs font-medium">{pillar.percentage}%</span>
                                    )}
                                </div>

                                <div className="mt-3 flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 flex-1 text-xs"
                                        onClick={() => setEditingId(pillar.id)}
                                    >
                                        <Edit2 className="h-3 w-3" />
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-accent-red hover:bg-accent-red/10"
                                        onClick={() => handleDelete(pillar.id)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Create Dialog */}
            <Dialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Tambah Pilar Baru"
                description="Buat pilar konten baru untuk mengorganisir strategi."
            >
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <Label htmlFor="pillar-name">Nama Pilar</Label>
                        <Input
                            id="pillar-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Contoh: Edukasi, Hiburan, Promosi"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="pillar-desc">Deskripsi (opsional)</Label>
                        <Textarea
                            id="pillar-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Deskripsikan pilar ini..."
                            rows={3}
                        />
                    </div>
                    <div>
                        <Label>Warna</Label>
                        <div className="mt-2 grid grid-cols-8 gap-2">
                            {COLOR_OPTIONS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        "h-8 w-8 rounded-md border-2 transition-all",
                                        color === c ? "border-primary scale-110" : "border-transparent"
                                    )}
                                    style={{ background: c }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" disabled={saving || !name.trim()}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            Buat Pilar
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
}