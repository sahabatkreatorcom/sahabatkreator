import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui/logo";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");

    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex items-center justify-between p-6">
                <span className="flex items-center gap-2 text-sm font-semibold">
                    <Logo size={24} className="rounded-md" />
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