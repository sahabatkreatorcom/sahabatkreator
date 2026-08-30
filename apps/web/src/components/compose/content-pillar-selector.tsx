"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ContentPillar {
    id: string;
    name: string;
    description?: string | null;
    color: string;
    icon?: string | null;
    posts?: number;
    percentage?: number;
}

export interface HashtagCollection {
    id: string;
    name: string;
    hashtags: string[];
    usageCount?: number;
}

interface PillarSelectorProps {
    value?: string | null;
    onChange?: (id: string | null) => void;
}

export function PillarSelector({ value, onChange }: PillarSelectorProps) {
    const [pillars, setPillars] = useState<ContentPillar[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newColor] = useState("#6366F1");

    useEffect(() => {
        fetch("/api/content-pillars")
            .then((r) => r.json())
            .then((data) => {
                if (data.pillars) setPillars(data.pillars);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleCreate = useCallback(async () => {
        if (!newName.trim()) return;
        const res = await fetch("/api/content-pillars", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName.trim(), color: newColor }),
        });
        const data = await res.json();
        if (data.pillar && onChange) {
            setPillars((prev) => [...prev, data.pillar]);
            onChange(data.pillar.id);
            setShowCreate(false);
            setNewName("");
        }
    }, [newName, newColor, onChange]);

    if (loading) return <div className="text-xs text-muted-foreground">Memuat pilar...</div>;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => onChange?.(null)}
                    className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                        !value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                >
                    {!value && <Check className="h-3 w-3" />}
                    Tanpa pilar
                </button>
                {pillars.map((p) => (
                    <button
                        key={p.id}
                        onClick={() => onChange?.(p.id)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                            value === p.id ? "text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                        style={value === p.id ? { background: p.color } : {}}
                    >
                        {value === p.id && <Check className="h-3 w-3" />}
                        {p.name}
                        {p.percentage !== undefined && <span className="text-[10px] opacity-70">{p.percentage}%</span>}
                    </button>
                ))}
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
                >
                    <Plus className="h-3 w-3" /> Baru
                </button>
            </div>
            {showCreate && (
                <div className="flex gap-2">
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nama pilar..."
                        className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                    <button onClick={handleCreate} className="rounded-md bg-primary px-2.5 py-1.5 text-xs text-white hover:bg-primary/90">Simpan</button>
                    <button onClick={() => setShowCreate(false)} className="rounded-md bg-muted px-2.5 py-1.5 text-xs hover:bg-muted/80"><X className="h-4 w-4" /></button>
                </div>
            )}
        </div>
    );
}

interface HashtagCollectionSelectorProps {
    value?: string[];
    onChange: (ids: string[]) => void;
}

export function HashtagCollectionSelector({ value = [], onChange }: HashtagCollectionSelectorProps) {
    const [collections, setCollections] = useState<HashtagCollection[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newTags, setNewTags] = useState("");

    useEffect(() => {
        fetch("/api/hashtag-collections")
            .then((r) => r.json())
            .then((data) => {
                if (data.collections) setCollections(data.collections);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleCreate = useCallback(async () => {
        if (!newName.trim() || !newTags.trim()) return;
        const hashtags = newTags.split(",").map((t) => t.trim()).filter(Boolean);
        if (!hashtags.length) return;
        const res = await fetch("/api/hashtag-collections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName.trim(), hashtags }),
        });
        const data = await res.json();
        if (data.collection) {
            setCollections((prev) => [...prev, data.collection]);
            onChange([...value, data.collection.id]);
            setShowCreate(false);
            setNewName("");
            setNewTags("");
        }
    }, [newName, newTags, value, onChange]);

    const toggle = (id: string) => {
        const next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
        onChange(next);
    };

    if (loading) return <div className="text-xs text-muted-foreground">Memuat koleksi...</div>;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => onChange?.([])}
                    className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                        value.length === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                >
                    {value.length === 0 && <Check className="h-3 w-3" />}
                    Tanpa koleksi
                </button>
                {collections.map((c) => (
                    <button
                        key={c.id}
                        onClick={() => toggle(c.id)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                            value.includes(c.id) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                    >
                        {value.includes(c.id) && <Check className="h-3 w-3" />}
                        {c.name}
                        {c.hashtags.length > 0 && <span className="text-[10px] opacity-70">{c.hashtags.length} tags</span>}
                    </button>
                ))}
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
                >
                    <Plus className="h-3 w-3" /> Baru
                </button>
            </div>
            {showCreate && (
                <div className="space-y-2">
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nama koleksi..."
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        autoFocus
                    />
                    <input
                        value={newTags}
                        onChange={(e) => setNewTags(e.target.value)}
                        placeholder="Hashtag, dipisah koma (misal: fashion,style,ootd)"
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="flex gap-2">
                        <button onClick={handleCreate} className="rounded-md bg-primary px-2.5 py-1.5 text-xs text-white hover:bg-primary/90">Simpan</button>
                        <button onClick={() => setShowCreate(false)} className="rounded-md bg-muted px-2.5 py-1.5 text-xs hover:bg-muted/80">Batal</button>
                    </div>
                </div>
            )}
        </div>
    );
}
