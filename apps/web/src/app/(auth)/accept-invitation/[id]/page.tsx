import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { AlertTriangle } from "lucide-react";
import { AcceptInvitationActions } from "@/components/auth/accept-invitation-actions";
import { initials, ringColorFor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    let invitation: {
        id: string;
        email: string;
        role: string;
        status: string;
        organizationId: string;
        organizationName: string;
        inviterEmail: string;
    } | null = null;

    try {
        invitation = await auth.api.getInvitation({ query: { id }, headers: h });
    } catch {
        invitation = null;
    }

    if (!invitation) {
        return (
            <ErrorState
                title="Undangan tidak ditemukan"
                description="Tautan ini mungkin sudah kedaluwarsa atau salah ketik. Minta pengirim untuk mengundang Anda lagi."
            />
        );
    }

    if (invitation.status === "accepted") {
        return (
            <ErrorState
                title="Undangan sudah dipakai"
                description={`Anda sudah tergabung di ${invitation.organizationName}.`}
                actionHref="/"
                actionLabel="Buka dashboard"
            />
        );
    }

    if (invitation.status !== "pending") {
        return (
            <ErrorState
                title="Undangan sudah tidak berlaku"
                description="Undangan ini sudah dibatalkan atau kedaluwarsa. Minta tautan undangan baru."
            />
        );
    }

    // Belum login -> arahkan login/daftar, lalu kembali ke halaman ini
    if (!session) {
        const returnTo = `/accept-invitation/${id}`;
        return (
            <div>
                <InvitationHeader invitation={invitation} />
                <div className="mt-6 space-y-2">
                    <Link
                        href={`/login?redirect=${encodeURIComponent(returnTo)}`}
                        className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                        Masuk untuk menerima
                    </Link>
                    <Link
                        href={`/register?email=${encodeURIComponent(invitation.email)}&redirect=${encodeURIComponent(returnTo)}`}
                        className="flex h-10 w-full items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted"
                    >
                        Belum punya akun? Daftar
                    </Link>
                </div>
            </div>
        );
    }

    // Sudah login tapi pakai akun email berbeda dari yang diundang
    if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        return (
            <div>
                <InvitationHeader invitation={invitation} />
                <div className="mt-4 flex items-start gap-2 rounded-md border border-accent-amber/30 bg-accent-amber/10 p-3 text-sm text-accent-amber">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                        Undangan ini untuk <b>{invitation.email}</b>, tapi Anda masuk sebagai{" "}
                        <b>{session.user.email}</b>. Keluar dulu lalu masuk dengan akun yang benar.
                    </p>
                </div>
                <Link
                    href={`/login?redirect=${encodeURIComponent(`/accept-invitation/${id}`)}`}
                    className="mt-4 flex h-10 w-full items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted"
                >
                    Ganti akun
                </Link>
            </div>
        );
    }

    return (
        <div>
            <InvitationHeader invitation={invitation} />
            <div className="mt-6">
                <AcceptInvitationActions invitationId={invitation.id} />
            </div>
        </div>
    );
}

function InvitationHeader({
    invitation,
}: {
    invitation: { organizationName: string; inviterEmail: string; role: string };
}) {
    const color = ringColorFor(invitation.organizationName);
    return (
        <div>
            <span
                className="flex h-12 w-12 items-center justify-center rounded-lg text-lg font-semibold text-white"
                style={{ backgroundColor: color }}
            >
                {initials(invitation.organizationName)}
            </span>
            <h1 className="mt-4 text-xl font-semibold">
                Gabung ke {invitation.organizationName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                <b className="text-foreground">{invitation.inviterEmail}</b> mengundang Anda sebagai{" "}
                <span className="font-medium capitalize text-foreground">{invitation.role}</span>.
            </p>
        </div>
    );
}

function ErrorState({
    title,
    description,
    actionHref = "/login",
    actionLabel = "Kembali ke halaman masuk",
}: {
    title: string;
    description: string;
    actionHref?: string;
    actionLabel?: string;
}) {
    return (
        <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-red/10">
                <AlertTriangle className="h-6 w-6 text-accent-red" />
            </div>
            <h1 className="mt-4 text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <Link
                href={actionHref as any}
                className="mt-6 flex h-10 w-full items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted"
            >
                {actionLabel}
            </Link>
        </div>
    );
}