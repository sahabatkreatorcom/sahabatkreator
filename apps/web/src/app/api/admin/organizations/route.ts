import { auth } from "@sahabat-kreator/auth";
import { withAdmin, json } from "@/lib/api";

export const GET = withAdmin(async (ctx, request: Request) => {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    try {
        const res = await auth.api.listOrganizations({
            headers: ctx.headers,
            query: { limit, offset, search }
        });
        const organizations = (res as any)?.organizations ?? [];
        const total = (res as any)?.total ?? 0;
        return json({ organizations, total });
    } catch (e) {
        return json({ error: "Failed to fetch organizations" }, { status: 500 });
    }
});
