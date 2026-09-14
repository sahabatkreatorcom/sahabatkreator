// Logo Sahabat Kreator
import { cn } from "@/lib/utils";

export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src="/logo-sahabat-kreator-baru.png"
      alt="Logo Sahabat Kreator"
      width={size}
      height={size}
      className={cn("rounded-[var(--radius-md)] object-contain", className)}
    />
  );
}

export function LogoFull({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo size={32} />
      <span className="font-bold text-lg tracking-tight">
        Sahabat <span className="text-gradient">Kreator</span>
      </span>
    </div>
  );
}
