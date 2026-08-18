"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Server, Database, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthStatus {
    status: "healthy" | "degraded" | "unhealthy";
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    database: {
        status: "healthy" | "degraded" | "unhealthy";
        latency: number;
    };
    api: {
        status: "healthy" | "degraded" | "unhealthy";
        latency: number;
    };
    lastCheck: string;
}

export default function AdminHealthPage() {
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/health");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat health status");
            setHealth(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, [load]);

    if (loading && !health) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat health status...</p>;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "healthy": return "text-accent-green";
            case "degraded": return "text-accent-amber";
            default: return "text-accent-red";
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">System Health</h1>
                    <p className="text-sm text-muted-foreground">Monitor kesehatan sistem</p>
                </div>
                <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Server className="h-5 w-5 text-primary" />
                        <h3 className="text-sm font-semibold">Server</h3>
                    </div>
                    <p className={`text-2xl font-semibold ${getStatusColor(health?.status ?? "healthy")}`}>
                        {health?.status ?? "unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Uptime: {Math.floor((health?.uptime ?? 0) / 86400)} hari
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Database className="h-5 w-5 text-accent-blue" />
                        <h3 className="text-sm font-semibold">Database</h3>
                    </div>
                    <p className={`text-2xl font-semibold ${getStatusColor(health?.database?.status ?? "healthy")}`}>
                        {health?.database?.status ?? "unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Latency: {health?.database?.latency ?? 0}ms
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Cpu className="h-5 w-5 text-accent-green" />
                        <h3 className="text-sm font-semibold">API</h3>
                    </div>
                    <p className={`text-2xl font-semibold ${getStatusColor(health?.api?.status ?? "healthy")}`}>
                        {health?.api?.status ?? "unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Latency: {health?.api?.latency ?? 0}ms
                    </p>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">Resource Usage</h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Memory Usage</span>
                        <span className="text-sm font-medium">{health?.memoryUsage ?? 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                        <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${health?.memoryUsage ?? 0}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">CPU Usage</span>
                        <span className="text-sm font-medium">{health?.cpuUsage ?? 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                        <div
                            className="h-2 rounded-full bg-accent-green transition-all"
                            style={{ width: `${health?.cpuUsage ?? 0}%` }}
                        />
                    </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                    Last check: {health?.lastCheck ? new Date(health.lastCheck).toLocaleString("id-ID") : "unknown"}
                </p>
            </div>
        </div>
    );
}
