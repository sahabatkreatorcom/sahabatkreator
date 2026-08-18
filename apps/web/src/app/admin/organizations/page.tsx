"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Organization {
    id: string;
    name: string;
    slug: string;
    plan: string;
    memberCount: number;
    createdAt: string;
}

export default function AdminOrganizationsPage() {
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const loadOrgs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organizations?page=${page}&limit=10`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat organisasi");
            setOrgs(data.organizations ?? []);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        loadOrgs();
    }, [loadOrgs]);

    if (loading && !orgs.length) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat organisasi...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Kelola Organisasi</h1>
                    <p className="text-sm text-muted-foreground">Manajemen semua workspace</p>
                </div>
                <Button size="sm" variant="secondary" onClick={loadOrgs} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="rounded-lg border border-border bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Nama</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Slug</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Plan</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Member</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Dibuat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {!orgs.length ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                        Belum ada organisasi
                                    </td>
                                </tr>
                            ) : (
                                orgs.map((org) => (
                                    <tr key={org.id} className="hover:bg-muted/50">
                                        <td className="px-4 py-3 text-sm font-medium">{org.name}</td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">@{org.slug}</td>
                                        <td className="px-4 py-3">
                                            <span className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-xs font-medium text-accent-blue">
                                                {org.plan || "Free"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">{org.memberCount ?? 0}</td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">
                                            {new Date(org.createdAt).toLocaleDateString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                    >
                        Sebelumnya
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Halaman {page} dari {totalPages}
                    </span>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                    >
                        Selanjutnya
                    </Button>
                </div>
            )}
        </div>
    );
}
