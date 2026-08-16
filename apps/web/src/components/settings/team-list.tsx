"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2 } from "lucide-react";

interface Team {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export function TeamList() {
    const [teams, setTeams] = React.useState<Team[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [openCreate, setOpenCreate] = React.useState(false);
    const [newName, setNewName] = React.useState("");
    const [creating, setCreating] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    async function fetchTeams() {
        const { data } = await authClient.$fetch("/organization/list-user-teams", {
            method: "GET",
        }) as { data: Team[] | null; error: unknown };
        if (data) {
            setTeams(data);
        }
        setLoading(false);
    }

    React.useEffect(() => {
        fetchTeams();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim()) return;
        setCreating(true);
        setError(null);

        const { error: err } = await authClient.$fetch("/organization/create-team", {
            method: "POST",
            body: { name: newName.trim() },
        });

        setCreating(false);
        if (err) {
            setError("Gagal membuat tim.");
            return;
        }

        setNewName("");
        setOpenCreate(false);
        fetchTeams();
    }

    async function handleDelete(teamId: string) {
        setDeletingId(teamId);
        const { error: err } = await authClient.$fetch("/organization/remove-team", {
            method: "POST",
            body: { teamId },
        });
        setDeletingId(null);
        if (err) {
            setError("Gagal menghapus tim.");
            return;
        }
        fetchTeams();
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold">Tim</h2>
                    <p className="text-xs text-muted-foreground">
                        Bagi workspace menjadi beberapa tim untuk organisasi yang lebih terstruktur.
                    </p>
                </div>
                <Button size="sm" onClick={() => setOpenCreate(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Buat tim
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : teams.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
                    Belum ada tim. Buat tim pertama Anda.
                </div>
            ) : (
                <div className="space-y-2">
                    {teams.map((t) => (
                        <div
                            key={t.id}
                            className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
                        >
                            <div>
                                <p className="text-sm font-medium">{t.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    Dibuat {new Date(t.createdAt).toLocaleDateString("id-ID")}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-accent-red hover:text-accent-red"
                                disabled={deletingId === t.id}
                                onClick={() => handleDelete(t.id)}
                            >
                                {deletingId === t.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}

            <Dialog
                open={openCreate}
                onClose={() => { setOpenCreate(false); setError(null); setNewName(""); }}
                title="Buat tim baru"
                description="Tim membantu mengelompokkan anggota dalam workspace."
            >
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <Label htmlFor="team-name">Nama tim</Label>
                        <Input
                            id="team-name"
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Contoh: Tim Marketing"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setOpenCreate(false)}>
                            Batal
                        </Button>
                        <Button type="submit" loading={creating}>
                            Buat tim
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
}
