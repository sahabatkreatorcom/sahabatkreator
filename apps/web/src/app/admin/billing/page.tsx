"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, CreditCard, TrendingUp, Users, DollarSign } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";

interface BillingStats {
    totalRevenue: number;
    mrr: number;
    activeSubscriptions: number;
    totalCustomers: number;
    revenueThisMonth: number;
    revenueGrowth: number;
}

interface SubscriptionPlan {
    name: string;
    price: number;
    subscribers: number;
    revenue: number;
}

export default function AdminBillingPage() {
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statsRes, plansRes] = await Promise.all([
                fetch("/api/admin/billing/stats"),
                fetch("/api/admin/billing/plans"),
            ]);

            const statsData = await statsRes.json();
            const plansData = await plansRes.json();

            if (!statsRes.ok) throw new Error(statsData.error || "Gagal memuat statistik billing");
            if (!plansRes.ok) throw new Error(plansData.error || "Gagal memuat data plan");

            setStats(statsData);
            setPlans(plansData.plans ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (loading && !stats) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat data billing...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Billing & Revenue</h1>
                    <p className="text-sm text-muted-foreground">Overview pendapatan dan subscription</p>
                </div>
                <Button size="sm" variant="secondary" onClick={loadData} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Total Revenue"
                    value={`Rp ${(stats?.totalRevenue ?? 0).toLocaleString("id-ID")}`}
                    delta={`${stats?.revenueGrowth ?? 0}% dari bulan lalu`}
                    trend="up"
                />
                <StatCard
                    label="MRR"
                    value={`Rp ${(stats?.mrr ?? 0).toLocaleString("id-ID")}`}
                    delta="Monthly Recurring Revenue"
                    trend="up"
                />
                <StatCard
                    label="Active Subscriptions"
                    value={String(stats?.activeSubscriptions ?? 0)}
                    delta={`${stats?.totalCustomers ?? 0} customers`}
                    trend="up"
                />
                <StatCard
                    label="Revenue This Month"
                    value={`Rp ${(stats?.revenueThisMonth ?? 0).toLocaleString("id-ID")}`}
                    delta="Bulan berjalan"
                    trend="up"
                />
            </div>

            {/* Plans */}
            <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border p-4">
                    <h2 className="text-sm font-semibold">Subscription Plans</h2>
                </div>
                <div className="divide-y divide-border">
                    {plans.map((plan) => (
                        <div key={plan.name} className="flex items-center gap-4 p-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-green/10">
                                <CreditCard className="h-5 w-5 text-accent-green" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium">{plan.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    Rp {plan.price.toLocaleString("id-ID")}/bulan
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-medium">{plan.subscribers ?? 0} subscribers</p>
                                <p className="text-xs text-muted-foreground">
                                    Rp {(plan.revenue ?? 0).toLocaleString("id-ID")} revenue
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
