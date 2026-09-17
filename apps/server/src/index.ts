import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { createOpenApiDocument, HealthResponseSchema } from "@sahabatkreator/api";
import { auth } from "@sahabatkreator/auth";
import { env } from "@sahabatkreator/env/server";
import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { globalApiRateLimit } from "./lib/rate-limit";

// Hostname staging → response header X-Robots-Tag: noindex (sebelum JS SPA render)
const STAGING_NOINDEX_HOSTS = new Set([
  "app.sahabatkreator.com",
  "staging.sahabatkreator.com",
  "dev.sahabatkreator.com",
  "preview.sahabatkreator.com",
]);
const NOINDEX_HEADER = "noindex, nofollow, noarchive, nosnippet";
// Static web dist — dua kandidat lokasi:
// 1. apps/server/web-dist  → deploy Docker (disalin dari apps/web/dist saat build image)
// 2. apps/web/dist         → dev / build lokal (server jalan dari src/ atau dist/)
const WEB_DIST_CANDIDATES = [
  resolve(__dirname, "../web-dist"),
  resolve(__dirname, "../../web/dist"),
];

import { accountsRoute } from "./routes/accounts";
import { activityRoute } from "./routes/activity";
import { adminRoute } from "./routes/admin";
import { apiAccessRoute } from "./routes/admin-api-access";
import { apiTestsRoute } from "./routes/admin-api-tests";
import { monitoringRoute } from "./routes/admin-monitoring";
import { aiRoute } from "./routes/ai";
import { analyticsRoute } from "./routes/analytics";
import { automationRoute } from "./routes/automation";
import { billingRoute } from "./routes/billing";
import { blogRoute, buildBlogSitemapXml } from "./routes/blog";
import { calendarRoute } from "./routes/calendar";
import { coachRoute } from "./routes/coach";
import { collabsRoute } from "./routes/collabs";
import { commerceRoute } from "./routes/commerce";
import { competitorRoute } from "./routes/competitor";
import { contactRoute } from "./routes/contact";
import { dataDeletionRoute } from "./routes/data-deletion";
import { dmRoute } from "./routes/dm";
import { engagementRoute } from "./routes/engagement";
import { goalRoute } from "./routes/goal";
import { holidayRoute } from "./routes/holiday";
import { csvImportRoute } from "./routes/import";
import { listeningRoute } from "./routes/listening";
import { meRoute } from "./routes/me";
import { mediaRoute } from "./routes/media";
import { notificationsRoute } from "./routes/notifications";
import { oauthRoute } from "./routes/oauth";
import { postsRoute } from "./routes/posts";
import { pushRoute } from "./routes/push";
import { reportRoute } from "./routes/report";
import { sebRoute } from "./routes/seb";
import { soundRoute } from "./routes/sound";
import { statusRoute } from "./routes/status";
import { statusPublicRoute } from "./routes/status-public";
import { strategyRoute } from "./routes/strategy";
import { teamRoute } from "./routes/team";
import { trendsRoute } from "./routes/trends";
import { userRoute } from "./routes/user";
import { webhookRoute } from "./routes/webhook";
import { platformWebhookRoute } from "./routes/webhook-platform";

const app = new Hono();

app.use(logger());

// Batas body request — upload media multipart max 100MB (+ overhead form-data),
// JSON API biasanya jauh di bawah ini. Mencegah abuse memori.
app.use("/*", bodyLimit({ maxSize: 110 * 1024 * 1024 }));

// Secure headers HARUS terpasang sebelum middleware lain (termasuk cors)
// agar setiap respons — termasuk error dari middleware berikutnya — tetap
// membawa header keamanan: X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy, Strict-Transport-Security, CORP, COOP, dst.
app.use("/*", secureHeaders());

// --- Staging noindex HTTP header (sebelum SPA render, bot Google langsung lihat) ---
app.use("/*", async (c, next) => {
  await next();
  const host = c.req.header("host") ?? "";
  const hostname = host.split(":")[0] ?? "";
  if (STAGING_NOINDEX_HOSTS.has(hostname)) {
    c.res.headers.set("X-Robots-Tag", NOINDEX_HEADER);
    c.res.headers.set("X-Sahabat-Kreator-Env", "staging");
  } else {
    c.res.headers.set("X-Sahabat-Kreator-Env", "production");
  }
});

app.use(
  "/*",
  cors({
    origin: [env.CORS_ORIGIN, env.WEB_URL],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Better Auth handler (semua endpoint /api/auth/*)
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Rate limit global API: 100 req / 60s per IP+user (in-memory).
// /api/auth/* di-skip di dalam middleware — better-auth membatasi sendiri.
app.use("/api/*", globalApiRateLimit);

// API routes
const api = new Hono();
api.route("/me", meRoute);
api.route("/user", userRoute);
api.route("/activity", activityRoute);
api.route("/posts", postsRoute);
api.route("/calendar", calendarRoute);
api.route("/media", mediaRoute);
api.route("/accounts", accountsRoute);
api.route("/accounts", collabsRoute);
api.route("/analytics", analyticsRoute);
api.route("/engagement", engagementRoute);
api.route("/dm", dmRoute);
api.route("/push", pushRoute);
api.route("/automation", automationRoute);
api.route("/sound", soundRoute);
api.route("/commerce", commerceRoute);
api.route("/holiday", holidayRoute);
api.route("/billing", billingRoute);
api.route("/blog", blogRoute);
api.route("/admin", adminRoute);
api.route("/admin/api-access", apiAccessRoute);
api.route("/admin/api-tests", apiTestsRoute);
api.route("/admin/monitoring", monitoringRoute);
api.route("/ai", aiRoute);
api.route("/contact", contactRoute);
api.route("/oauth", oauthRoute);
api.route("/strategy", strategyRoute);
api.route("/notifications", notificationsRoute);
api.route("/trends", trendsRoute);
api.route("/coach", coachRoute);
api.route("/listening", listeningRoute);
api.route("/competitors", competitorRoute);
api.route("/import", csvImportRoute);
api.route("/goals", goalRoute);
api.route("/reports", reportRoute);
api.route("/seb", sebRoute);
api.route("/team", teamRoute);
api.route("/status", statusRoute);
api.route("/status-public", statusPublicRoute);
app.route("/api", api);

// Webhook (di luar /api agar path pendek: /webhooks/sumopod)
app.route("/", webhookRoute);
app.route("/", platformWebhookRoute);
// Data deletion callback (syarat App Review Meta/IG/Threads)
app.route("/", dataDeletionRoute);

// Sitemap blog dinamis — endpoint root agar crawler bisa akses /sitemap-blog.xml.
// Staging host → 404: sitemap hanya untuk produksi, staging tidak boleh
// mengekspos struktur URL-nya ke crawler.
app.get("/sitemap-blog.xml", async (c) => {
  const host = c.req.header("host") ?? "";
  const hostname = host.split(":")[0] ?? "";
  if (STAGING_NOINDEX_HOSTS.has(hostname)) return c.text("Not Found", 404);

  const xml = await buildBlogSitemapXml();
  return c.body(xml, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  });
});

// ---------- 301 redirect path lama → path baru ----------
// Server-side permanen agar link equity/backlink tersimpan (client-side
// Navigate di router.tsx hanya menyelamatkan pengguna, bukan SEO).
const LEGACY_REDIRECTS: Record<string, string> = {
  "/pricing": "/harga",
  "/terms": "/syarat-ketentuan",
  "/privacy": "/kebijakan-privasi",
  "/about": "/tentang",
  "/bulan": "/blog",
  // Nav Intelijen lama → hub bertab (halaman dashboard noindex, redirect cukup
  // menyelamatkan bookmark/history browser)
  "/analytics": "/performance/analitik",
  "/reports": "/performance/laporan",
  "/goals": "/performance/goal",
  "/listening": "/research/listening",
  "/competitors": "/research/kompetitor",
  "/trends": "/research/tren",
  "/coach": "/assistant/coach",
  "/seb": "/assistant/seb",
  "/strategy": "/assistant/strategi",
  "/grid": "/calendar",
};
app.get("/*", async (c, next) => {
  const path = c.req.path.replace(/\/+$/, "") || "/";
  const target = LEGACY_REDIRECTS[path];
  if (target) return c.redirect(target, 301);
  await next();
});

// OpenAPI docs
const openApiApp = new OpenAPIHono();

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  responses: {
    200: {
      description: "Service health",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

openApiApp.openapi(healthRoute, (c) => {
  return c.json({ status: "ok" as const });
});

openApiApp.doc("/openapi.json", createOpenApiDocument());
openApiApp.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
app.route("/", openApiApp);

// ---------- Static web (SPA) + fallback ke index.html untuk client-side routing ----------
// Hanya aktif jika folder web dist ada (Docker build / build lokal).
// Di dev, vite dev server (port 5173) handle static file sendiri.
const WEB_DIST_DIR = WEB_DIST_CANDIDATES.find((dir) => existsSync(dir));
if (WEB_DIST_DIR) {
  // Bun serve-static with SPA fallback (rewrite not-found → /index.html)
  app.get(
    "/*",
    serveStatic({
      root: WEB_DIST_DIR,
      rewriteRequestPath(path) {
        // Skip path yang jelas milik API / sitemap / webhook / openapi
        if (
          path.startsWith("/api/") ||
          path === "/sitemap-blog.xml" ||
          path.startsWith("/webhooks/") ||
          path.startsWith("/openapi.") ||
          path === "/health" ||
          path === "/docs" ||
          path.startsWith("/auth/") ||
          path.startsWith("/oauth/") ||
          path.startsWith("/login/") ||
          path.startsWith("/r/") ||
          path.startsWith("/team/") ||
          path.startsWith("/post-failed") ||
          path.startsWith("/publish-ready")
        ) {
          return path;
        }
        // Untuk path non-file (tidak ada extension) → fallback ke index.html SPA.
        // Batas 12 karakter agar ".webmanifest" (11) ikut terdeteksi sebagai file
        // — sebelumnya {1,6} membuat /manifest.webmanifest jatuh ke fallback SPA.
        const hasExt = /\.[A-Za-z0-9]{1,12}$/.test(path);
        if (hasExt) return path;
        return "/index.html";
      },
    }),
  );
} else {
  // Fallback jika web dist belum ter-build
  app.get("/", (c) => c.text("Sahabat Kreator API (build web dist belum tersedia)"));
}

const port = Number(process.env.PORT ?? 3000);
export default {
  port,
  fetch: app.fetch,
};
