import { describe, expect, it } from "vitest";
import { resolveMetaDMPartner } from "./dm-partner";

/** Akun kita sendiri (IG standalone: platform_account_id akun IG). */
const SELF_IG = "17841402278755050";
const SELF_PAGE = "101234567890123";

const inbound = (senderId: string, senderUsername: string | null = null) => ({
  direction: "inbound" as const,
  senderId,
  senderUsername,
});
const outbound = (senderId: string) => ({
  direction: "outbound" as const,
  senderId,
  senderUsername: null,
});

describe("resolveMetaDMPartner", () => {
  it("memakai participant yang bukan akun sendiri (IG via Facebook Login)", () => {
    const partner = resolveMetaDMPartner({
      participants: [
        { id: SELF_PAGE, name: "SHD Store" },
        { id: "4543044449355712", username: "nurevani", name: "Nurevani" },
      ],
      messages: [inbound("4543044449355712", "nurevani")],
      selfIds: new Set([SELF_IG, SELF_PAGE]),
    });
    expect(partner).toEqual({
      id: "4543044449355712",
      username: "nurevani",
      name: "Nurevani",
      avatarUrl: null,
    });
  });

  it("Instagram standalone: participants hanya akun sendiri → pakai pengirim inbound", () => {
    const partner = resolveMetaDMPartner({
      participants: [{ id: SELF_IG, username: "englishboostermalang" }],
      messages: [inbound("4543044449355712", "nurevani"), outbound(SELF_IG)],
      selfIds: new Set([SELF_IG]),
    });
    // Bukan SELF_IG — inilah bug yang membuat balasan terkirim ke diri sendiri.
    expect(partner?.id).toBe("4543044449355712");
    expect(partner?.username).toBe("nurevani");
  });

  it("tidak pernah mengembalikan akun sendiri sebagai partner", () => {
    const partner = resolveMetaDMPartner({
      participants: [{ id: SELF_IG }, { id: SELF_IG }],
      messages: [inbound(SELF_IG)],
      selfIds: new Set([SELF_IG]),
    });
    expect(partner).toBeNull();
  });

  it("mengembalikan null bila hanya ada pesan keluar (lawan belum diketahui)", () => {
    const partner = resolveMetaDMPartner({
      participants: [{ id: SELF_IG }],
      messages: [outbound(SELF_IG)],
      selfIds: new Set([SELF_IG]),
    });
    expect(partner).toBeNull();
  });

  it("memakai pengirim inbound pertama bila ada beberapa", () => {
    const partner = resolveMetaDMPartner({
      participants: [{ id: SELF_IG }],
      messages: [outbound(SELF_IG), inbound("111"), inbound("222")],
      selfIds: new Set([SELF_IG]),
    });
    expect(partner?.id).toBe("111");
  });

  it("melengkapi avatar dari participant bila tersedia", () => {
    const partner = resolveMetaDMPartner({
      participants: [
        { id: SELF_IG },
        { id: "999", username: "budi", name: "Budi", profile_pic: "https://img/1.jpg" },
      ],
      messages: [inbound("999", "budi")],
      selfIds: new Set([SELF_IG]),
    });
    expect(partner?.avatarUrl).toBe("https://img/1.jpg");
  });
});
