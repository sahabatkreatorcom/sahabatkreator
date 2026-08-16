import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function StatCard({
    label,
    value,
    delta,
    trend = "up",
}: {
    label: string;
    value: string;
    delta?: string;
    trend?: "up" | "down";
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
            {delta && (
                <p
                    className={cn(
                        "mt-1 flex items-center gap-1 text-xs font-medium",
                        trend === "up" ? "text-accent-green" : "text-accent-red"
                    )}
                >
                    {trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {delta}
                </p>
            )}
        </div>
    );
}