"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, CreditCard, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";

interface BillingStats {
    totalRevenue: number;
    monthlyRevenue: number;
    activeSubscriptions: number;
    churnRate: number;
    revenueThisMonth: number;
    revenueLastMonth: number;
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

            <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="h-5 w-5 text-accent-green" />
                    <h2 className="text-sm font-semibold">Informasi Billing</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Fitur billing integration sedang dalam pengembangan. Hubungi admin untuk pengaturan subscription.
                </p>
            </div>
        </div>
    );
}
