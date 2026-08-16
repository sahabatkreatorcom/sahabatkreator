"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteAccountForm() {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const [password, setPassword] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function handleDelete() {
        if (!password) return;
        setLoading(true);
        setError(null);

        const { error: err } = await authClient.$fetch("/delete-user", {
            method: "POST",
            body: { password },
        });

        setLoading(false);
        if (err) {
            setError("Password salah atau terjadi kesalahan.");
            return;
        }

        await authClient.signOut({ fetchOptions: {
            onSuccess: () => {
                router.push("/login");
                router.refresh();
            },
        }});
    }

    return (
        <>
            <div className="rounded-lg border border-accent-red/30 bg-card p-5">
                <div className="flex items-start gap-3">
                    <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-red" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-accent-red">Hapus akun</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Setelah dihapus, semua data dan workspace Anda akan hilang permanen. Tindakan ini tidak dapat dibatalkan.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-accent-red hover:bg-accent-red/10 hover:text-accent-red"
                        onClick={() => setOpen(true)}
                    >
                        Hapus akun
                    </Button>
                </div>
            </div>

            <Dialog
                open={open}
                onClose={() => { setOpen(false); setPassword(""); setError(null); }}
                title="Hapus akun permanen"
                description="Masukkan password Anda untuk mengonfirmasi penghapusan akun."
            >
                <div className="space-y-4">
                    <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
                        Semua workspace, tim, dan data Anda akan dihapus secara permanen.
                    </div>

                    <div>
                        <Label htmlFor="del-password">Password</Label>
                        <Input
                            id="del-password"
                            type="password"
                            autoFocus
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Masukkan password Anda"
                            required
                        />
                    </div>

                    {error && (
                        <div role="alert" className="text-sm text-accent-red">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={loading || !password}
                        >
                            {loading ? (
                                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Menghapus...</>
                            ) : (
                                "Hapus akun"
                            )}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
}
