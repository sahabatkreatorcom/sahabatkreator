import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@sahabat-kreator/auth";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");
    // Ini role platform (dari plugin admin), bukan role di dalam satu organization.
    if (session.user.role !== "admin") redirect("/dashboard");

    return (
        <div className="min-h-screen">
            <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-6">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Dashboard
                    </Link>
                    <span className="h-4 w-px bg-border" />
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        Admin platform
                    </span>
                </div>
                <ThemeToggle />
            </header>
            <main className="p-4 lg:p-6">{children}</main>
        </div>
    );
}