"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
    Bell,
    BellOff,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Smartphone,
    Monitor,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePushNotification } from "@/hooks/use-push-notification";

interface PushSub {
    id: string;
    userAgent: string | null;
    createdAt: string;
}

interface PushData {
    isSupported: boolean;
    isVapidConfigured: boolean;
    subscriptions: PushSub[];
}

export function PushNotificationSettings() {
    const [data, setData] = useState<PushData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [requesting, setRequesting] = useState(false);

    const { isSupported, isLoading: subscribing, subscribe, unsubscribe } = usePushNotification();

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/push");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat notifikasi.");
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat notifikasi.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleSubscribe() {
        setRequesting(true);
        setError(null);
        try {
            await subscribe();
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal mensubscribe.");
        } finally {
            setRequesting(false);
        }
    }

    async function revokeSubscription(subId: string) {
        setRevoking(subId);
        try {
            const res = await fetch("/api/push", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscriptionId: subId }),
            });
            if (!res.ok) throw new Error("Gagal mencabut subscription.");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal mencabut subscription.");
        } finally {
            setRevoking(null);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const hasSubscription = (data?.subscriptions.length ?? 0) > 0;

    return (
        <div className="space-y-6 rounded-lg border border-border bg-card p-5">
            <div>
                <h2 className="text-sm font-semibold">Notifikasi Push</h2>
                <p className="text-sm text-muted-foreground">
                    Terima notifikasi langsung di browser untuk postingan terbit, error, dan peringatan token.
                </p>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {/* Status */}
            <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                    <div className="flex items-center gap-3">
                        {isSupported ? (
                            <Bell className="h-5 w-5 text-emerald-500" />
                        ) : (
                            <BellOff className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                            <p className="text-sm font-medium">Dukungan Browser</p>
                            <p className="text-xs text-muted-foreground">
                                {isSupported
                                    ? "Browser Anda mendukung notifikasi push"
                                    : "Browser tidak mendukung notifikasi push"}
                            </p>
                        </div>
                    </div>
                    {isSupported ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                </div>

                <div className="flex items-center justify-between rounded-md border border-border p-3">
                    <div className="flex items-center gap-3">
                        <Bell className="h-5 w-5 text-primary" />
                        <div>
                            <p className="text-sm font-medium">VAPID Terkonfigurasi</p>
                            <p className="text-xs text-muted-foreground">
                                {data?.isVapidConfigured
                                    ? "Server siap mengirim notifikasi push"
                                    : "Belum dikonfigurasi — hubungi admin"}
                            </p>
                        </div>
                    </div>
                    {data?.isVapidConfigured ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                    )}
                </div>
            </div>

            {/* Permission */}
            <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                    <p className="text-sm font-medium">Izin Notifikasi</p>
                    <p className="text-xs text-muted-foreground">
                        {data?.subscriptions.length ?? 0} perangkat terdaftar
                    </p>
                </div>
                <Button
                    size="sm"
                    variant={hasSubscription ? "secondary" : undefined}
                    disabled={subscribing || !isSupported}
                    onClick={handleSubscribe}
                >
                    {subscribing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : hasSubscription ? (
                        <>Sudah Izin</>
                    ) : (
                        "Izinkan"
                    )}
                </Button>
            </div>

            {/* Devices */}
            {data?.subscriptions.length ? (
                <div className="space-y-2">
                    <p className="text-sm font-medium">Perangkat Terdaftar</p>
                    {data.subscriptions.map((sub) => (
                        <div
                            key={sub.id}
                            className="flex items-center justify-between rounded-md border border-border p-3"
                        >
                            <div className="flex items-center gap-3">
                                {/mobile|android|iphone|ipad/.test(sub.userAgent ?? "") ? (
                                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <Monitor className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div>
                                    <p className="text-sm font-medium">
                                        {sub.userAgent
                                            ? sub.userAgent.includes("Mobile")
                                                ? "Handphone"
                                                : "Desktop"
                                            : "Perangkat"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(sub.createdAt).toLocaleDateString("id-ID")}
                                    </p>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-accent-red hover:bg-accent-red/10"
                                disabled={revoking === sub.id}
                                onClick={() => revokeSubscription(sub.id)}
                            >
                                {revoking === sub.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
