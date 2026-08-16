import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { SessionList } from "@/components/settings/session-list";

export default async function SessionsPage() {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    return (
        <div className="max-w-xl space-y-6">
            <div>
                <h1 className="text-lg font-semibold">Sesi aktif</h1>
                <p className="text-sm text-muted-foreground">
                    Kelola perangkat yang sedang masuk ke akun Anda.
                </p>
            </div>

            <SessionList currentToken={session?.session?.token ?? ""} />
        </div>
    );
}
