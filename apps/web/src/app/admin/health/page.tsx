"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle, XCircle, AlertCircle, Server, Database, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthStatus {
    status: "healthy" | "degraded" | "unhealthy";
    uptime: string;
    version: string;
    components: {
        name: string;
        status: "healthy" | "degraded" | "unhealthy";
        message?: string;
        details?: Record<string, string>;
    }[];
    metrics: {
        memoryUsage?: string;
        cpuUsage?: string;
        dbConnections?: number;
        activeSessions?: number;
    };
    lastCheck: string;
}

export default function AdminHealthPage() {
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const checkHealth = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/health");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memeriksa kesehatan sistem");
            setHealth(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memeriksa kesehatan sistem");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkHealth();
    }, [checkHealth]);

    const statusIcon = (status: string) => {
        switch (status) {
            case "healthy": return <CheckCircle className="h-4 w-4 text-accent-green" />;
            case "degraded": return <AlertCircle className="h-4 w-4 text-accent-amber" />;
            case "unhealthy": return <XCircle className="h-4 w-4 text-accent-red" />;
            default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const statusBadge = (status: string) => {
        const classes: Record<string, string> = {
            healthy: "bg-accent-green/15 text-accent-green",
            degraded: "bg-accent-amber/15 text-accent-amber",
            unhealthy: "bg-accent-red/15 text-accent-red",
        };
        const labels: Record<string, string> = {
            healthy: "Sehat",
            degraded: "Degraded",
            unhealthy: "Tidak Sehat",
        };
        return (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes[status] ?? classes.unhealthy}`}>
                {labels[status] ?? status}
            </span>
        );
    };

    if (loading && !health) {
        return <p className="py-12 text-sm text-muted-foreground">Memeriksa kesehatan sistem...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">System Health</h1>
                    <p className="text-sm text-muted-foreground">Monitor kesehatan platform</p>
                </div>
                <Button size="sm" variant="secondary" onClick={checkHealth} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Periksa sekarang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {/* Overall Status */}
            <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                        health?.status === "healthy" ? "bg-accent-green/15" :
                        health?.status === "degraded" ? "bg-accent-amber/15" : "bg-accent-red/15"
                    }`}>
                        {statusIcon(health?.status ?? "unhealthy")}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-base font-semibold">
                            {health?.status === "healthy" ? "Platform Sehat" :
                             health?.status === "degraded" ? "Platform Degraded" : "Platform Tidak Sehat"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Last check: {health?.lastCheck ? new Date(health.lastCheck).toLocaleString("id-ID") : "—"}
                        </p>
                    </div>
                    {statusBadge(health?.status ?? "unhealthy")}
                </div>
            </div>

            {/* Metrics */}
            {health?.metrics && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Server className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Memory</span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">{health.metrics.memoryUsage ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Server className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">CPU</span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">{health.metrics.cpuUsage ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Database className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">DB Connections</span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">{health.metrics.dbConnections ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase tracking-wide">Active Sessions</span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">{health.metrics.activeSessions ?? "—"}</p>
                    </div>
                </div>
            )}

            {/* Components */}
            <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border p-4">
                    <h2 className="text-sm font-semibold">System Components</h2>
                </div>
                <div className="divide-y divide-border">
                    {health?.components?.map((comp, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4">
                            {statusIcon(comp.status)}
                            <div className="flex-1">
                                <p className="text-sm font-medium">{comp.name}</p>
                                {comp.message && <p className="text-xs text-muted-foreground">{comp.message}</p>}
                            </div>
                            {statusBadge(comp.status)}
                        </div>
                    ))}
                </div>
            </div>

            {/* Version Info */}
            <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Version Info</h2>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>Platform Version: <span className="font-mono text-foreground">{health?.version ?? "—"}</span></p>
                    <p>Uptime: <span className="font-mono text-foreground">{health?.uptime ?? "—"}</span></p>
                </div>
            </div>
        </div>
    );
}
