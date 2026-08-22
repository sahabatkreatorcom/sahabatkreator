import { auth } from "@sahabat-kreator/auth";
import { withAdmin, json } from "@/lib/api";
import { gte } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async (ctx) => {
    try {
        const since = new Date();
        since.setDate(since.getDate() - 7);

        const [usersRes, orgsRes, totalPosts, totalInboxMessages, usersThisWeek, organizationsThisWeek, postsThisWeek] =
            await Promise.all([
                auth.api.listUsers({ headers: ctx.headers, query: { limit: 1 } }),
                auth.api.listOrganizations({ headers: ctx.headers, query: { limit: 1 } }),
                db.$count(schema.post),
                db.$count(schema.comment),
                db.$count(schema.user, gte(schema.user.createdAt, since)),
                db.$count(schema.organization, gte(schema.organization.createdAt, since)),
                db.$count(schema.post, gte(schema.post.createdAt, since)),
            ]);

        return json({
            totalUsers: (usersRes as { total?: number } | undefined)?.total ?? 0,
            totalOrganizations: (orgsRes as { total?: number } | undefined)?.total ?? 0,
            totalPosts,
            totalInboxMessages,
            usersThisWeek,
            organizationsThisWeek,
            postsThisWeek,
        });
    } catch (e) {
        console.error("[admin:stats] gagal:", e);
        return json({ error: "Failed to fetch stats" }, { status: 500 });
    }
});

