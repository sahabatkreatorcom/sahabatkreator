// Input password dengan tombol "lihat password".
//
// Sebelumnya markup ini disalin apa adanya di login, register, dan 3 tempat di
// settings — masing-masing dengan state show/hide sendiri. Setiap penambahan
// halaman baru (mis. reset-password) berarti menyalin ulang blok yang sama dan
// gampang lupa dipasang. Komponen ini jadi satu-satunya sumber perilakunya.
//
// Visibilitas dikelola internal (per-field) supaya dua field di satu form —
// mis. "password baru" + "konfirmasi" di /reset-password — bisa dibuka
// terpisah tanpa saling ikut terlihat.
import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        // pr-10 = ruang untuk tombol mata agar teks tidak tertimpa ikon
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={visible}
        title={visible ? "Sembunyikan password" : "Tampilkan password"}
        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
