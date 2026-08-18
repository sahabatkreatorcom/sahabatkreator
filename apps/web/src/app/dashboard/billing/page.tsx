"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    Check,
    X,
    CreditCard,
    Users,
    Zap,
    Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Plan {
    id: string;
    name: string;
    price: number;
    maxMembers: number;
    features: string[];
    current: boolean;
}

interface BillingData {
    organization: {
        name: string;
        tier: string;
        maxMembers: number;
        subscriptionStatus: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    };
    memberCount: number;
    plans: Plan[];
}

export default function BillingPage() {
    const [data, setData] = useState<BillingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/billing");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat billing.");
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat billing.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleCheckout(planId: string) {
        setCheckoutLoading(planId);
        setError(null);
        try {
            const res = await fetch("/api/billing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || json.message || "Gagal checkout.");
            // TODO: redirect ke Stripe checkout
            alert(json.message || "Checkout berhasil! (demo)");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal checkout.");
        } finally {
            setCheckoutLoading(null);
        }
    }

    if (loading) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat billing…</p>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-lg font-semibold">Billing & Subscription</h1>
                <p className="text-sm text-muted-foreground">
                    Kelola langganan dan paket workspace Anda.
                </p>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {/* Current Plan */}
            {data && (
                <div className="rounded-lg border border-border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold">Paket Saat Ini</p>
                            <p className="text-2xl font-bold capitalize text-primary">
                                {data.organization.tier.toLowerCase()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {data.memberCount} / {data.organization.maxMembers} anggota
                            </p>
                        </div>
                        <div className="text-right">
                            {data.organization.subscriptionStatus === "active" && (
                                <p className="text-sm text-accent-green">
                                    ✓ Aktif sampai {data.organization.currentPeriodEnd
                                        ? new Date(data.organization.currentPeriodEnd).toLocaleDateString("id-ID", {
                                              day: "numeric",
                                              month: "long",
                                              year: "numeric",
                                          })
                                        : "—"}
                                </p>
                            )}
                            {data.organization.cancelAtPeriodEnd && (
                                <p className="text-sm text-amber-600">Akan berakhir di akhir periode</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Plans */}
            <div className="grid gap-4 sm:grid-cols-3">
                {data?.plans.map((plan) => (
                    <div
                        key={plan.id}
                        className={cn(
                            "rounded-lg border bg-card p-5",
                            plan.current
                                ? "border-primary bg-primary/5"
                                : "border-border"
                        )}
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">{plan.name}</p>
                            {plan.current && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                    Saat Ini
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-2xl font-bold">
                            Rp {plan.price.toLocaleString("id-ID")}
                            <span className="text-sm font-normal text-muted-foreground">/bulan</span>
                        </p>
                        <ul className="mt-4 space-y-2">
                            {plan.features.map((feat, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                    <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                                    <span className="text-muted-foreground">{feat}</span>
                                </li>
                            ))}
                        </ul>
                        <Button
                            className="mt-5 w-full"
                            variant={plan.current ? "secondary" : "default" as any}
                            disabled={plan.current || checkoutLoading === plan.id}
                            onClick={() => !plan.current && handleCheckout(plan.id)}
                        >
                            {checkoutLoading === plan.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : plan.current ? (
                                "Plan Saat Ini"
                            ) : (
                                "Upgrade"
                            )}
                        </Button>
                    </div>
                ))}
            </div>

            {/* Usage */}
            {data && (
                <div className="rounded-lg border border-border bg-card p-5">
                    <h2 className="text-sm font-semibold">Penggunaan Saat Ini</h2>
                    <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Anggota tim</span>
                            <span className="text-sm font-medium">
                                {data.memberCount} / {data.organization.maxMembers}
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                            <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${(data.memberCount / data.organization.maxMembers) * 100}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Akun media sosial</span>
                            <span className="text-sm font-medium">Terhubung</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}