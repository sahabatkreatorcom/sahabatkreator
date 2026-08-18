"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Users, Building2, TrendingUp, ShieldCheck } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface AdminStats {
    totalUsers: number;
    totalOrganizations: number;
    totalPosts: number;
    totalInboxMessages: number;
    usersThisWeek: number;
    organizationsThisWeek: number;
    postsThisWeek: number;
}

interface RecentUser {
    id: string;
    name: string;
    email: string;
    role: string;
    banned: boolean;
    createdAt: string;
}

interface RecentOrg {
    id: string;
    name: string;
    slug: string;
    plan: string;
    memberCount: number;
    createdAt: string;
}

export default function AdminOverviewPage() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
    const [recentOrgs, setRecentOrgs] = useState<RecentOrg[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statsRes, usersRes, orgsRes] = await Promise.all([
                fetch("/api/admin/stats"),
                fetch("/api/admin/recent-users?limit=5"),
                fetch("/api/admin/recent-organizations?limit=5"),
            ]);

            const statsData = await statsRes.json();
            const usersData = await usersRes.json();
            const orgsData = await orgsRes.json();

            if (!statsRes.ok) throw new Error(statsData.error || "Gagal memuat statistik");
            if (!usersRes.ok) throw new Error(usersData.error || "Gagal memuat user terbaru");
            if (!orgsRes.ok) throw new Error(orgsData.error || "Gagal memuat organisasi terbaru");

            setStats(statsData);
            setRecentUsers(usersData.users ?? []);
            setRecentOrgs(orgsData.organizations ?? []);
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
        return <p className="py-12 text-sm text-muted-foreground">Memuat data admin...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Dashboard Admin</h1>
                    <p className="text-sm text-muted-foreground">Overview platform Sahabat Kreator</p>
                </div>
                <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {/* Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Total User"
                    value={String(stats?.totalUsers ?? 0)}
                    delta={`${stats?.usersThisWeek ?? 0} minggu ini`}
                    trend="up"
                />
                <StatCard
                    label="Total Organisasi"
                    value={String(stats?.totalOrganizations ?? 0)}
                    delta={`${stats?.organizationsThisWeek ?? 0} minggu ini`}
                    trend="up"
                />
                <StatCard
                    label="Total Post"
                    value={String(stats?.totalPosts ?? 0)}
                    delta={`${stats?.postsThisWeek ?? 0} minggu ini`}
                    trend="up"
                />
                <StatCard
                    label="Pesan Inbox"
                    value={String(stats?.totalInboxMessages ?? 0)}
                    delta="Semua waktu"
                    trend="up"
                />
            </div>

            {/* Quick Links */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                    href="/admin/users" as any
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">Kelola User</p>
                        <p className="text-xs text-muted-foreground">{stats?.totalUsers ?? 0} akun</p>
                    </div>
                </Link>

                <Link
                    href="/admin/organizations" as any
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-blue/10">
                        <Building2 className="h-5 w-5 text-accent-blue" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">Organisasi</p>
                        <p className="text-xs text-muted-foreground">{stats?.totalOrganizations ?? 0} workspace</p>
                    </div>
                </Link>

                <Link
                    href="/admin/billing" as any
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-green/10">
                        <TrendingUp className="h-5 w-5 text-accent-green" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">Billing</p>
                        <p className="text-xs text-muted-foreground">Revenue & subscriptions</p>
                    </div>
                </Link>

                <Link
                    href="/admin/health" as any
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-amber/10">
                        <ShieldCheck className="h-5 w-5 text-accent-amber" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">System Health</p>
                        <p className="text-xs text-muted-foreground">Monitor & logs</p>
                    </div>
                </Link>
            </div>

            {/* Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent Users */}
                <div className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border p-4">
                        <h2 className="text-sm font-semibold">User Terbaru</h2>
                        <Link href="/admin/users" as any className="text-xs font-medium text-primary hover:underline">
                            Lihat semua
                        </Link>
                    </div>
                    {!recentUsers.length ? (
                        <p className="p-6 text-sm text-muted-foreground">Belum ada user.</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {recentUsers.map((user) => (
                                <li key={user.id} className="flex items-center gap-3 p-4">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                        {user.name?.[0] ?? user.email?.[0] ?? "?"}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{user.name ?? "Unnamed"}</p>
                                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                            user.banned ? "bg-accent-red/15 text-accent-red" : "bg-accent-green/15 text-accent-green"
                                        }`}>
                                            {user.banned ? "Diblokir" : "Aktif"}
                                        </span>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {new Date(user.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Recent Organizations */}
                <div className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border p-4">
                        <h2 className="text-sm font-semibold">Organisasi Terbaru</h2>
                        <Link href="/admin/organizations" as any className="text-xs font-medium text-primary hover:underline">
                            Lihat semua
                        </Link>
                    </div>
                    {!recentOrgs.length ? (
                        <p className="p-6 text-sm text-muted-foreground">Belum ada organisasi.</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {recentOrgs.map((org) => (
                                <li key={org.id} className="flex items-center gap-3 p-4">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-blue/10 text-xs font-semibold text-accent-blue">
                                        {org.name?.[0] ?? "?"}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{org.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">@{org.slug}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                            {org.memberCount ?? 0} member
                                        </span>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {new Date(org.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
