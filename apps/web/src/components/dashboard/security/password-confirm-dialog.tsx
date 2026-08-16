"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Dialog re-auth generik: minta password sebelum operasi sensitif
 * (enable/disable 2FA, generate ulang backup codes). Dipakai berkali-kali
 * lewat prop onConfirm supaya logikanya tidak diduplikasi.
 */
export function PasswordConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Konfirmasi",
    destructive = false,
    onClose,
    onConfirm,
}: {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    destructive?: boolean;
    onClose: () => void;
    onConfirm: (password: string) => Promise<{ error?: boolean; message?: string }>;
}) {
    const [password, setPassword] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) {
            setPassword("");
            setError(null);
        }
    }, [open]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const result = await onConfirm(password);
        setLoading(false);

        if (result.error) {
            setError(result.message ?? "Password salah. Coba lagi.");
            return;
        }
    }

    return (
        <Dialog open={open} onClose={onClose} title={title} description={description}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                        {error}
                    </div>
                )}
                <div>
                    <Label htmlFor="confirm-password">Password Anda</Label>
                    <Input
                        id="confirm-password"
                        type="password"
                        required
                        autoFocus
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" variant={destructive ? "destructive" : "primary"} loading={loading}>
                        {confirmLabel}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}