import { NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { headers } from "next/headers";

export async function GET(request: Request) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    try {
        const res = await auth.api.listOrganizations({
            headers: await headers(),
            query: { limit, offset, search }
        });
        const organizations = (res as any)?.organizations ?? [];
        const total = (res as any)?.total ?? 0;
        return NextResponse.json({ organizations, total });
    } catch (e) {
        return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }
}
