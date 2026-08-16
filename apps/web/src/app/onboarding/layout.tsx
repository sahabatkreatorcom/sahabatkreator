import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");

    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex items-center justify-between p-6">
                <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="signal-dot-live absolute inline-flex h-full w-full rounded-full bg-primary/60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    </span>
                    Sahabat Kreator
                </span>
                <ThemeToggle />
            </header>
            <main className="flex flex-1 items-center justify-center p-6">
                <div className="w-full max-w-md">{children}</div>
            </main>
        </div>
    );
}