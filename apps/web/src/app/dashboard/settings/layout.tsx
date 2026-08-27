import type { ReactNode } from "react";
import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SettingsLayoutProps {
    children: ReactNode;
}

const links = [
    { href: "/settings/profile" as any, label: "Profil" },
    { href: "/settings/security" as any, label: "Keamanan" },
    { href: "/settings/platforms" as any, label: "Platform" },
    { href: "/settings/members" as any, label: "Anggota" },
    { href: "/settings/teams" as any, label: "Tim" },
    { href: "/settings/sessions" as any, label: "Sesi aktif" },
];

export default async function SettingsLayout({ children }: SettingsLayoutProps) {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    return (
        <div className="flex gap-8">
            <nav className="w-48 shrink-0 space-y-1 pt-1">
                {links.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {link.label}
                    </Link>
                ))}
            </nav>
            <div className="flex-1">{children}</div>
        </div>
    );
}
