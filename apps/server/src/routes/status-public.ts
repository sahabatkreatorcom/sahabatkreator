// API Status publik — ringkasan kesehatan platform tanpa auth (untuk link /status publik).
// Tidak mengekspos data org apa pun — hanya status platform + overall.
import { getPlatformHealth, overallStatus } from "@sahabatkreator/publishing";
import { Hono } from "hono";

export const statusPublicRoute = new Hono();

/** GET /status-public — status kesehatan platform (publik, tanpa data org) */
statusPublicRoute.get("/", async (c) => {
  const platforms = await getPlatformHealth();
  return c.json({
    overall: overallStatus(platforms),
    platforms: platforms.map((p) => ({
      platform: p.platform,
      label: p.label,
      status: p.status,
      message: p.status === "operational" ? null : p.message,
      checkedAt: p.checkedAt,
    })),
    timestamp: new Date().toISOString(),
  });
});
