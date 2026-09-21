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

export function Avatar({ className, size, src, alt, name, fallback, ...props }: AvatarProps) {
  const text = fallback ?? name ?? "?";
  return (
    <div className={cn(avatarVariants({ size }), className)} {...props}>
      {src ? (
        <img src={src} alt={alt ?? text} className="aspect-square h-full w-full object-cover" />
      ) : (
        <span className="bg-[var(--accent-gold-light)] font-semibold text-[var(--accent-gold)]">
          {text}
        </span>
      )}
    </div>
  );
}
