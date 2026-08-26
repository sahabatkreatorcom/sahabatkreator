import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";

export function Topbar({ user }: { user: { name: string; email: string } }) {
    return (
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
            <div />
            <div className="flex items-center gap-3">
                <ThemeToggle />
                <UserMenu name={user.name} email={user.email} />
            </div>
        </header>
    );
}