// Penjaga agar daftar platform di dokumen Public API (PlatformEnum, dipakai
// /v1/openapi.json + input schema MCP) tidak drift dari platform yang
// BENAR-BENAR didukung aplikasi (PLATFORMS). Dulu PlatformEnum memuat "x"
// (tidak ada adapternya) dan tidak memuat instagram_standalone / bluesky /
// google_business — developer luar melihat enum yang menjanjikan platform
// yang tidak bisa dihubungkan.
//
// `manual` dikecualikan: itu akun reminder-only, bukan platform publish.
import { PlatformEnum } from "@sahabatkreator/api/public-api/common";
import { describe, expect, it } from "vitest";
import { PLATFORMS } from "./platforms";

describe("PlatformEnum vs PLATFORMS", () => {
  it("enum persis berisi platform yang didukung (minus manual)", () => {
    const supported = Object.keys(PLATFORMS).filter((key) => key !== "manual");

    expect([...PlatformEnum.options].sort()).toEqual([...supported].sort());
  });
});
