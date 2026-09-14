import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-[var(--accent-gold)]", className)} />;
}

export function PageLoader({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8" />
      <p className="text-[var(--text-secondary)] text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}
