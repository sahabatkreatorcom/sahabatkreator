"use client";

import { usePathname, useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useEffect, useState } from "react";

const LOCALES = [
  { code: "id", label: "ID", name: "Indonesia" },
  { code: "en", label: "EN", name: "English" },
] as const;

export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [locale, setLocale] = useState("id");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("locale");
    if (stored && LOCALES.some((l) => l.code === stored)) {
      setLocale(stored);
    }
  }, []);

  function switchLocale(code: string) {
    localStorage.setItem("locale", code);
    setLocale(code);

    // Strip current locale prefix if present
    let path = pathname;
    for (const l of LOCALES) {
      const prefix = `/${l.code}/`;
      if (path === prefix || path.startsWith(prefix)) {
        path = path === prefix ? "/" : path.slice(prefix.length);
        break;
      }
    }

    if (code === "id") {
      router.push(path || "/");
    } else {
      router.push(`/en${path || "/"}`);
    }
  }

  if (!mounted) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm">
      <Languages className="mx-1 h-3.5 w-3.5 text-muted-foreground" />
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => switchLocale(l.code)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
            locale === l.code
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          aria-label={`Switch to ${l.name}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
