import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { ProfileForm } from "@/components/settings/profile-form";

export default async function ProfilePage() {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    if (!session) return <div>Unauthorized</div>;

    const { name, email, emailVerified } = session.user;

    return (
        <div className="max-w-xl space-y-4">
            <div>
                <h1 className="text-lg font-semibold">Profil</h1>
                <p className="text-sm text-muted-foreground">
                    Kelola informasi pribadi Anda.
                </p>
            </div>

            <ProfileForm
                name={name ?? ""}
                email={email ?? ""}
                emailVerified={!!emailVerified}
            />
        </div>
    );
}
