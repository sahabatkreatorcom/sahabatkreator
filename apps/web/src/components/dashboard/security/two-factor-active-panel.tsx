"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldOff, CheckCircle2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { PasswordConfirmDialog } from "@/components/dashboard/security/password-confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { BackupCodesList } from "@/components/dashboard/security/backup-codes-list";

type ActiveDialog = "none" | "regenerate" | "disable";

export function TwoFactorActivePanel() {
    const router = useRouter();
    const [activeDialog, setActiveDialog] = React.useState<ActiveDialog>("none");
    const [newBackupCodes, setNewBackupCodes] = React.useState<string[] | null>(null);

    async function handleRegenerate(password: string) {
        const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
        if (error) return { error: true, message: "Password salah." };
        setNewBackupCodes(data.backupCodes);
        return {};
    }

    async function handleDisable(password: string) {
        const { error } = await authClient.twoFactor.disable({ password });
        if (error) return { error: true, message: "Password salah." };
        setActiveDialog("none");
        router.refresh();
        return {};
    }

    return (
        <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-green" />
                <div>
                    <p className="text-sm font-semibold">Verifikasi dua langkah aktif</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Akun Anda dilindungi dengan aplikasi authenticator.
                    </p>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setActiveDialog("regenerate")}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Buat ulang backup codes
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setActiveDialog("disable")}>
                    <ShieldOff className="h-3.5 w-3.5" />
                    Nonaktifkan 2FA
                </Button>
            </div>

            <PasswordConfirmDialog
                open={activeDialog === "disable"}
                title="Nonaktifkan 2FA?"
                description="Akun Anda akan lebih mudah diakses jika password bocor. Masukkan password untuk konfirmasi."
                confirmLabel="Nonaktifkan"
                destructive
                onClose={() => setActiveDialog("none")}
                onConfirm={handleDisable}
            />

            <PasswordConfirmDialog
                open={activeDialog === "regenerate" && !newBackupCodes}
                title="Buat ulang backup codes"
                description="Kode lama akan langsung tidak berlaku. Masukkan password untuk melanjutkan."
                confirmLabel="Buat kode baru"
                onClose={() => setActiveDialog("none")}
                onConfirm={handleRegenerate}
            />

            <Dialog
                open={activeDialog === "regenerate" && !!newBackupCodes}
                onClose={() => {
                    setActiveDialog("none");
                    setNewBackupCodes(null);
                }}
                title="Backup codes baru"
                description="Kode lama sudah tidak berlaku. Simpan yang baru ini."
            >
                {newBackupCodes && <BackupCodesList codes={newBackupCodes} />}
                <Button
                    className="mt-4 w-full"
                    onClick={() => {
                        setActiveDialog("none");
                        setNewBackupCodes(null);
                    }}
                >
                    Selesai
                </Button>
            </Dialog>
        </div>
    );
}