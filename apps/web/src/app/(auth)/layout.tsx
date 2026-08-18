import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid min-h-screen lg:grid-cols-2">
            {/* Panel kiri: brand, hanya tampil di layar besar */}
            <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
                <div className="flex items-center gap-2.5 font-semibold">
                    <Logo size={28} className="bg-white/10" />
                    Sahabat Kreator
                </div>
                <div className="max-w-sm">
                    <p className="text-2xl font-semibold leading-snug">
                        Rencanakan, publikasikan, dan analisis semua channel dari satu workspace.
                    </p>
                    <p className="mt-3 text-sm text-primary-foreground/80">
                        Dibuat untuk tim dan agency yang mengelola banyak brand sekaligus.
                    </p>
                </div>
                <div className="text-xs text-primary-foreground/60">
                    <p>© {new Date().getFullYear()} Sahabat Kreator</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Link href="/syarat-ketentuan" className="hover:text-primary-foreground">Syarat & Ketentuan</Link>
                        <Link href="/kebijakan-privasi" className="hover:text-primary-foreground">Kebijakan Privasi</Link>
                        <Link href="/penghapusan-data" className="hover:text-primary-foreground">Penghapusan Data</Link>
                    </div>
                </div>
            </div>

            {/* Panel kanan: form */}
            <div className="flex flex-col p-6 sm:p-10">
                <div className="flex justify-between lg:justify-end">
                    <span className="flex items-center gap-2 text-sm font-semibold lg:hidden">
                        <Logo size={22} className="rounded-md" />
                        Sahabat Kreator
                    </span>
                    <ThemeToggle />
                </div>
                <div className="flex flex-1 items-center justify-center py-10">
                    <div className="w-full max-w-sm">
                        <Suspense fallback={<div className="h-48 animate-pulse bg-muted rounded-lg" />} >
                            {children}
                        </Suspense>
                    </div>
                </div>
                {/* Legal links di form juga */}
                <div className="mt-6 text-center text-xs text-muted-foreground">
                    Dengan melanjutkan, Anda menyetujui{' '}
                    <Link href="/syarat-ketentuan" className="text-primary hover:underline">Syarat & Ketentuan</Link> dan{' '}
                    <Link href="/kebijakan-privasi" className="text-primary hover:underline">Kebijakan Privasi</Link> kami.
                </div>
            </div>
        </div>
    );
}