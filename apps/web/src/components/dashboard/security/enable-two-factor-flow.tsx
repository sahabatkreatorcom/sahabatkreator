"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordConfirmDialog } from "@/components/dashboard/security/password-confirm-dialog";
import { BackupCodesList } from "@/components/dashboard/security/backup-codes-list";

type Step = "password" | "scan" | "backup-codes";

/** Ambil parameter `secret` dari otpauth:// URI untuk fallback input manual. */
function extractSecret(totpURI: string) {
    try {
        return new URL(totpURI).searchParams.get("secret") ?? "";
    } catch {
        return "";
    }
}

export function EnableTwoFactorFlow() {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const [step, setStep] = React.useState<Step>("password");
    const [totpURI, setTotpURI] = React.useState("");
    const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
    const [code, setCode] = React.useState("");
    const [verifyError, setVerifyError] = React.useState<string | null>(null);
    const [verifying, setVerifying] = React.useState(false);

    function reset() {
        setOpen(false);
        setStep("password");
        setTotpURI("");
        setBackupCodes([]);
        setCode("");
        setVerifyError(null);
    }

    async function handlePasswordConfirm(password: string) {
        const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
        if (error) {
            return { error: true, message: "Password salah." };
        }
        if (data.method !== "totp") {
            return { error: true, message: "Metode 2FA TOTP tidak tersedia." };
        }
        setTotpURI(data.totpURI);
        setBackupCodes(data.backupCodes);
        setStep("scan");
        return {};
    }

    async function handleVerify(e: React.FormEvent) {
        e.preventDefault();
        setVerifyError(null);
        setVerifying(true);

        const { error } = await authClient.twoFactor.verifyTotp({ code });
        setVerifying(false);

        if (error) {
            setVerifyError("Kode salah atau sudah kedaluwarsa. Coba lagi.");
            return;
        }

        setStep("backup-codes");
    }

    function handleFinish() {
        reset();
        router.refresh();
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <ShieldCheck className="h-4 w-4" />
                Aktifkan 2FA
            </Button>

            <PasswordConfirmDialog
                open={open && step === "password"}
                title="Konfirmasi password"
                description="Untuk keamanan, masukkan password Anda sebelum mengaktifkan 2FA."
                confirmLabel="Lanjutkan"
                onClose={reset}
                onConfirm={handlePasswordConfirm}
            />

            <Dialog
                open={open && step === "scan"}
                onClose={reset}
                title="Pindai kode QR"
                description="Buka aplikasi authenticator (Google Authenticator, Authy, dll), lalu pindai kode ini."
            >
                <div className="flex flex-col items-center gap-4">
                    <div className="rounded-md border border-border bg-white p-3">
                        <QRCodeSVG value={totpURI} size={176} />
                    </div>

                    <details className="w-full text-center text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium">Tidak bisa pindai kode?</summary>
                        <p className="mt-1.5 select-all break-all rounded-md bg-muted p-2 font-mono">
                            {extractSecret(totpURI)}
                        </p>
                    </details>

                    <form onSubmit={handleVerify} className="w-full space-y-3">
                        {verifyError && (
                            <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                                {verifyError}
                            </div>
                        )}
                        <div>
                            <Label htmlFor="totp-code">Masukkan kode 6 digit dari aplikasi</Label>
                            <Input
                                id="totp-code"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                autoFocus
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="123456"
                                className="text-center text-lg tracking-[0.3em]"
                            />
                        </div>
                        <Button type="submit" className="w-full" loading={verifying}>
                            Verifikasi & aktifkan
                        </Button>
                    </form>
                </div>
            </Dialog>

            <Dialog
                open={open && step === "backup-codes"}
                onClose={handleFinish}
                title="Simpan backup codes Anda"
                description="2FA aktif. Simpan kode ini di tempat aman sebelum melanjutkan."
            >
                <BackupCodesList codes={backupCodes} />
                <Button className="mt-4 w-full" onClick={handleFinish}>
                    Sudah saya simpan, selesai
                </Button>
            </Dialog>
        </>
    );
}