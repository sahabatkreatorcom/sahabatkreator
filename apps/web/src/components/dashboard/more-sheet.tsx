"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { mobileOverflowNav } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

export function MoreSheet({
    open,
    onClose,
    isPlatformAdmin,
}: {
    open: boolean;
    onClose: () => void;
    isPlatformAdmin?: boolean;
}) {
    const pathname = usePathname();
    const sheetRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKeyDown);
        sheetRef.current?.focus();
        return () => {
            document.body.style.overflow = "";
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Menu lainnya"
                tabIndex={-1}
                className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-border bg-card p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-xl focus-visible:outline-none"
            >
                <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm font-semibold">Lainnya</span>
                    <button
                        onClick={onClose}
                        aria-label="Tutup"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <ul className="space-y-0.5 pb-1">
                    {mobileOverflowNav.map((item) => {
                        const Icon = item.icon;
                        const active = pathname.startsWith(item.href);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href as any}
                                    onClick={onClose}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                                        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}

                </ul>
            </div>
        </div>
    );
}