// Live check endpoint baru — pastikan route terdaftar & merespon (401 = auth OK, bukan 404)
const BASE = "http://localhost:3000";
const endpoints = [
  "/api/push/vapid",
  "/api/push/subscriptions",
  "/api/push/settings",
  "/api/automation",
  "/api/sound",
  "/api/commerce/products",
  "/api/commerce/tags",
  "/api/dm",
  "/api/dm/unread-count",
  "/api/notifications",
  "/health",
];

let failed = 0;
for (const ep of endpoints) {
  try {
    const res = await fetch(`${BASE}${ep}`);
    const ok = res.status !== 404;
    const label = ok
      ? res.status === 401
        ? "401 (auth gate OK)"
        : String(res.status)
      : "404 NOT FOUND";
    console.log(`${ok ? "OK " : "FAIL"} ${ep} → ${label}`);
    if (!ok) failed++;
  } catch (err) {
    console.log(`FAIL ${ep} → ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}
process.exit(failed > 0 ? 1 : 0);
