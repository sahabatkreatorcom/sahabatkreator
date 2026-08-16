import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";

export function Topbar({ user }: { user: { name: string; email: string } }) {
    return (
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
            <div />
            <div className="flex items-center gap-3">
                <ThemeToggle />
                <UserMenu name={user.name} email={user.email} />
            </div>
        </header>
    );
}