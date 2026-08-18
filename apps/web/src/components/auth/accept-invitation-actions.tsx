"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AcceptInvitationActions({ invitationId }: { invitationId: string }) {
    const router = useRouter();
    const [loading, setLoading] = React.useState<"accept" | "decline" | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    async function handleAccept() {
        setError(null);
        setLoading("accept");
        const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
        setLoading(null);

        if (error) {
            setError("Gagal menerima undangan. Mungkin sudah kedaluwarsa — coba minta undangan baru.");
            return;
        }

        if (data?.invitation.organizationId) {
            await authClient.organization.setActive({ organizationId: data.invitation.organizationId });
        }
        router.push("/dashboard");
    }

    async function handleDecline() {
        setLoading("decline");
        await authClient.organization.rejectInvitation({ invitationId });
        setLoading(null);
        router.push("/dashboard");
    }

    return (
        <div className="space-y-3">
            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}
            <Button className="w-full" loading={loading === "accept"} disabled={!!loading} onClick={handleAccept}>
                Terima undangan
            </Button>
            <Button
                variant="secondary"
                className="w-full"
                loading={loading === "decline"}
                disabled={!!loading}
                onClick={handleDecline}
            >
                Tolak
            </Button>
        </div>
    );
}