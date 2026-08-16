import { Verify2FAForm } from "@/components/auth/verify-2fa-form";

export default function Verify2FAPage() {
    return (
        <div>
            <h1 className="text-xl font-semibold">Verifikasi dua langkah</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Masukkan kode dari aplikasi authenticator, atau kirim kode ke email Anda.
            </p>
            <div className="mt-6">
                <Verify2FAForm />
            </div>
        </div>
    );
}