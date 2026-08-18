"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
    LayoutDashboard, 
    Users, 
    Building2, 
    CreditCard, 
    ShieldCheck,
    Server,
    type LucideIcon
} from "lucide-react";

interface AdminNavItem {
    href: string;
    label: string;
    icon: LucideIcon;
}

const adminNavItems: AdminNavItem[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/organizations", label: "Organizations", icon: Building2 },
    { href: "/admin/billing", label: "Billing", icon: CreditCard },
    { href: "/admin/health", label: "System Health", icon: Server },
];

function isActive(href: string, pathname: string): boolean {
    if (pathname === href) return true;
    return pathname.startsWith(href + "/");
}

export function AdminSidebar() {
    const pathname = usePathname();

    return (
        <nav className="flex h-full flex-col gap-1 p-3">
            <Link 
                href="/dashboard" 
                className="mb-4 flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
                <ShieldCheck className="h-4 w-4" />
                Back to Dashboard
            </Link>

            <div className="space-y-1">
                {adminNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                                isActive(item.href, pathname)
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
