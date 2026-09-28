// API Team — custom role & permission granular (adaptasi reference /api/team/*).
// Role built-in better-auth tetap dipakai untuk auth inti; custom role adalah
// lapisan permission tambahan per organisasi (union dengan role built-in).

import { randomUUID } from "node:crypto";
import { db, isPermissionCode, PERMISSIONS, type PermissionCode } from "@sahabatkreator/db";
import { member, teamRole, teamRoleAssignment } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  errorResponse,
  getOrgPermissions,
  HTTPError,
  requireOrg,
  requirePermission,
} from "../lib/auth-guard";

export const teamRoute = new Hono();

const generateId = (entity: string) =>
  `sk_${entity}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

const roleInputSchema = z.object({
  name: z.string().min(2).max(30),
  description: z.string().max(200).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6366f1"),
  permissions: z.array(z.string()).default([]),
});

/** Validasi + filter permission yang tidak ada di katalog */
function sanitizePermissions(codes: string[]): PermissionCode[] {
  return codes.filter(isPermissionCode);
}

/** GET /team/permissions — katalog permission + permission effective user aktif */
teamRoute.get("/permissions", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const permissions = await getOrgPermissions(ctx);
    return c.json({
      role: ctx.organization.role,
      permissions,
      catalog: PERMISSIONS,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /team/roles — daftar custom role org aktif + jumlah assignment */
teamRoute.get("/roles", async (c) => {
  try {
    const ctx = await requirePermission(c, "team.roles");
    const roles = await db
      .select()
      .from(teamRole)
      .where(eq(teamRole.organizationId, ctx.organization.id));

    const assignments = await db
      .select({ roleId: teamRoleAssignment.roleId })
      .from(teamRoleAssignment)
      .where(eq(teamRoleAssignment.organizationId, ctx.organization.id));

    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.roleId, (counts.get(a.roleId) ?? 0) + 1);
    }

    return c.json({
      roles: roles.map((r) => ({ ...r, memberCount: counts.get(r.id) ?? 0 })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /team/roles — buat custom role baru */
teamRoute.post("/roles", async (c) => {
  try {
    const ctx = await requirePermission(c, "team.roles");
    const input = roleInputSchema.parse(await c.req.json());

    const [existing] = await db
      .select({ id: teamRole.id })
      .from(teamRole)
      .where(and(eq(teamRole.organizationId, ctx.organization.id), eq(teamRole.name, input.name)))
      .limit(1);
    if (existing) {
      throw new HTTPError(409, "Role dengan nama tersebut sudah ada");
    }

    const [role] = await db
      .insert(teamRole)
      .values({
        id: generateId("trole"),
        organizationId: ctx.organization.id,
        name: input.name,
        description: input.description ?? null,
        color: input.color,
        permissions: sanitizePermissions(input.permissions),
      })
      .returning();

    return c.json({ role: { ...role, memberCount: 0 } }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /team/roles/:id — update custom role */
teamRoute.patch("/roles/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "team.roles");
    const input = roleInputSchema.partial().parse(await c.req.json());

    const [role] = await db
      .select()
      .from(teamRole)
      .where(
        and(eq(teamRole.id, c.req.param("id")), eq(teamRole.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!role) throw new HTTPError(404, "Role tidak ditemukan");

    // Cek konflik nama bila nama diubah
    if (input.name && input.name !== role.name) {
      const [dupe] = await db
        .select({ id: teamRole.id })
        .from(teamRole)
        .where(and(eq(teamRole.organizationId, ctx.organization.id), eq(teamRole.name, input.name)))
        .limit(1);
      if (dupe) throw new HTTPError(409, "Role dengan nama tersebut sudah ada");
    }

    const [updated] = await db
      .update(teamRole)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.permissions !== undefined
          ? { permissions: sanitizePermissions(input.permissions) }
          : {}),
      })
      .where(eq(teamRole.id, role.id))
      .returning();

    return c.json({ role: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /team/roles/:id — hapus custom role (assignment ikut ter-cascade) */
teamRoute.delete("/roles/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "team.roles");
    const [role] = await db
      .select({ id: teamRole.id })
      .from(teamRole)
      .where(
        and(eq(teamRole.id, c.req.param("id")), eq(teamRole.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!role) throw new HTTPError(404, "Role tidak ditemukan");

    await db.delete(teamRole).where(eq(teamRole.id, role.id));
    return c.json({ message: "Role dihapus" });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /team/assignments — assignment custom role semua member org */
teamRoute.get("/assignments", async (c) => {
  try {
    const ctx = await requirePermission(c, "team.roles");
    const rows = await db
      .select({
        memberId: teamRoleAssignment.memberId,
        roleId: teamRoleAssignment.roleId,
        roleName: teamRole.name,
        roleColor: teamRole.color,
      })
      .from(teamRoleAssignment)
      .innerJoin(teamRole, eq(teamRoleAssignment.roleId, teamRole.id))
      .where(eq(teamRoleAssignment.organizationId, ctx.organization.id));

    return c.json({ assignments: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

const assignSchema = z.object({
  memberId: z.string().min(1),
  roleId: z.string().min(1).nullable(),
});

/** PUT /team/assignments — set/hapus custom role member (roleId null = hapus) */
teamRoute.put("/assignments", async (c) => {
  try {
    const ctx = await requirePermission(c, "team.roles");
    const input = assignSchema.parse(await c.req.json());

    // Pastikan member bagian dari org ini
    const [m] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.id, input.memberId), eq(member.organizationId, ctx.organization.id)))
      .limit(1);
    if (!m) throw new HTTPError(404, "Member tidak ditemukan");
    if (m.role === "owner") {
      throw new HTTPError(400, "Owner tidak bisa diberi custom role");
    }

    // Hapus assignment existing (satu member satu custom role)
    await db
      .delete(teamRoleAssignment)
      .where(
        and(
          eq(teamRoleAssignment.organizationId, ctx.organization.id),
          eq(teamRoleAssignment.memberId, input.memberId),
        ),
      );

    if (input.roleId) {
      const [role] = await db
        .select({ id: teamRole.id })
        .from(teamRole)
        .where(and(eq(teamRole.id, input.roleId), eq(teamRole.organizationId, ctx.organization.id)))
        .limit(1);
      if (!role) throw new HTTPError(404, "Role tidak ditemukan");

      await db.insert(teamRoleAssignment).values({
        id: generateId("trolea"),
        organizationId: ctx.organization.id,
        memberId: input.memberId,
        roleId: input.roleId,
        assignedByUserId: ctx.user.id,
      });
    }

    return c.json({ message: input.roleId ? "Role diperbarui" : "Role dihapus" });
  } catch (error) {
    return errorResponse(error);
  }
});
