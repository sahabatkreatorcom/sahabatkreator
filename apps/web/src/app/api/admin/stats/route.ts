import { NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { headers } from "next/headers";

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const usersRes = await auth.api.listUsers({ headers: await headers(), query: { limit: 1 } });
        const totalUsers = (usersRes as any)?.total ?? 0;

        const orgsRes = await auth.api.listOrganizations({ headers: await headers(), query: { limit: 1 } });
        const totalOrganizations = (orgsRes as any)?.total ?? 0;

        const stats = {
            totalUsers,
            totalOrganizations,
            totalPosts: 1234,
            totalInboxMessages: 5678,
            usersThisWeek: 45,
            organizationsThisWeek: 12,
            postsThisWeek: 234,
        };

        return NextResponse.json(stats);
    } catch (e) {
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}
