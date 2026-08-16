"use client";

import * as React from "react";
import { Search, MoreHorizontal, ShieldOff, UserCog, Eye, Trash2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn, initials, ringColorFor } from "@/lib/utils";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { BanUserDialog } from "@/components/admin/ban-user-dialog";

interface AdminUser {
    id: string;
    name: string;
    email: string;
    role?: string;
    banned: boolean | null;
    banReason?: string | null;
    createdAt: string;
}

const PAGE_SIZE = 20;

export function UsersTable() {
    const [users, setUsers] = React.useState<AdminUser[]>([]);
    const [total, setTotal] = React.useState(0);
    const [search, setSearch] = React.useState("");
    const [page, setPage] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
    const [banTarget, setBanTarget] = React.useState<AdminUser | null>(null);

    const fetchUsers = React.useCallback(async () => {
        setLoading(true);
        const { data } = await authClient.admin.listUsers({
            query: {
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
                searchField: "email",
                searchValue: search || undefined,
                searchOperator: "contains",
            },
        });
        setUsers((data?.users as unknown as AdminUser[]) ?? []);
        setTotal(data?.total ?? 0);
        setLoading(false);
    }, [page, search]);

    React.useEffect(() => {
        const t = setTimeout(fetchUsers, 250); // debounce search
        return () => clearTimeout(t);
    }, [fetchUsers]);

    async function toggleRole(user: AdminUser) {
        const nextRole = user.role === "admin" ? "user" : "admin";
        await authClient.admin.setRole({ userId: user.id, role: nextRole });
        setOpenMenuId(null);
        fetchUsers();
    }

    async function unban(user: AdminUser) {
        await authClient.admin.unbanUser({ userId: user.id });
        setOpenMenuId(null);
        fetchUsers();
    }

    async function forceLogout(user: AdminUser) {
        if (!confirm(`Paksa logout ${user.name} dari semua device?`)) return;
        await authClient.admin.revokeUserSessions({ userId: user.id });
        setOpenMenuId(null);
    }

    async function impersonate(user: AdminUser) {
        await authClient.admin.impersonateUser({ userId: user.id });
        window.location.href = "/dashboard";
    }

    async function removeUser(user: AdminUser) {
        if (!confirm(`Hapus akun ${user.name} secara permanen?`)) return;
        await authClient.admin.removeUser({ userId: user.id });
        setOpenMenuId(null);
        fetchUsers();
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Semua user</h1>
                    <p className="text-sm text-muted-foreground">{total} akun terdaftar di seluruh platform.</p>
                </div>
                <CreateUserDialog onCreated={fetchUsers} />
            </div>

            <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    value={search}
                    onChange={(e) => {
                        setPage(0);
                        setSearch(e.target.value);
                    }}
                    placeholder="Cari berdasarkan email..."
                    className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-3">User</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading && (
                            <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                    Memuat...
                                </td>
                            </tr>
                        )}

                        {!loading && users.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                    Tidak ada user yang cocok.
                                </td>
                            </tr>
                        )}

                        {!loading &&
                            users.map((user) => (
                                <tr key={user.id}>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                                style={{ backgroundColor: ringColorFor(user.email) }}
                                            >
                                                {initials(user.name)}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate font-medium">{user.name}</p>
                                                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={cn(
                                                "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                                                user.role === "admin" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                                            )}
                                        >
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {user.banned ? (
                                            <span className="rounded-full bg-accent-red/15 px-2 py-0.5 text-xs font-medium text-accent-red">
                                                Diblokir
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-xs font-medium text-accent-green">
                                                Aktif
                                            </span>
                                        )}
                                    </td>
                                    <td className="relative px-4 py-3 text-right">
                                        <button
                                            onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                                            aria-label="Opsi user"
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </button>

                                        {openMenuId === user.id && (
                                            <div
                                                role="menu"
                                                className="absolute right-4 top-[calc(100%-4px)] z-10 w-52 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                                            >
                                                <button
                                                    role="menuitem"
                                                    onClick={() => toggleRole(user)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                                                >
                                                    <UserCog className="h-4 w-4" />
                                                    {user.role === "admin" ? "Cabut akses admin" : "Jadikan admin"}
                                                </button>
                                                <button
                                                    role="menuitem"
                                                    onClick={() => impersonate(user)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                    Impersonate
                                                </button>
                                                <button
                                                    role="menuitem"
                                                    onClick={() => forceLogout(user)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                                                >
                                                    <LogOut className="h-4 w-4" />
                                                    Paksa logout semua device
                                                </button>
                                                {user.banned ? (
                                                    <button
                                                        role="menuitem"
                                                        onClick={() => unban(user)}
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                                                    >
                                                        <ShieldOff className="h-4 w-4" />
                                                        Buka blokir
                                                    </button>
                                                ) : (
                                                    <button
                                                        role="menuitem"
                                                        onClick={() => {
                                                            setBanTarget(user);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                                                    >
                                                        <ShieldOff className="h-4 w-4" />
                                                        Ban user
                                                    </button>
                                                )}
                                                <button
                                                    role="menuitem"
                                                    onClick={() => removeUser(user)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent-red hover:bg-accent-red/10"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    Hapus akun
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                        Halaman {page + 1} dari {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                        >
                            Sebelumnya
                        </button>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                        >
                            Berikutnya
                        </button>
                    </div>
                </div>
            )}

            {banTarget && (
                <BanUserDialog
                    open={!!banTarget}
                    userId={banTarget.id}
                    userName={banTarget.name}
                    onClose={() => setBanTarget(null)}
                    onBanned={() => {
                        setBanTarget(null);
                        fetchUsers();
                    }}
                />
            )}
        </div>
    );
}