import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: primitive label — htmlFor/children disuntikkan konsumen
    <label className={cn("font-medium text-[var(--text-primary)] text-sm", className)} {...props} />
  );
}
