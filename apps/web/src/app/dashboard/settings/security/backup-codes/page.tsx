import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { BackupCodesPageClient } from "./page.client";

export default async function BackupCodesPage() {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    if (!session) return <div>Unauthorized</div>;

    // viewBackupCodes is a server-only endpoint — call it directly here
    const result = await auth.api.viewBackupCodes({
        body: { userId: session.user.id },
        headers: h,
    });

    const codes: string[] | null = result.backupCodes ?? null;

    return <BackupCodesPageClient codes={codes} />;
}
