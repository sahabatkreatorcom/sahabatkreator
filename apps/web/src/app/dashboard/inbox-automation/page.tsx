"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { MessageSquareReply, Pencil, Plus, Zap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

interface SavedResponse {
    id: string;
    name: string;
    content: string;
    shortcut: string | null;
    category: string | null;
    usageCount: number;
    createdAt: string;
}

interface Automation {
    id: string;
    name: string;
    platform: Platform;
    keywords: string[];
    message: string;
    isActive: boolean;
    triggered: number;
    delivered: number;
    createdAt: string;
}

type Tab = "responses" | "automations";

const PLATFORM_OPTIONS: Platform[] = ["INSTAGRAM", "INSTAGRAM_PAGE", "FACEBOOK", "TIKTOK", "YOUTUBE", "THREADS"];

export default function InboxAutomationPage() {
    const [tab, setTab] = useState<Tab>("responses");

    const [responses, setResponses] = useState<SavedResponse[]>([]);
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [responseOpen, setResponseOpen] = useState(false);
    const [responseEdit, setResponseEdit] = useState<SavedResponse | null>(null);
    const [responseName, setResponseName] = useState("");
    const [responseContent, setResponseContent] = useState("");
    const [responseShortcut, setResponseShortcut] = useState("");
    const [responseCategory, setResponseCategory] = useState("");

    const [autoOpen, setAutoOpen] = useState(false);
    const [autoEdit, setAutoEdit] = useState<Automation | null>(null);
    const [autoName, setAutoName] = useState("");
    const [autoPlatform, setAutoPlatform] = useState<Platform>("INSTAGRAM");
    const [autoKeywords, setAutoKeywords] = useState("");
    const [autoMessage, setAutoMessage] = useState("");
    const [autoActive, setAutoActive] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [r, a] = await Promise.all([
                fetch("/api/saved-responses").then((res) => res.json()),
                fetch("/api/automations").then((res) => res.json()),
            ]);
            setResponses(r.responses ?? []);
            setAutomations(a.automations ?? []);
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

    // ── Saved responses ──
    async function saveResponse() {
        if (!responseName.trim() || !responseContent.trim()) return;
        try {
            setError(null);
            const body = {
                name: responseName,
                content: responseContent,
                shortcut: responseShortcut || undefined,
                category: responseCategory || undefined,
            };
            if (responseEdit) {
                await api(`/api/saved-responses/${responseEdit.id}`, "PATCH", body);
            } else {
                await api("/api/saved-responses", "POST", body);
            }
            setResponseOpen(false);
            setResponseEdit(null);
            resetResponseForm();
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan balasan.");
        }
    }

    function resetResponseForm() {
        setResponseName("");
        setResponseContent("");
        setResponseShortcut("");
        setResponseCategory("");
    }

    async function removeResponse(r: SavedResponse) {
        if (!confirm(`Hapus balasan "${r.name}"?`)) return;
        try {
            setError(null);
            await api(`/api/saved-responses/${r.id}`, "DELETE");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus.");
        }
    }

    // ── Automations ──
    async function saveAutomation() {
        if (!autoName.trim() || !autoMessage.trim() || !autoKeywords.trim()) return;
        try {
            setError(null);
            const keywords = autoKeywords.split(",").map((k) => k.trim()).filter(Boolean);
            const body = { name: autoName, platform: autoPlatform, keywords, message: autoMessage, isActive: autoActive };
            if (autoEdit) {
                await api(`/api/automations/${autoEdit.id}`, "PATCH", body);
            } else {
                await api("/api/automations", "POST", body);
            }
            setAutoOpen(false);
            setAutoEdit(null);
            resetAutoForm();
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan automation.");
        }
    }

    function resetAutoForm() {
        setAutoName("");
        setAutoPlatform("INSTAGRAM");
        setAutoKeywords("");
        setAutoMessage("");
        setAutoActive(true);
    }

    async function removeAutomation(a: Automation) {
        if (!confirm(`Hapus automation "${a.name}"?`)) return;
        try {
            setError(null);
            await api(`/api/automations/${a.id}`, "DELETE");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus.");
        }
    }

    async function toggleAutomation(a: Automation) {
        try {
            setError(null);
            await api(`/api/automations/${a.id}`, "PATCH", { isActive: !a.isActive });
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal mengubah status.");
        }
    }

    const TAB_BUTTONS: { value: Tab; label: string; icon: React.ReactNode }[] = [
        { value: "responses", label: "Balasan siap pakai", icon: <MessageSquareReply className="h-4 w-4" /> },
        { value: "automations", label: "Automation", icon: <Zap className="h-4 w-4" /> },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Automasi inbox</h1>
                    <p className="text-sm text-muted-foreground">Balasan siap pakai dan auto-reply otomatis untuk komentar.</p>
                </div>
                <Button
                    size="sm"
                    onClick={() => {
                        if (tab === "responses") {
                            setResponseEdit(null);
                            resetResponseForm();
                            setResponseOpen(true);
                        } else {
                            setAutoEdit(null);
                            resetAutoForm();
                            setAutoOpen(true);
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
            ) : tab === "responses" ? (
                <div className="space-y-2">
                    {responses.length === 0 && <p className="text-sm text-muted-foreground">Belum ada balasan siap pakai.</p>}
                    {responses.map((r) => (
                        <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{r.name}</span>
                                    {r.category && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{r.category}</span>}
                                    {r.shortcut && <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{r.shortcut}</code>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">{r.usageCount}× dipakai</span>
                                    <button
                                        onClick={() => {
                                            setResponseEdit(r);
                                            setResponseName(r.name);
                                            setResponseContent(r.content);
                                            setResponseShortcut(r.shortcut ?? "");
                                            setResponseCategory(r.category ?? "");
                                            setResponseOpen(true);
                                        }}
                                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => removeResponse(r)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{r.content}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {automations.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            Belum ada automation. Automation membalas otomatis komentar yang mengandung keyword tertentu.
                        </p>
                    )}
                    {automations.map((a) => (
                        <div key={a.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={cn("font-medium", !a.isActive && "text-muted-foreground line-through")}>{a.name}</span>
                                    <span
                                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                        style={{ background: PLATFORM_COLORS[a.platform] }}
                                    >
                                        {PLATFORM_LABELS[a.platform]}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {a.triggered}× dipicu · {a.delivered}× terkirim
                                    </span>
                                    <Button variant={a.isActive ? "secondary" : "ghost"} size="sm" onClick={() => toggleAutomation(a)}>
                                        {a.isActive ? "Aktif" : "Nonaktif"}
                                    </Button>
                                    <button
                                        onClick={() => {
                                            setAutoEdit(a);
                                            setAutoName(a.name);
                                            setAutoPlatform(a.platform);
                                            setAutoKeywords(a.keywords.join(", "));
                                            setAutoMessage(a.message);
                                            setAutoActive(a.isActive);
                                            setAutoOpen(true);
                                        }}
                                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => removeAutomation(a)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {a.keywords.map((k) => (
                                    <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{k}</span>
                                ))}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{a.message}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Dialog balasan siap pakai */}
            <Dialog open={responseOpen} onClose={() => setResponseOpen(false)} title={responseEdit ? "Ubah balasan" : "Balasan siap pakai baru"}>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="resp-name">Nama</Label>
                        <Input id="resp-name" value={responseName} onChange={(e) => setResponseName(e.target.value)} placeholder="mis. Terima kasih" />
                    </div>
                    <div>
                        <Label htmlFor="resp-shortcut">Shortcut (opsional, mulai dengan /)</Label>
                        <Input id="resp-shortcut" value={responseShortcut} onChange={(e) => setResponseShortcut(e.target.value)} placeholder="/thanks" />
                    </div>
                    <div>
                        <Label htmlFor="resp-cat">Kategori (opsional)</Label>
                        <Input id="resp-cat" value={responseCategory} onChange={(e) => setResponseCategory(e.target.value)} placeholder="mis. Umum" />
                    </div>
                    <div>
                        <Label htmlFor="resp-content">Isi balasan</Label>
                        <textarea
                            id="resp-content"
                            value={responseContent}
                            onChange={(e) => setResponseContent(e.target.value)}
                            rows={4}
                            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                            placeholder="Tulis balasan…"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setResponseOpen(false)}>Batal</Button>
                        <Button size="sm" onClick={saveResponse}>Simpan</Button>
                    </div>
                </div>
            </Dialog>

            {/* Dialog automation */}
            <Dialog open={autoOpen} onClose={() => setAutoOpen(false)} title={autoEdit ? "Ubah automation" : "Automation baru"}>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="auto-name">Nama</Label>
                        <Input id="auto-name" value={autoName} onChange={(e) => setAutoName(e.target.value)} placeholder="mis. Balas 'promo'" />
                    </div>
                    <div>
                        <Label htmlFor="auto-platform">Platform</Label>
                        <select
                            id="auto-platform"
                            value={autoPlatform}
                            onChange={(e) => setAutoPlatform(e.target.value as Platform)}
                            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                        >
                            {PLATFORM_OPTIONS.map((p) => (
                                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <Label htmlFor="auto-keywords">Keyword (pisahkan dengan koma)</Label>
                        <Input id="auto-keywords" value={autoKeywords} onChange={(e) => setAutoKeywords(e.target.value)} placeholder="promo, diskon, harga" />
                        <p className="pt-1 text-xs text-muted-foreground">Komentar yang mengandung salah satu keyword akan otomatis dibalas.</p>
                    </div>
                    <div>
                        <Label htmlFor="auto-message">Pesan balasan</Label>
                        <textarea
                            id="auto-message"
                            value={autoMessage}
                            onChange={(e) => setAutoMessage(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                            placeholder="Tulis pesan auto-reply…"
                        />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={autoActive} onChange={(e) => setAutoActive(e.target.checked)} className="accent-primary" />
                        Aktif
                    </label>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setAutoOpen(false)}>Batal</Button>
                        <Button size="sm" onClick={saveAutomation}>Simpan</Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
