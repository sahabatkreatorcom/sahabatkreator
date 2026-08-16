"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Lock } from "lucide-react";

export function ChangePasswordForm() {
    const [loading, setLoading] = React.useState(false);
    const [success, setSuccess] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [currentPassword, setCurrentPassword] = React.useState("");
    const [newPassword, setNewPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (newPassword !== confirmPassword) {
            setError("Password baru dan konfirmasi tidak cocok.");
            return;
        }
        if (newPassword.length < 8) {
            setError("Password baru minimal 8 karakter.");
            return;
        }

        setLoading(true);
        const { error } = await authClient.$fetch("/change-password", {
            method: "POST",
            body: { currentPassword, newPassword, revokeOtherSessions: true },
        });
        setLoading(false);

        if (error) {
            setError("Password lama salah atau terjadi kesalahan.");
            return;
        }

        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSuccess(true);
        setTimeout(() => setSuccess(false), 4000);
    }

    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Ubah password</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5">
                <div className="space-y-2">
                    <Label htmlFor="cp-current">Password sekarang</Label>
                    <Input
                        id="cp-current"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="cp-new">Password baru</Label>
                    <Input
                        id="cp-new"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="Minimal 8 karakter"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="cp-confirm">Konfirmasi password baru</Label>
                    <Input
                        id="cp-confirm"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                </div>

                {error && (
                    <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="rounded-md border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
                        Password berhasil diubah. Sesi lain akan dicabut.
                    </div>
                )}

                <Button type="submit" loading={loading}>
                    Ubah password
                </Button>
            </form>
        </div>
    );
}
