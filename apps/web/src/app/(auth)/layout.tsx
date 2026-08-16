import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid min-h-screen lg:grid-cols-2">
            {/* Panel kiri: brand, hanya tampil di layar besar */}
            <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="signal-dot-live absolute inline-flex h-full w-full rounded-full bg-white/80" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                    </span>
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
                <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} Sahabat Kreator</p>
            </div>

            {/* Panel kanan: form */}
            <div className="flex flex-col p-6 sm:p-10">
                <div className="flex justify-between lg:justify-end">
                    <span className="text-sm font-semibold lg:hidden">Sahabat Kreator</span>
                    <ThemeToggle />
                </div>
                <div className="flex flex-1 items-center justify-center py-10">
                    <div className="w-full max-w-sm">
                        <Suspense fallback={<div className="h-48 animate-pulse bg-muted rounded-lg" />} >
                            {children}
                        </Suspense>
                    </div>
                </div>
            </div>
        </div>
    );
}