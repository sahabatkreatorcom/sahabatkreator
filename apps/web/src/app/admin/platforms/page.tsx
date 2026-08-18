"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface PlatformCredential {
    platform: string;
    label: string;
    connectable: boolean;
    clientId: string | null;
    clientSecretConfigured: boolean;
    webhookVerifyToken: string | null;
    isConfigured: boolean;
    updatedAt: string | null;
}

interface PlatformForm {
    clientId: string;
    clientSecret: string;
    webhookVerifyToken: string;
    enabled: boolean;
}

export default function AdminPlatformCredentialsPage() {
    const [platforms, setPlatforms] = useState<PlatformCredential[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [forms, setForms] = useState<Record<string, PlatformForm>>({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/platform-credentials");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat data");
            const list = data.platforms ?? [];
            setPlatforms(list);
            const next: Record<string, PlatformForm> = {};
            for (const p of list) {
                next[p.platform] = {
                    clientId: p.clientId ?? "",
                    clientSecret: "",
                    webhookVerifyToken: p.webhookVerifyToken ?? "",
                    enabled: p.isConfigured,
                };
            }
            setForms(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const updateForm = (platform: string, patch: Partial<PlatformForm>) => {
        setForms((prev) => ({ ...prev, [platform]: { ...prev[platform], ...patch } }));
    };

    const save = async (platform: string) => {
        const form = forms[platform];
        if (!form) return;
        setSaving(platform);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch("/api/admin/platform-credentials", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    platform,
                    clientId: form.clientId.trim() || undefined,
                    clientSecret: form.clientSecret.trim() || undefined,
                    webhookVerifyToken: form.webhookVerifyToken.trim() || undefined,
                    enabled: form.enabled,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
            setMessage(`Kredensial ${platform} disimpan.`);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan");
        } finally {
            setSaving(null);
        }
    };

    if (loading && !platforms.length) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat kredensial platform...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Kredensial Platform</h1>
                    <p className="text-sm text-muted-foreground">
                        Client ID &amp; secret OAuth global untuk koneksi akun + verifikasi webhook. Nilai kosong dipertahankan.
                    </p>
                </div>
                <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {message && (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{message}</p>
            )}
            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="grid gap-4 md:grid-cols-2">
                {platforms.map((p) => {
                    const form = forms[p.platform];
                    if (!form) return null;
                    return (
                        <Card key={p.platform}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{p.label}</span>
                                    {p.isConfigured ? (
                                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                            Aktif
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                            Nonaktif
                                        </span>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    {p.connectable ? "OAuth connect + webhook" : "Webhook (via kredensial induk)"}
                                    {p.updatedAt
                                        ? ` · Diubah ${new Date(p.updatedAt).toLocaleDateString("id-ID")}`
                                        : " · Belum dikonfigurasi"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <Label htmlFor={`client-id-${p.platform}`}>Client ID</Label>
                                    <Input
                                        id={`client-id-${p.platform}`}
                                        value={form.clientId}
                                        onChange={(e) => updateForm(p.platform, { clientId: e.target.value })}
                                        placeholder="App ID / Client ID"
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor={`client-secret-${p.platform}`}>
                                        Client Secret{" "}
                                        {p.clientSecretConfigured && (
                                            <span className="text-xs text-muted-foreground">(tersimpan — kosongkan bila tidak diganti)</span>
                                        )}
                                    </Label>
                                    <Input
                                        id={`client-secret-${p.platform}`}
                                        type="password"
                                        value={form.clientSecret}
                                        onChange={(e) => updateForm(p.platform, { clientSecret: e.target.value })}
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor={`verify-token-${p.platform}`}>Webhook Verify Token</Label>
                                    <Input
                                        id={`verify-token-${p.platform}`}
                                        value={form.webhookVerifyToken}
                                        onChange={(e) => updateForm(p.platform, { webhookVerifyToken: e.target.value })}
                                        placeholder="Verify token handshake (Meta / YouTube)"
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={form.enabled}
                                            onCheckedChange={(v) => updateForm(p.platform, { enabled: v })}
                                            id={`enabled-${p.platform}`}
                                        />
                                        <Label htmlFor={`enabled-${p.platform}`} className="mb-0 text-sm text-muted-foreground">
                                            Gunakan kredensial ini
                                        </Label>
                                    </div>
                                    <Button size="sm" onClick={() => save(p.platform)} disabled={saving === p.platform}>
                                        {saving === p.platform ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Save className="h-4 w-4" />
                                        )}
                                        Simpan
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}