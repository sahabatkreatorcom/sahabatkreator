import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
    return (
        <div>
            <Link
                href="/login"
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Kembali ke halaman masuk
            </Link>
            <h1 className="text-xl font-semibold">Lupa password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Masukkan email akun Anda. Kami akan kirim tautan untuk membuat password baru.
            </p>
            <div className="mt-6">
                <ForgotPasswordForm />
            </div>
        </div>
    );
}