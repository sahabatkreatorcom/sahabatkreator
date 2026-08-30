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

function getOrganisationKey(account: SocialAccount): string {
    return account.organizationId || `ungrouped-${account.id}`;
}

function getOrganisationName(account: SocialAccount): string {
    return account.organization?.name || account.name;
}

export function ProfileSelector({
    accounts,
    selected,
    onSelectionChange,
    groupBy = "organisation",
    incompatiblePlatforms = [],
    className,
}: ProfileSelectorProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["all"]));

    const filteredAccounts = useMemo(() => {
        let result = accounts;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = accounts.filter(
                (a) => a.name.toLowerCase().includes(q) || (a.username && a.username.toLowerCase().includes(q)) || a.platform.toLowerCase().includes(q),
            );
        }
        return [...result].sort((a, b) => {
            const diff = getPlatformSortIndex(a.platform) - getPlatformSortIndex(b.platform);
            return diff !== 0 ? diff : a.name.localeCompare(b.name);
        });
    }, [accounts, searchQuery]);

    const groups = useMemo(() => {
        if (groupBy === "platform") {
            const map = new Map<Platform, SocialAccount[]>();
            filteredAccounts.forEach((a) => {
                const existing = map.get(a.platform) || [];
                existing.push(a);
                map.set(a.platform, existing);
            });
            return Array.from(map.entries()).map(([platform, accs]) => ({ name: platform, accounts: accs, platforms: [platform] }));
        }
        const map = new Map<string, { name: string; accounts: SocialAccount[]; platforms: Set<Platform> }>();
        filteredAccounts.forEach((a) => {
            const key = getOrganisationKey(a);
            const existing = map.get(key);
            if (existing) {
                existing.accounts.push(a);
                existing.platforms.add(a.platform);
            } else {
                map.set(key, { name: getOrganisationName(a), accounts: [a], platforms: new Set([a.platform]) });
            }
        });
        return Array.from(map.entries()).map(([, v]) => ({ name: v.name, accounts: v.accounts, platforms: Array.from(v.platforms) }));
    }, [filteredAccounts, groupBy]);

    const toggleGroup = (name: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const toggleAccount = (id: string) => {
        onSelectionChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    };

    const toggleAll = (ids: string[]) => {
        const allSelected = ids.every((id) => selected.includes(id));
        if (allSelected) onSelectionChange(selected.filter((id) => !ids.includes(id)));
        else onSelectionChange([...new Set([...selected, ...ids])]);
    };

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
                {groups.map((group) => {
                    const isExpanded = expandedGroups.has("all") || expandedGroups.has(group.name);
                    const accountIds = group.accounts.map((a) => a.id);
                    const allSelected = accountIds.length > 0 && accountIds.every((id) => selected.includes(id));

                    return (
                        <div key={group.name} className="mb-1">
                            <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted/50">
                                <button onClick={() => toggleGroup(group.name)} className="flex items-center gap-1 flex-1 min-w-0">
                                    {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                    <div className="flex -space-x-1">
                                        {group.platforms.slice(0, 4).map((p) => (
                                            <span key={p} className="flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold text-white ring-1 ring-background" style={{ background: PLATFORM_COLORS[p] }}>
                                                <PlatformIcon platform={p} size={8} />
                                            </span>
                                        ))}
                                    </div>
                                    <span className="truncate text-[11px] font-medium ml-1">{group.name}</span>
                                    <span className="text-[10px] text-muted-foreground ml-auto">{group.accounts.length}</span>
                                </button>
                                <button onClick={() => toggleAll(accountIds)} className="flex h-4 w-4 items-center justify-center rounded border" title={allSelected ? "Batal pilih semua" : "Pilih semua"}>
                                    {allSelected && <Check className="h-3 w-3 text-primary" />}
                                </button>
                            </div>

                            {isExpanded && (
                                <div className="ml-4 space-y-0.5">
                                    {group.accounts.map((account) => {
                                        const isSelected = selected.includes(account.id);
                                        const isIncompatible = incompatiblePlatforms.includes(account.platform);
                                        return (
                                            <button
                                                key={account.id}
                                                onClick={() => !isIncompatible && toggleAccount(account.id)}
                                                disabled={isIncompatible}
                                                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors", isSelected ? "bg-primary/10" : "hover:bg-muted/50", isIncompatible && "opacity-40 cursor-not-allowed")}
                                            >
                                                <div className="relative shrink-0">
                                                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: PLATFORM_COLORS[account.platform] }}>
                                                        <PlatformIcon platform={account.platform} size={10} />
                                                    </span>
                                                    {account.avatar && <img src={account.avatar} alt="" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-background object-cover" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="truncate text-[11px] font-medium">{account.name}</p>
                                                    {account.username && <p className="truncate text-[10px] text-muted-foreground">@{account.username}</p>}
                                                </div>
                                                <div className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
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

            <div className="border-t border-border p-2">
                <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(selected.map((id) => accounts.find((a) => a.id === id)?.platform))).filter(Boolean).map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: PLATFORM_COLORS[p!] }}>
                            <PlatformIcon platform={p!} size={8} />
                            {PLATFORM_LABELS[p!]}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
