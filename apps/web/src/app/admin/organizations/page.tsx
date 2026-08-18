"use client";

import * as React from "react";
import { Search, Loader2, RefreshCw, Building2, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Organization {
    id: string;
    name: string;
    slug: string;
    plan: string;
    memberCount: number;
    createdAt: string;
    updatedAt: string;
}

export default function AdminOrganizationsPage() {
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [total, setTotal] = React.useState(0);
    const [search, setSearch] = React.useState("");
    const [page, setPage] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const PAGE_SIZE = 20;

    const fetchOrgs = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/organizations?search=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat organisasi");
            setOrganizations(data.organizations ?? []);
            setTotal(data.total ?? 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    React.useEffect(() => {
        const t = setTimeout(fetchOrgs, 250);
        return () => clearTimeout(t);
    }, [fetchOrgs]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Organisasi</h1>
                    <p className="text-sm text-muted-foreground">{total} workspace terdaftar di platform</p>
                </div>
                <Button size="sm" variant="secondary" onClick={fetchOrgs} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    value={search}
                    onChange={(e) => { setPage(0); setSearch(e.target.value); }}
                    placeholder="Cari berdasarkan nama atau slug..."
                    className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-3">Organisasi</th>
                            <th className="px-4 py-3">Plan</th>
                            <th className="px-4 py-3">Member</th>
                            <th className="px-4 py-3">Dibuat</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Memuat...</td></tr>
                        )}
                        {!loading && organizations.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Tidak ada organisasi yang cocok.</td></tr>
                        )}
                        {!loading && organizations.map((org) => (
                            <tr key={org.id} className="group">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-blue/10 text-xs font-semibold text-accent-blue">
                                            {org.name?.[0] ?? "?"}
                                        </div>
                                        <div>
                                            <p className="font-medium">{org.name}</p>
                                            <p className="text-xs text-muted-foreground">@{org.slug}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                        {org.plan ?? "Free"}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <Users className="h-3.5 w-3.5" />
                                        <span className="text-xs">{org.memberCount ?? 0}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5" />
                                        <span>{new Date(org.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                                        <a href={`/admin/organizations/${org.id}`}>Detail</a>
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Halaman {page + 1} dari {totalPages}</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                            Sebelumnya
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                            Berikutnya
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
