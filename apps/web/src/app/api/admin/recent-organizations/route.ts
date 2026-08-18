import { auth } from "@sahabat-kreator/auth";
import { withAdmin, json } from "@/lib/api";

export const GET = withAdmin(async (ctx, request: Request) => {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "5");

    try {
        const res = await auth.api.listOrganizations({
            headers: ctx.headers,
            query: { limit, sortBy: "createdAt", sortOrder: "desc" }
        });
        const organizations = (res as any)?.organizations ?? [];
        return json({ organizations });
    } catch (e) {
        return json({ error: "Failed to fetch organizations" }, { status: 500 });
    }
});
