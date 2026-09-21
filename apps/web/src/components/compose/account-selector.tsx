// Pemilih akun multi-platform di Compose — pill avatar + username.
import { Check } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import type { Account } from "./compose-types";

export function AccountSelector({
  accounts,
  selectedIds,
  onToggle,
}: {
  accounts: Account[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (accounts.length === 0) {
    return (
      <p className="text-[var(--text-secondary)] text-sm">
        Belum ada akun terhubung. Hubungkan akun Anda terlebih dahulu di halaman Akun Sosmed.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((account) => {
        const cfg = PLATFORMS[account.platform as keyof typeof PLATFORMS];
        const Icon = cfg?.icon;
        const selected = selectedIds.includes(account.id);
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => onToggle(account.id)}
            aria-pressed={selected}
            className={cn(
              "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
              selected
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                : "border-[var(--border)] hover:border-[var(--accent-gold)]",
            )}
          >
            {/* Avatar user + badge icon platform kecil di pojok */}
            <span className="relative">
              {account.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt={account.username}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                Icon && (
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${cfg.color}1a` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                  </span>
                )
              )}
              {account.avatarUrl && Icon && (
                <span
                  className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--bg-primary)]"
                  style={{ backgroundColor: cfg.color }}
                  title={cfg.label}
                >
                  <Icon className="h-2 w-2 text-white" />
                </span>
              )}
            </span>
            @{account.username}
            {selected && <Check className="h-3.5 w-3.5 text-[var(--accent-gold)]" />}
          </button>
        );
      })}
    </div>
  );
}
