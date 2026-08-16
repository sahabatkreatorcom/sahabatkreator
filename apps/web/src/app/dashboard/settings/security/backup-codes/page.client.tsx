"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { PasswordConfirmDialog } from "@/components/dashboard/security/password-confirm-dialog";
import { BackupCodesList } from "@/components/dashboard/security/backup-codes-list";

interface Props {
    codes: string[] | null;
}

export function BackupCodesPageClient({ codes }: Props) {
    const router = useRouter();
    const [showConfirm, setShowConfirm] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function handleRegenerate(password: string) {
        setError(null);
        const { error: err } = await authClient.twoFactor.generateBackupCodes({ password });
        if (err) {
            setError("Password salah.");
            return { error: true, message: "Password salah." };
        }
        setShowConfirm(false);
        router.refresh();
        return {};
    }

    if (codes === null) {
        return (
            <div className="max-w-xl space-y-6">
                <div>
                    <h1 className="text-lg font-semibold">Kode cadangan 2FA</h1>
                    <p className="text-sm text-muted-foreground">
                        Belum ada kode cadangan. Aktifkan verifikasi dua langkah terlebih dahulu.
                    </p>
                </div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Button variant="secondary" onClick={() => (router as any).push("/dashboard/settings/security")}>
                    Kembali ke Keamanan
                </Button>
            </div>
        );
    }

    return (
        <div className="max-w-xl space-y-6">
            <div>
                <h1 className="text-lg font-semibold">Kode cadangan 2FA</h1>
                <p className="text-sm text-muted-foreground">
                    Gunakan kode ini jika Anda kehilangan akses ke aplikasi authenticator.
                    Setiap kode hanya bisa dipakai satu kali.
                </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="h-4 w-4 text-accent-green" />
                    <span className="text-sm font-semibold">Backup codes aktif</span>
                </div>
                <BackupCodesList codes={codes} />
            </div>

            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}

            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowConfirm(true)}>
                    Buat ulang kode
                </Button>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Button variant="ghost" size="sm" onClick={() => (router as any).push("/dashboard/settings/security")}>
                    Kembali
                </Button>
            </div>

            <PasswordConfirmDialog
                open={showConfirm}
                onClose={() => setShowConfirm(false)}
                title="Buat ulang backup codes"
                description="Kode lama akan langsung tidak berlaku. Masukkan password Anda."
                confirmLabel="Buat ulang"
                onConfirm={handleRegenerate}
            />
        </div>
    );
}
