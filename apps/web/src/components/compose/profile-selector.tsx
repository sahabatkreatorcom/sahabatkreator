"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Platform, getPlatformSortIndex, PLATFORM_LABELS, PLATFORM_COLORS } from "@/lib/platform-config";
import { PlatformIcon } from "@/components/ui/platform-icon";

export interface SocialAccount {
    id: string;
    platform: Platform;
    name: string;
    username: string | null;
    avatar: string | null;
    isActive?: boolean;
    organizationId?: string | null;
    organization?: { id: string; name: string; logo: string | null } | null;
}

interface ProfileSelectorProps {
    accounts: SocialAccount[];
    selected: string[];
    onSelectionChange: (ids: string[]) => void;
    groupBy?: "platform" | "organisation" | "organization";
    incompatiblePlatforms?: Platform[];
    className?: string;
}

interface PlatformGroup {
    platform: Platform;
    accounts: SocialAccount[];
}

export function ProfileSelector({
    accounts,
    selected,
    onSelectionChange,
    groupBy = "platform",
    incompatiblePlatforms = [],
    className,
}: ProfileSelectorProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedPlatforms, setExpandedPlatforms] = useState<Set<Platform>>(new Set());

    const filteredAccounts = useMemo(() => {
        if (!searchQuery.trim()) return accounts;
        const q = searchQuery.toLowerCase();
        return accounts.filter(
            (a) => a.name.toLowerCase().includes(q) || (a.username && a.username.toLowerCase().includes(q)),
        );
    }, [accounts, searchQuery]);

    const platformGroups = useMemo((): PlatformGroup[] => {
        const map = new Map<Platform, SocialAccount[]>();
        filteredAccounts.forEach((a) => {
            const existing = map.get(a.platform) || [];
            existing.push(a);
            map.set(a.platform, existing);
        });
        return Array.from(map.entries())
            .sort(([a], [b]) => getPlatformSortIndex(a) - getPlatformSortIndex(b))
            .map(([platform, accs]) => ({ platform, accounts: accs }));
    }, [filteredAccounts]);

    const togglePlatform = (platform: Platform) => {
        setExpandedPlatforms((prev) => {
            const next = new Set(prev);
            if (next.has(platform)) next.delete(platform); else next.add(platform);
            return next;
        });
    };

    const toggleAccount = (id: string) => {
        onSelectionChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    };

    const togglePlatformAll = (platform: Platform) => {
        const platformAccountIds = filteredAccounts.filter((a) => a.platform === platform).map((a) => a.id);
        const allSelected = platformAccountIds.every((id) => selected.includes(id));
        if (allSelected) {
            onSelectionChange(selected.filter((id) => !platformAccountIds.includes(id)));
        } else {
            onSelectionChange([...new Set([...selected, ...platformAccountIds])]);
        }
    };

    const selectedByPlatform = useMemo(() => {
        const map: Record<string, number> = {};
        selected.forEach((id) => {
            const acc = accounts.find((a) => a.id === id);
            if (acc) map[acc.platform] = (map[acc.platform] || 0) + 1;
        });
        return map;
    }, [selected, accounts]);

    return (
        <div className={cn("flex h-full flex-col overflow-hidden", className)}>
            <div className="border-b border-border p-3">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pilih Akun</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{selected.length}</span>
                </div>
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Cari..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 w-full rounded-md border border-border bg-muted/50 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {platformGroups.map((group) => {
                    const isExpanded = expandedPlatforms.has(group.platform);
                    const accountIds = group.accounts.map((a) => a.id);
                    const allSelected = accountIds.length > 0 && accountIds.every((id) => selected.includes(id));
                    const count = selectedByPlatform[group.platform] || 0;

                    return (
                        <div key={group.platform} className="mb-1">
                            <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted/50">
                                <button onClick={() => togglePlatform(group.platform)} className="flex items-center gap-1.5 flex-1 min-w-0">
                                    {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: PLATFORM_COLORS[group.platform] }}>
                                        <PlatformIcon platform={group.platform} size={10} />
                                    </span>
                                    <span className="truncate text-[11px] font-medium">{PLATFORM_LABELS[group.platform]}</span>
                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                        {count > 0 ? `${count}/${group.accounts.length}` : group.accounts.length}
                                    </span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); togglePlatformAll(group.platform); }}
                                    className={cn(
                                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                                        allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
                                    )}
                                    title={allSelected ? "Batal pilih semua" : `Pilih semua ${PLATFORM_LABELS[group.platform]}`}
                                >
                                    {allSelected && <Check className="h-3 w-3" />}
                                </button>
                            </div>

                            {isExpanded && (
                                <div className="ml-4 mt-0.5 space-y-0.5">
                                    {group.accounts.map((account) => {
                                        const isSelected = selected.includes(account.id);
                                        const isIncompatible = incompatiblePlatforms.includes(account.platform);
                                        return (
                                            <button
                                                key={account.id}
                                                onClick={() => !isIncompatible && toggleAccount(account.id)}
                                                disabled={isIncompatible}
                                                className={cn(
                                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                                                    isSelected ? "bg-primary/10" : "hover:bg-muted/50",
                                                    isIncompatible && "opacity-40 cursor-not-allowed"
                                                )}
                                            >
                                                <div className="relative shrink-0">
                                                    {account.avatar ? (
                                                        <img src={account.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                                                    ) : (
                                                        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: PLATFORM_COLORS[account.platform] }}>
                                                            {account.name[0]}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="truncate text-[11px] font-medium">{account.name}</p>
                                                    {account.username && <p className="truncate text-[10px] text-muted-foreground">@{account.username}</p>}
                                                </div>
                                                <div className={cn(
                                                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                                                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                                                )}>
                                                    {isSelected && <Check className="h-3 w-3" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
