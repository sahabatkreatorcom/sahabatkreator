import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
    return (
        <div>
            <h1 className="text-xl font-semibold">Buat workspace baru</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Sudah punya akun?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                    Masuk
                </Link>
            </p>
            <div className="mt-6">
                <RegisterForm />
            </div>
        </div>
    );
}