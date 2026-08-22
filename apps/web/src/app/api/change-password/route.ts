import { NextRequest, NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { db, schema } from "@sahabat-kreator/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/api";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + process.env.HASH_SALT || "sahabatkreator-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const hashed = await hashPassword(password);
  return hashed === storedHash;
}

/**
 * POST /api/change-password
 * Body: { currentPassword, newPassword }
 */

export async function POST(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }

    if (newPassword.length < 8) {
        return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    try {
        // Get user account with password hash
        const account = await db.query.account.findFirst({
            where: eq(schema.account.userId, ctx.session.user.id),
            columns: { id: true, password: true, userId: true },
        });

        if (!account || !account.password) {
            return NextResponse.json({ error: "Account not found or no password set" }, { status: 404 });
        }

        // Verify current password
        const isValid = await verifyPassword(currentPassword, account.password);
        if (!isValid) {
            return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
        }

        // Hash new password
        const hashedPassword = await hashPassword(newPassword);

        // Update password in account table
        await db.update(schema.account)
            .set({ password: hashedPassword, updatedAt: new Date() })
            .where(eq(schema.account.id, account.id));

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
