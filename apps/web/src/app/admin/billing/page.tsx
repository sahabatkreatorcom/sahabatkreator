"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Wallet, CheckCircle2, Circle } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface BillingStats {
    totalRevenue: number;
    monthlyRevenue: number;
    activeSubscriptions: number;
    churnRate: number;
    revenueThisMonth: number;
    revenueLastMonth: number;
}

interface SumoPodSettings {
    sumopodConfigured: boolean;
    sumopodApiKeySet: boolean;
    sumopodApiSecretSet: boolean;
    sumopodWebhookSecretSet: boolean;
    sumopodWebhookTokenSet: boolean;
    sumopodBase: string;
    sumopodTrialDays: number;
    updatedAt: string | null;
}

export default function AdminBillingPage() {
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/billing/stats");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat statistik billing");
            setStats(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (loading && !stats) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat data billing...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Billing & Revenue</h1>
                    <p className="text-sm text-muted-foreground">Statistik pendapatan dan subscription</p>
                </div>
                <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Total Revenue"
                    value={`Rp ${(stats?.totalRevenue ?? 0).toLocaleString("id-ID")}`}
                    trend="up"
                />
                <StatCard
                    label="Revenue Bulan Ini"
                    value={`Rp ${(stats?.monthlyRevenue ?? 0).toLocaleString("id-ID")}`}
                    delta={`vs bulan lalu: Rp ${(stats?.revenueLastMonth ?? 0).toLocaleString("id-ID")}`}
                    trend="up"
                />
                <StatCard
                    label="Subscription Aktif"
                    value={String(stats?.activeSubscriptions ?? 0)}
                    trend="up"
                />
                <StatCard
                    label="Churn Rate"
                    value={`${stats?.churnRate ?? 0}%`}
                    trend="down"
                />
            </div>

            <SumoPodSettingsCard onSaved={load} />
        </div>
    );
}

function SumoPodSettingsCard({ onSaved }: { onSaved: () => void }) {
    const [settings, setSettings] = useState<SumoPodSettings | null>(null);
    const [apiKey, setApiKey] = useState("");
    const [apiSecret, setApiSecret] = useState("");
    const [webhookSecret, setWebhookSecret] = useState("");
    const [webhookToken, setWebhookToken] = useState("");
    const [base, setBase] = useState("");
    const [trialDays, setTrialDays] = useState("0");
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/sumo-pod");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat konfigurasi SumoPod");
            setSettings(data);
            setBase(data.sumopodBase);
            setTrialDays(String(data.sumopodTrialDays));
            setEnabled(data.sumopodConfigured);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const save = async () => {
        setSaving(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch("/api/admin/sumo-pod", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    apiKey: apiKey.trim() || undefined,
                    apiSecret: apiSecret.trim() || undefined,
                    webhookSecret: webhookSecret.trim() || undefined,
                    webhookToken: webhookToken.trim() || undefined,
                    base: base.trim() || undefined,
                    trialDays: trialDays.trim() !== "" ? Number(trialDays) : undefined,
                    enabled,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
            setMessage("Konfigurasi SumoPod Pay disimpan.");
            setApiKey("");
            setApiSecret("");
            setWebhookSecret("");
            setWebhookToken("");
            await load();
            onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-accent-green" />
                <h2 className="text-sm font-semibold">SumoPod Pay</h2>
                {settings?.sumopodConfigured ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Terkonfigurasi
                    </span>
                ) : (
                    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <Circle className="h-3 w-3" />
                        Nonaktif
                    </span>
                )}
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
                Konfigurasi payment gateway untuk checkout subscription (QRIS / VA / e-wallet). Secret disimpan
                terenkripsi. Kosongkan field untuk mempertahankan nilai lama.
            </p>

            {message && <p className="mb-3 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{message}</p>}
            {error && <p className="mb-3 rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading && !settings ? (
                <p className="py-6 text-sm text-muted-foreground">Memuat konfigurasi...</p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="sumopod-api-key">API Key {settings?.sumopodApiKeySet && <span className="text-xs text-muted-foreground">(tersimpan)</span>}</Label>
                        <Input
                            id="sumopod-api-key"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="X-Api-Key"
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="sumopod-api-secret">API Secret {settings?.sumopodApiSecretSet && <span className="text-xs text-muted-foreground">(tersimpan)</span>}</Label>
                        <Input
                            id="sumopod-api-secret"
                            type="password"
                            value={apiSecret}
                            onChange={(e) => setApiSecret(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="sumopod-webhook-secret">Webhook Secret (Svix) {settings?.sumopodWebhookSecretSet && <span className="text-xs text-muted-foreground">(tersimpan)</span>}</Label>
                        <Input
                            id="sumopod-webhook-secret"
                            type="password"
                            value={webhookSecret}
                            onChange={(e) => setWebhookSecret(e.target.value)}
                            placeholder="whsec_..."
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="sumopod-webhook-token">Webhook Token {settings?.sumopodWebhookTokenSet && <span className="text-xs text-muted-foreground">(tersimpan)</span>}</Label>
                        <Input
                            id="sumopod-webhook-token"
                            type="password"
                            value={webhookToken}
                            onChange={(e) => setWebhookToken(e.target.value)}
                            placeholder="X-Webhook-Token"
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="sumopod-base">Base URL</Label>
                        <Input
                            id="sumopod-base"
                            value={base}
                            onChange={(e) => setBase(e.target.value)}
                            placeholder="https://api-pay-sandbox.sumopod.com"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="sumopod-trial-days">Trial (hari)</Label>
                        <Input
                            id="sumopod-trial-days"
                            type="number"
                            min={0}
                            max={90}
                            value={trialDays}
                            onChange={(e) => setTrialDays(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 md:col-span-2">
                        <Switch
                            checked={enabled}
                            onCheckedChange={setEnabled}
                            id="sumopod-enabled"
                        />
                        <Label htmlFor="sumopod-enabled" className="mb-0 text-sm text-muted-foreground">
                            Aktifkan SumoPod Pay
                        </Label>
                        <Button size="sm" className="ml-auto gap-1.5" onClick={save} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Simpan
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
