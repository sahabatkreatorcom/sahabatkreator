"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Ban, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UsersTable } from "@/components/admin/users-table";
import { BanUserDialog } from "@/components/admin/ban-user-dialog";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    banned: boolean;
    createdAt: string;
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [banDialogOpen, setBanDialogOpen] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/users?page=${page}&limit=10`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat user");
            setUsers(data.users ?? []);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data");
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const handleBan = (user: User) => {
        setSelectedUser(user);
        setBanDialogOpen(true);
    };

    const handleBanConfirm = async () => {
        if (!selectedUser) return;
        try {
            const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ banned: !selectedUser.banned }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memperbarui user");
            await loadUsers();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Gagal memperbarui user");
        }
        setBanDialogOpen(false);
    };

    if (loading && !users.length) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat user...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Kelola User</h1>
                    <p className="text-sm text-muted-foreground">Manajemen semua akun pengguna</p>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={loadUsers} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Tambah User
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <UsersTable users={users} onBan={handleBan} />

            <div className="flex items-center justify-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
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
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                >
                    Selanjutnya
                </Button>
            </div>

            <BanUserDialog
                open={banDialogOpen}
                onOpenChange={setBanDialogOpen}
                user={selectedUser}
                onConfirm={handleBanConfirm}
            />

            <CreateUserDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={loadUsers}
            />
        </div>
    );
}
