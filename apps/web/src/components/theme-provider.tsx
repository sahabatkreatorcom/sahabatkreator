"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
    theme: Theme;
    resolvedTheme: "light" | "dark";
    setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "sahabat-kreator-theme";

function getSystemTheme(): "light" | "dark" {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = React.useState<Theme>("system");
    const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("light");

    React.useEffect(() => {
        const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
        setThemeState(stored);
    }, []);

    React.useEffect(() => {
        const resolved = theme === "system" ? getSystemTheme() : theme;
        setResolvedTheme(resolved);
        document.documentElement.classList.toggle("dark", resolved === "dark");
    }, [theme]);

    React.useEffect(() => {
        if (theme !== "system") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const listener = () => {
            const resolved = getSystemTheme();
            setResolvedTheme(resolved);
            document.documentElement.classList.toggle("dark", resolved === "dark");
        };
        mq.addEventListener("change", listener);
        return () => mq.removeEventListener("change", listener);
    }, [theme]);

    const setTheme = React.useCallback((next: Theme) => {
        localStorage.setItem(STORAGE_KEY, next);
        setThemeState(next);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = React.useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
    return ctx;
}