"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn, initials, ringColorFor } from "@/lib/utils";

export function UserMenu({ name, email }: { name: string; email: string }) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    const color = ringColorFor(email);

    React.useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    async function handleSignOut() {
        await authClient.signOut();
        router.push("/login" as any);
    }

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: color }}
            >
                {initials(name)}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent-green" />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                >
                    <div className="border-b border-border px-3 py-2.5">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">{email}</p>
                    </div>
                    <div className="p-1">
                        <Link
                            href={"/dashboard/settings" as any}
                            role="menuitem"
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                            onClick={() => setOpen(false)}
                        >
                            <Settings className="h-4 w-4" /> Pengaturan akun
                        </Link>
                    </div>
                    <div className="border-t border-border p-1">
                        <button
                            role="menuitem"
                            onClick={handleSignOut}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-accent-red hover:bg-accent-red/10"
                            )}
                        >
                            <LogOut className="h-4 w-4" /> Keluar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}