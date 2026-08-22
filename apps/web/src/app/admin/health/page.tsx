"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Server, Database, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthStatus {
    status: "healthy" | "degraded" | "unhealthy";
    uptimeSeconds: number;
    version: string;
    nodeVersion: string;
    components: Array<{
        name: string;
        status: "healthy" | "degraded" | "unhealthy";
        message: string;
    }>;
    metrics: {
        memoryRssMb: number;
        memoryHeapUsedMb: number;
        cpuTimeMs: number;
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
                        Uptime: {Math.floor((health?.uptimeSeconds ?? 0) / 86400)} hari
                    </p>
                    <p className="text-xs text-muted-foreground">v{health?.version ?? "-"}</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Database className="h-5 w-5 text-accent-blue" />
                        <h3 className="text-sm font-semibold">Database</h3>
                    </div>
                    {(() => {
                        const db = health?.components?.find(c => c.name === "Database");
                        return (
                            <>
                                <p className={`text-2xl font-semibold ${getStatusColor(db?.status ?? "healthy")}`}>
                                    {db?.status ?? "unknown"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Latency: {db?.message ?? "-"}
                                </p>
                            </>
                        );
                    })()}
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Cpu className="h-5 w-5 text-accent-green" />
                        <h3 className="text-sm font-semibold">Memory</h3>
                    </div>
                    <p className="text-2xl font-semibold text-primary">
                        {health?.metrics?.memoryRssMb ?? 0} MB
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Heap: {health?.metrics?.memoryHeapUsedMb ?? 0} MB
                    </p>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">Resource Usage</h3>
                <div className="space-y-3">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">Memory RSS</span>
                            <span className="text-sm font-medium">{health?.metrics?.memoryRssMb ?? 0} MB</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                            <div
                                className="h-2 rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(100, (health?.metrics?.memoryRssMb ?? 0) / 10)}%` }}
                            />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">Memory Heap</span>
                            <span className="text-sm font-medium">{health?.metrics?.memoryHeapUsedMb ?? 0} MB</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                            <div
                                className="h-2 rounded-full bg-accent-green transition-all"
                                style={{ width: `${Math.min(100, (health?.metrics?.memoryHeapUsedMb ?? 0) / 10)}%` }}
                            />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">CPU Time</span>
                            <span className="text-sm font-medium">{Math.round(health?.metrics?.cpuTimeMs ?? 0)} ms</span>
                        </div>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                    Last check: {health?.lastCheck ? new Date(health.lastCheck).toLocaleString("id-ID") : "unknown"}
                </p>
            </div>
        </div>
    );
}
