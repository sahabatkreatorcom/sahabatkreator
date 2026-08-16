"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ResetPasswordForm({ token }: { token?: string }) {
    const router = useRouter();
    const [password, setPassword] = React.useState("");
    const [confirm, setConfirm] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const hasMinLength = password.length >= 8;
    const matches = password.length > 0 && password === confirm;

    if (!token) {
        return (
            <div className="rounded-md border border-accent-red/30 bg-accent-red/10 p-4 text-sm text-accent-red">
                Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru lewat
                halaman{" "}
                <a href="/forgot-password" className="font-medium underline">
                    lupa password
                </a>
                .
            </div>
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!hasMinLength) {
            setError("Password minimal 8 karakter.");
            return;
        }
        if (!matches) {
            setError("Konfirmasi password tidak sama.");
            return;
        }

        setLoading(true);
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        setLoading(false);

        if (error) {
            setError("Tautan reset sudah tidak berlaku. Minta tautan baru.");
            return;
        }

        router.push("/login?reset=success");
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}

            <div>
                <Label htmlFor="password">Password baru</Label>
                <Input
                    id="password"
                    type="password"
                    required
                    autoFocus
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                />
                <RequirementRow met={hasMinLength} label="Minimal 8 karakter" />
            </div>

            <div>
                <Label htmlFor="confirm">Konfirmasi password</Label>
                <Input
                    id="confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Ulangi password baru"
                />
                {confirm.length > 0 && <RequirementRow met={matches} label="Sama dengan password di atas" />}
            </div>

            <Button type="submit" className="w-full" loading={loading}>
                Simpan password baru
            </Button>
        </form>
    );
}

function RequirementRow({ met, label }: { met: boolean; label: string }) {
    return (
        <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs", met ? "text-accent-green" : "text-muted-foreground")}>
            {met ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {label}
        </p>
    );
}   