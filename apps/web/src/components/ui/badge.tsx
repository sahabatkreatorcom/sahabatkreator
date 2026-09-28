import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
        secondary: "border-transparent bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
        destructive: "border-transparent bg-[var(--error-light)] text-[var(--error)]",
        primary: "border-transparent bg-[var(--accent-gold-light)] text-[var(--accent-gold)]",
        success: "border-transparent bg-[var(--success-light)] text-[var(--success)]",
        warning: "border-transparent bg-[var(--warning-light)] text-[var(--warning)]",
        danger: "border-transparent bg-[var(--error-light)] text-[var(--error)]",
        info: "border-transparent bg-[var(--info-light)] text-[var(--info)]",
        outline: "border-[var(--border)] text-[var(--text-secondary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
