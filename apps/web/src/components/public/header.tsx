"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const navItems = [
  { href: "/fitur", label: "Fitur" },
  { href: "/harga", label: "Harga" },
  { href: "/blog", label: "Blog" },
  { href: "/tentang", label: "Tentang" },
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-lg font-semibold">Sahabat Kreator</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm transition-colors hover:text-foreground ${
                pathname === item.href
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Masuk
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Coba Gratis</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
