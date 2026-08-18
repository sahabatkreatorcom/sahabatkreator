import { auth } from "@sahabat-kreator/auth";
import { withAdmin, json } from "@/lib/api";

export const GET = withAdmin(async (ctx, request: Request) => {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "5");

    try {
        const res = await auth.api.listUsers({
            headers: ctx.headers,
            query: { limit }
        });
        const users = (res as any)?.users ?? [];
        return json({ users });
    } catch (e) {
        return json({ error: "Failed to fetch users" }, { status: 500 });
    }
});
