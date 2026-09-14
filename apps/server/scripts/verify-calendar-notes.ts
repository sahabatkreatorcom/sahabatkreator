// E2E verifikasi calendar notes — CRUD note berwarna (title/content/color).
// Jalankan: bun scripts/verify-calendar-notes.ts (dari apps/server)

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { calendarNote, organization } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("FAIL — tidak ada organization di DB");
    process.exit(1);
  }

  const noteId = generateId("note");
  const date = new Date(Date.now() + 3 * 86400000);

  // Insert (simulasi POST /calendar/notes)
  await db.insert(calendarNote).values({
    id: noteId,
    organizationId: org.id,
    date,
    title: "Ide konten Ramadan",
    content: "Seri resep takjilan 7 hari",
    color: "#f59e0b",
  });

  const fetched = await db
    .select()
    .from(calendarNote)
    .where(and(eq(calendarNote.id, noteId), eq(calendarNote.organizationId, org.id)));
  pass(
    "insert note lengkap",
    fetched.length === 1 &&
      fetched[0]?.title === "Ide konten Ramadan" &&
      fetched[0]?.content === "Seri resep takjilan 7 hari" &&
      fetched[0]?.color === "#f59e0b",
    "title + content + color tersimpan",
  );

  // Patch (simulasi PATCH /calendar/notes/:id)
  await db
    .update(calendarNote)
    .set({ title: "Ide konten Ramadan (revisi)", color: "#3b82f6" })
    .where(eq(calendarNote.id, noteId));
  const patched = await db.select().from(calendarNote).where(eq(calendarNote.id, noteId));
  pass(
    "patch title + color",
    patched[0]?.title === "Ide konten Ramadan (revisi)" && patched[0]?.color === "#3b82f6",
    "ter-update",
  );

  // Cleanup
  await db.delete(calendarNote).where(eq(calendarNote.id, noteId));
  const remaining = await db
    .select({ id: calendarNote.id })
    .from(calendarNote)
    .where(eq(calendarNote.id, noteId));
  pass("cleanup", remaining.length === 0, "note test dihapus");

  console.log("\nSelesai.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
