import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@sahabat-kreator/auth";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");
    if (session.user.role !== "admin") redirect("/dashboard" as any);

    return (
        <div className="grid min-h-screen lg:grid-cols-[220px_1fr]">
            {/* Sidebar */}
            <aside className="hidden border-r border-border lg:flex flex-col">
                <div className="p-3">
                    <div className="flex items-center gap-2 px-2 py-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <span className="text-sm font-semibold">Admin Platform</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <AdminSidebar />
                </div>
            </aside>

            {/* Main content */}
            <div className="flex flex-col">
                <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-6">
                    <div className="flex items-center gap-4 lg:hidden">
                        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                            ← Dashboard
                        </Link>
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Admin
                        </span>
                    </div>
                    <div className="hidden lg:flex items-center gap-4">
                        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                            ← Dashboard
                        </Link>
                        <span className="h-4 w-px bg-border" />
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Admin Platform
                        </span>
                    </div>
                    <ThemeToggle />
                </header>
                <main className="flex-1 p-4 lg:p-6">{children}</main>
            </div>
        </div>
    );
}
