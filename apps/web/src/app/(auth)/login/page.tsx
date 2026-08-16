import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
    return (
        <div>
            <h1 className="text-xl font-semibold">Masuk ke workspace Anda</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Belum punya akun?{" "}
                <Link href="/register" className="font-medium text-primary hover:underline">
                    Daftar
                </Link>
            </p>
            <div className="mt-6">
                <LoginForm />
            </div>
        </div>
    );
}