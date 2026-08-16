import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { InviteMemberDialog } from "@/components/dashboard/invite-member-dialog";
import { MembersTable } from "@/components/dashboard/members-table";

export default async function MembersPage() {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    const members = await auth.api.listMembers({ headers: h });

    const currentMember = members.members.find(
        (m) => m.userId === session!.user.id
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Anggota tim</h1>
                    <p className="text-sm text-muted-foreground">
                        Kelola siapa saja yang punya akses ke workspace ini.
                    </p>
                </div>
                <InviteMemberDialog />
            </div>

            <MembersTable
                members={members.members}
                currentUserId={session!.user.id}
                currentMemberId={currentMember?.id ?? ""}
                currentMemberRole={currentMember?.role ?? ""}
            />
        </div>
    );
}
