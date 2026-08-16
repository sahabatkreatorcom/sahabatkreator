"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const options = [
    { value: "light" as const, icon: Sun, label: "Terang" },
    { value: "dark" as const, icon: Moon, label: "Gelap" },
    { value: "system" as const, icon: Monitor, label: "Sistem" },
];

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <div
            role="radiogroup"
            aria-label="Tema tampilan"
            className="inline-flex items-center rounded-md border border-border bg-muted p-0.5"
        >
            {options.map(({ value, icon: Icon, label }) => (
                <button
                    key={value}
                    role="radio"
                    aria-checked={theme === value}
                    aria-label={label}
                    title={label}
                    onClick={() => setTheme(value)}
                    className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-[calc(var(--radius-md)-2px)] transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        theme === value
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Icon className="h-3.5 w-3.5" />
                </button>
            ))}
        </div>
    );
}