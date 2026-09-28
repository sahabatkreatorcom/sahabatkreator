// Regresi batas body: dulu bodyLimit 110MB dipasang global — semua route JSON ikut
// menerima body raksasa. Sekarang hanya path upload multipart yang dapat jatah
// besar. Test ini memastikan pemilihan limit berdasarkan path benar DAN bahwa
// clip/video route (JSON, reference media via id) tetap dibatasi.
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { JSON_MAX, LARGE_UPLOAD_PATHS, UPLOAD_MAX, uploadAwareBodyLimit } from "./body-limit";

/** App mini yang hanya memasang middleware ini + 2 handler dummy (tidak import app
 * penuh: tidak butuh DB/auth, hanya perilaku limit per-path). */
function makeApp() {
  const app = new Hono();
  app.use("/*", uploadAwareBodyLimit());
  app.post("/api/media/upload", (c) => c.json({ ok: true }));
  app.post("/api/posts", (c) => c.json({ ok: true }));
  return app;
}

/** Body sedikit di atas JSON_MAX — content-length dipakai hono untuk fast-path reject,
 * jadi tidak benar-benar dibaca seluruhnya (test tetap cepat & ringan memori). */
function oversizedForJson(): ArrayBuffer {
  return new ArrayBuffer(JSON_MAX + 1024);
}

describe("uploadAwareBodyLimit", () => {
  it("path upload multipart: body di atas JSON_MAX tetap diterima", async () => {
    const res = await makeApp().request("/api/media/upload", {
      method: "POST",
      body: oversizedForJson(),
    });
    expect(res.status).toBe(200);
  });

  it("path JSON biasa: body di atas JSON_MAX ditolak 413", async () => {
    const res = await makeApp().request("/api/posts", {
      method: "POST",
      body: oversizedForJson(),
    });
    expect(res.status).toBe(413);
  });

  it("path JSON biasa: body di bawah limit diterima", async () => {
    const res = await makeApp().request("/api/posts", {
      method: "POST",
      body: "payload kecil",
    });
    expect(res.status).toBe(200);
  });

  it("GET (tanpa body) tidak terkena limit", async () => {
    const app = makeApp();
    app.get("/api/posts", (c) => c.json({ ok: true }));
    const res = await app.request("/api/posts");
    expect(res.status).toBe(200);
  });

  it("daftar path upload mencakup route yang butuh multipart besar", () => {
    // Clip flow: byte video besar naik via /api/media/upload (bukan /api/auto-clip
    // atau /api/video yang hanya JSON). Tambah path multipart baru = update list ini.
    expect(LARGE_UPLOAD_PATHS.has("/api/media/upload")).toBe(true);
    expect(LARGE_UPLOAD_PATHS.has("/api/sound/upload")).toBe(true);
    expect(LARGE_UPLOAD_PATHS.has("/api/admin/holidays/import")).toBe(true);
    // route clip video TIDAK boleh menerima multipart besar
    expect(LARGE_UPLOAD_PATHS.has("/api/auto-clip")).toBe(false);
    expect(LARGE_UPLOAD_PATHS.has("/api/video")).toBe(false);
  });

  it("UPLOAD_MAX tetap 110MB (100MB file + overhead form-data)", () => {
    expect(UPLOAD_MAX).toBe(110 * 1024 * 1024);
    expect(JSON_MAX).toBe(10 * 1024 * 1024);
  });
});
