import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
  {
    variants: {
      size: {
        sm: "h-6 w-6 text-[10px]",
        default: "h-9 w-9 text-xs",
        lg: "h-12 w-12 text-sm",
        xl: "h-16 w-16 text-lg",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type AvatarProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof avatarVariants> & {
    src?: string | null;
    alt?: string;
    /** Alias untuk fallback (initials dari nama) */
    name?: string;
    fallback?: string;
  };

/**
 * Inisial untuk avatar tanpa gambar: maksimal dua huruf.
 *
 * Sebelumnya seluruh nama ditulis di dalam lingkaran, sehingga nama dua kata
 * seperti "Demo Kreator" terpotong di tengah kata dan terbaca seperti "Demo"
 * bertumpuk "Kreator". Nilai yang sudah berupa inisial pendek (mis. "SK")
 * dilewatkan apa adanya supaya pemanggil yang memang mengirim inisial tidak
 * berubah.
 */
export function avatarInitials(value: string): string {
  const text = value.trim();
  if (text.length === 0) return "?";
  // Sudah inisial: 1–2 huruf tanpa spasi.
  if (text.length <= 2 && !text.includes(" ")) return text.toUpperCase();

  const words = text.split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? (words[1]?.[0] ?? "") : (words[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase() || "?";
}

export function Avatar({ className, size, src, alt, name, fallback, ...props }: AvatarProps) {
  const label = fallback ?? name ?? "?";
  const initials = avatarInitials(label);
  return (
    <div className={cn(avatarVariants({ size }), className)} {...props}>
      {src ? (
        <img src={src} alt={alt ?? label} className="aspect-square h-full w-full object-cover" />
      ) : (
        <span className="bg-[var(--accent-gold-light)] font-semibold text-[var(--accent-gold)]">
          {initials}
        </span>
      )}
    </div>
  );
}
