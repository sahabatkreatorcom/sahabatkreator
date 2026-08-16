"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, Smartphone, Tablet, XCircle } from "lucide-react";

interface Session {
    id: string;
    token: string;
    userId: string;
    expiresAt: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    createdAt: string;
    updatedAt: string;
}

function parseUserAgent(ua: string | null | undefined): { device: string; icon: React.ReactNode } {
    if (!ua) return { device: "Perangkat tidak dikenali", icon: <Monitor className="h-4 w-4" /> };
    const lower = ua.toLowerCase();
    if (/mobile|android.*mobile|iphone|ipad/.test(lower))
        return { device: "Handphone", icon: <Smartphone className="h-4 w-4" /> };
    if (/tablet|ipad/.test(lower))
        return { device: "Tablet", icon: <Tablet className="h-4 w-4" /> };
    if (/chrome|firefox|safari|edge/.test(lower)) {
        const browser = lower.includes("chrome") ? "Chrome" : lower.includes("firefox") ? "Firefox" : lower.includes("safari") ? "Safari" : "Edge";
        return { device: `${browser}`, icon: <Monitor className="h-4 w-4" /> };
    }
    return { device: "Aplikasi", icon: <Monitor className="h-4 w-4" /> };
}

export function SessionList({ currentToken }: { currentToken: string }) {
    const [sessions, setSessions] = React.useState<Session[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [revoking, setRevoking] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    async function fetchSessions() {
        const { data } = await authClient.$fetch("/list-sessions", {
            method: "GET",
        }) as { data: Session[] | null; error: unknown };
        if (data) setSessions(data);
        setLoading(false);
    }

    React.useEffect(() => {
        fetchSessions();
    }, []);

    async function revoke(token: string) {
        setRevoking(token);
        const { error: err } = await authClient.$fetch("/revoke-session", {
            method: "POST",
            body: { token },
        });
        setRevoking(null);
        if (err) {
            setError("Gagal mencabut sesi.");
            return;
        }
        fetchSessions();
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold">Sesi aktif</h2>
                <p className="text-xs text-muted-foreground">
                    Perangkat yang sedang masuk ke akun Anda. Cabut sesi yang tidak dikenal.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
                    Tidak ada sesi aktif.
                </div>
            ) : (
                <div className="space-y-2">
                    {sessions.map((s) => {
                        const isCurrent = s.token === currentToken;
                        const { device, icon } = parseUserAgent(s.userAgent);
                        return (
                            <div
                                key={s.id}
                                className={`flex items-center justify-between rounded-md border px-4 py-3 ${
                                    isCurrent ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-muted-foreground">{icon}</span>
                                    <div>
                                        <p className="text-sm font-medium">
                                            {device}
                                            {isCurrent && (
                                                <span className="ml-2 text-xs font-normal text-primary">— Saat ini</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {s.ipAddress ?? "—"} · {new Date(s.createdAt).toLocaleString("id-ID")}
                                        </p>
                                    </div>
                                </div>
                                {!isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-accent-red hover:text-accent-red"
                                        disabled={revoking === s.token}
                                        onClick={() => revoke(s.token)}
                                    >
                                        {revoking === s.token ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <>
                                                <XCircle className="h-3.5 w-3.5" />
                                                Cabut
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}
        </div>
    );
}
