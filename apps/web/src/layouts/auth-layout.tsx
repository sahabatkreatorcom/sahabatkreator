import { Outlet } from "react-router";
import { Logo } from "@/components/ui/logo";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      {/* Panel kiri — branding */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient p-12 lg:flex">
        <div className="relative z-10 text-white">
          <div className="flex items-center gap-2.5">
            <Logo size={40} className="rounded-[var(--radius-lg)] bg-white/90 p-1" />
            <span className="font-bold text-xl">
              Sahabat <span className="opacity-80">Kreator</span>
            </span>
          </div>
          <h1 className="mt-16 max-w-md font-bold text-4xl leading-tight">
            Semua konten social media Anda, dalam satu dashboard.
          </h1>
          <p className="mt-4 max-w-md text-white/85">
            Jadwalkan posting, pantau analitik, dan balas engagement dari 10+ platform — tanpa
            berpindah aplikasi.
          </p>
          <ul className="mt-8 space-y-3 text-white/90">
            <li>✓ Jadwal posting otomatis multi-platform</li>
            <li>✓ Analitik terpadu & laporan performa</li>
            <li>✓ Kolaborasi tim dengan role & permission</li>
          </ul>
        </div>
        <p className="relative z-10 text-sm text-white/70">
          Dipercaya kreator & bisnis di seluruh Indonesia
        </p>
        {/* Dekorasi */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10" />
      </div>

      {/* Panel kanan — form */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
