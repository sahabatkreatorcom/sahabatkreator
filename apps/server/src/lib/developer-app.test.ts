// Test validasi allowlist redirect — gerbang anti open-redirect jalur API
// connect akun (RFC rfc-oauth-connect.md §7). Fungsi murni: tanpa DB, tanpa HTTP.
//
// Yang dijaga di sini bukan hanya "URI di luar allowlist ditolak", tapi juga
// bahwa pencocokannya PERSIS — prefix match akan meloloskan app.dev.evil.com.
import { describe, expect, it } from "vitest";
import { HTTPError } from "./auth-guard";
import {
  assertAllowedRedirect,
  buildRedirectUrl,
  type DeveloperApp,
  validateRedirectUri,
} from "./developer-app";

const APP: DeveloperApp = {
  id: "devapp_1",
  name: "Contoh",
  allowedRedirectUris: [
    "https://app.dev/callback",
    "https://app.dev/callback?lang=id",
    "http://localhost:3000/callback",
  ],
};

/** Ambil HTTPError yang dilempar, gagal bila ternyata tidak melempar. */
function catchHttpError(fn: () => unknown): HTTPError {
  try {
    fn();
  } catch (error) {
    if (error instanceof HTTPError) return error;
    throw error;
  }
  throw new Error("seharusnya melempar HTTPError, tapi tidak");
}

describe("assertAllowedRedirect — yang diterima", () => {
  it("URI yang terdaftar persis dikembalikan apa adanya", () => {
    expect(assertAllowedRedirect(APP, "https://app.dev/callback")).toBe("https://app.dev/callback");
  });

  it("URI dengan query terdaftar diterima (bukan dipotong)", () => {
    expect(assertAllowedRedirect(APP, "https://app.dev/callback?lang=id")).toBe(
      "https://app.dev/callback?lang=id",
    );
  });

  it("http diterima HANYA untuk loopback (developer menguji di mesin sendiri)", () => {
    expect(assertAllowedRedirect(APP, "http://localhost:3000/callback")).toBe(
      "http://localhost:3000/callback",
    );
  });
});

describe("assertAllowedRedirect — open redirect ditolak", () => {
  it("URI di luar allowlist ditolak", () => {
    const err = catchHttpError(() => assertAllowedRedirect(APP, "https://jahat.example/cb"));
    expect(err.status).toBe(400);
  });

  it("prefix allowlist tidak boleh meloloskan subdomain penyerang", () => {
    // Inilah alasan pencocokan dilakukan persis, bukan startsWith:
    // "https://app.dev" sebagai prefix akan meloloskan host ini.
    const err = catchHttpError(() =>
      assertAllowedRedirect(APP, "https://app.dev.evil.com/callback"),
    );
    expect(err.status).toBe(400);
  });

  it("path tambahan setelah URI terdaftar ditolak (bukan prefix match)", () => {
    const err = catchHttpError(() =>
      assertAllowedRedirect(APP, "https://app.dev/callback/../evil"),
    );
    expect(err.status).toBe(400);
  });

  it("port default eksplisit tidak disetarakan dengan bentuk terdaftar", () => {
    const err = catchHttpError(() => assertAllowedRedirect(APP, "https://app.dev:443/callback"));
    expect(err.status).toBe(400);
  });

  it("skema yang dieksekusi browser ditolak", () => {
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
    ]) {
      const err = catchHttpError(() => assertAllowedRedirect(APP, uri));
      expect(err.status).toBe(400);
    }
  });

  it("http ke host non-loopback ditolak walau terdaftar di allowlist", () => {
    // Pertahanan berlapis: allowlist bisa saja salah diisi admin, tapi skema
    // http ke internet tetap tidak boleh dipakai untuk menerima code.
    const app: DeveloperApp = {
      id: "devapp_2",
      name: "Salah isi",
      allowedRedirectUris: ["http://app.example/callback"],
    };
    const err = catchHttpError(() => assertAllowedRedirect(app, "http://app.example/callback"));
    expect(err.status).toBe(400);
  });

  it("fragment ditolak (akan menelan ?code=…&state=…)", () => {
    const app: DeveloperApp = {
      id: "devapp_3",
      name: "Fragment",
      allowedRedirectUris: ["https://app.dev/callback#section"],
    };
    const err = catchHttpError(() =>
      assertAllowedRedirect(app, "https://app.dev/callback#section"),
    );
    expect(err.status).toBe(400);
  });

  it("URL relatif / bukan URL absolut ditolak", () => {
    for (const uri of ["/callback", "app.dev/callback", ""]) {
      const err = catchHttpError(() => assertAllowedRedirect(APP, uri));
      expect(err.status).toBe(400);
    }
  });
});

describe("buildRedirectUrl", () => {
  it("menambahkan code & state ke URI polos", () => {
    expect(buildRedirectUrl("https://app.dev/cb", { code: "abc", state: "st1" })).toBe(
      "https://app.dev/cb?code=abc&state=st1",
    );
  });

  it("mempertahankan query yang sudah ada (tidak jadi ?a=1?code=…)", () => {
    expect(buildRedirectUrl("https://app.dev/cb?lang=id", { code: "abc", state: "st1" })).toBe(
      "https://app.dev/cb?lang=id&code=abc&state=st1",
    );
  });

  it("meng-encode nilai yang punya karakter khusus", () => {
    const url = buildRedirectUrl("https://app.dev/cb", { state: "a b&c=d" });
    expect(url).toBe("https://app.dev/cb?state=a+b%26c%3Dd");
  });

  it("menimpa param dengan nama sama alih-alih menduplikasinya", () => {
    expect(buildRedirectUrl("https://app.dev/cb?code=lama", { code: "baru" })).toBe(
      "https://app.dev/cb?code=baru",
    );
  });
});

// Dipakai DUA tempat: `assertAllowedRedirect` (saat request masuk) dan
// pendaftaran allowlist lewat `POST /api/developer-apps`. Kalau keduanya tidak
// sepakat, developer bisa mendaftar sukses lalu setiap `authorize` gagal.
describe("validateRedirectUri — bentuk URI saat PENDAFTARAN", () => {
  it("menerima https apa pun (belum dicek keanggotaan allowlist)", () => {
    expect(validateRedirectUri("https://baru.dev/cb")).toBe("https://baru.dev/cb");
  });

  it("menerima http hanya untuk loopback", () => {
    expect(validateRedirectUri("http://localhost:4000/cb")).toBe("http://localhost:4000/cb");
    expect(catchHttpError(() => validateRedirectUri("http://baru.dev/cb")).status).toBe(400);
  });

  it("menolak skema yang dieksekusi browser", () => {
    for (const raw of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd"]) {
      expect(catchHttpError(() => validateRedirectUri(raw)).status).toBe(400);
    }
  });

  it("menolak URI relatif dan yang ber-fragment", () => {
    expect(catchHttpError(() => validateRedirectUri("/cb")).status).toBe(400);
    expect(catchHttpError(() => validateRedirectUri("https://app.dev/cb#x")).status).toBe(400);
  });
});
