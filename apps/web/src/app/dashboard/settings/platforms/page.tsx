"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, CheckCircle2, Zap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function PlatformSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [replizEnabled, setReplizEnabled] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/admin/platforms");
                if (res.ok) {
                    const data = await res.json();
                    setReplizEnabled(data.replizOauthEnabled ?? false);
                }
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch("/api/admin/platforms", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ replizOauthEnabled: replizEnabled }),
            });
            if (res.ok) setSaved(true);
        } finally {
            setSaving(false);
        }
    }, [replizEnabled]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold">Platform</h1>
                <p className="text-sm text-muted-foreground">
                    Kelola koneksi OAuth dan integrasi platform media sosial.
                </p>
            </div>

            {/* Repliz OAuth Proxy */}
            <div className="rounded-lg border p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                        <Zap className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Repliz OAuth Proxy</h2>
                        <p className="text-sm text-muted-foreground">
                            Kelola semua token OAuth melalui Repliz
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <Label className="text-base">Aktifkan Repliz OAuth</Label>
                            <p className="text-sm text-muted-foreground">
                                Semua koneksi akun sosial akan menggunakan Repliz sebagai proxy OAuth.
                                Token disimpan di Repliz, bukan di server lokal.
                            </p>
                        </div>
                        <Switch
                            checked={replizEnabled}
                            onCheckedChange={setReplizEnabled}
                        />
                    </div>

                    {replizEnabled && (
                        <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-4">
                            <h3 className="text-sm font-medium text-purple-700 dark:text-purple-400 mb-2">
                                Repliz OAuth aktif
                            </h3>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                <li>Token disimpan di Repliz (bukan di database lokal)</li>
                                <li>Publication menggunakan Repliz API</li>
                                <li>Comment & DM automation aktif</li>
                                <li>Analytics data diambil dari Repliz</li>
                            </ul>
                            <a
                                href="https://repliz.com/dashboard"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-3 text-sm text-purple-600 hover:underline"
                            >
                                Buka Repliz Dashboard
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                    )}

                    {!replizEnabled && (
                        <div className="rounded-lg bg-muted p-4">
                            <h3 className="text-sm font-medium mb-2">
                                Mode: Native OAuth
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Token disimpan di server lokal. Setiap platform membutuhkan
                                OAuth credentials sendiri (Client ID & Secret).
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : saved ? (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    {saved ? "Tersimpan" : "Simpan"}
                </Button>
                {saved && (
                    <span className="text-sm text-green-600">Pengaturan tersimpan!</span>
                )}
            </div>
        </div>
    );
}
