"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn, initials, ringColorFor } from "@/lib/utils";

interface Org {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
}

export type OrgSwitcherProps = {
    organizations: Org[];
    activeOrganizationId: string;
};

export function OrgSwitcher({ organizations, activeOrganizationId }: OrgSwitcherProps) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    const active = organizations.find((o) => o.id === activeOrganizationId) ?? organizations[0];

    React.useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    async function switchOrg(orgId: string) {
        setOpen(false);
        await authClient.organization.setActive({ organizationId: orgId });
        router.refresh();
    }

    if (!active) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <OrgAvatar name={active.name} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{active.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">Workspace aktif</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>

            {open && (
                <div
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                >
                    <div className="max-h-64 overflow-y-auto p-1">
                        {organizations.map((org) => (
                            <button
                                key={org.id}
                                role="option"
                                aria-selected={org.id === active.id}
                                onClick={() => switchOrg(org.id)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                                <OrgAvatar name={org.name} size="sm" />
                                <span className="flex-1 truncate">{org.name}</span>
                                {org.id === active.id && <Check className="h-4 w-4 text-primary" />}
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-border p-1">
                        <button
                            onClick={() => {
                                setOpen(false);
                                router.push("/onboarding/new-workspace");
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <Plus className="h-4 w-4" />
                            Buat workspace baru
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function OrgAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
    const color = ringColorFor(name);
    const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
    return (
        <span
            className={cn("flex shrink-0 items-center justify-center rounded-md font-semibold text-white", dim)}
            style={{ backgroundColor: color }}
        >
            {initials(name)}
        </span>
    );
}