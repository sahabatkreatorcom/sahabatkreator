// API Me — session user + organizations + limits untuk shell web

import { db } from "@sahabatkreator/db";
import { member, organization, user as userTable } from "@sahabatkreator/db/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, getAuthContext } from "../lib/auth-guard";
import { getOrgLimits } from "../lib/billing";

export const meRoute = new Hono();

/** GET /me — user + org aktif + daftar org (untuk org switcher) + limits */
meRoute.get("/", async (c) => {
  try {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ authenticated: false }, 401);

    // Ambil flag 2FA terbaru dari tabel user
    const [userRow] = await db
      .select({ twoFactorEnabled: userTable.twoFactorEnabled })
      .from(userTable)
      .where(eq(userTable.id, ctx.user.id))
      .limit(1);

    // Daftar semua org tempat user jadi member (untuk org switcher)
    const memberships = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, ctx.user.id));

    const limits = ctx.organization ? await getOrgLimits(ctx.organization.id) : null;

    return c.json({
      authenticated: true,
      user: {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        emailVerified: ctx.user.emailVerified,
        image: ctx.user.image,
        role: ctx.user.role,
        twoFactorEnabled: userRow?.twoFactorEnabled ?? false,
      },
      organization: ctx.organization,
      organizations: memberships,
      limits,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
