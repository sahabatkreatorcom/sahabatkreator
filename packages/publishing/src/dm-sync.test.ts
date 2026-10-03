import { describe, expect, it } from "vitest";
import { resolveMetaDMPartner, resolveSelfIds } from "./dm-partner";

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

/**
 * Kasus nyata Instagram Login (`instagram_standalone`): id akun dari `GET /me`
 * (app-scoped) berbeda dari id IG Business Account yang muncul di participants.
 */
describe("resolveSelfIds + resolveMetaDMPartner (Instagram Login)", () => {
  const SELF_APP_SCOPED = "29064425919829474"; // platform_account_id tersimpan
  const SELF_IGBA = "17841402278755050"; // id yang muncul di participants
  const COUNTERPARTY = "4543044449355712"; // nurevani

  const participants = [
    { id: SELF_IGBA, username: "englishboostermalang" },
    { id: COUNTERPARTY, username: "nurevani" },
  ];

  it("resolveSelfIds mengenali akun sendiri walau id-nya berbeda", () => {
    const ids = resolveSelfIds({
      participants,
      selfIds: new Set([SELF_APP_SCOPED]),
      selfUsername: "englishboostermalang",
    });
    expect(ids.has(SELF_IGBA)).toBe(true);
    expect(ids.has(COUNTERPARTY)).toBe(false);
  });

  it("partner = lawan bicara, bukan akun sendiri", () => {
    const ids = resolveSelfIds({
      participants,
      selfIds: new Set([SELF_APP_SCOPED]),
      selfUsername: "englishboostermalang",
    });
    const partner = resolveMetaDMPartner({
      participants,
      messages: [
        { direction: "outbound", senderId: SELF_IGBA, senderUsername: "englishboostermalang" },
        inbound(COUNTERPARTY, "nurevani"),
      ],
      selfIds: ids,
    });
    expect(partner?.id).toBe(COUNTERPARTY);
    expect(partner?.username).toBe("nurevani");
  });

  it("tanpa perluasan selfIds, partner keliru jadi akun sendiri (regresi)", () => {
    const partner = resolveMetaDMPartner({
      participants,
      messages: [inbound(COUNTERPARTY, "nurevani")],
      selfIds: new Set([SELF_APP_SCOPED]),
    });
    expect(partner?.id).toBe(SELF_IGBA);
  });

  it("cocok walau username akun memakai awalan @ / beda kapitalisasi", () => {
    const ids = resolveSelfIds({
      participants: [{ id: "1", username: "@EnglishBoosterMalang" }],
      selfIds: new Set(),
      selfUsername: "englishboostermalang",
    });
    expect(ids.has("1")).toBe(true);
  });

  it("tanpa username akun, selfIds tidak diperluas", () => {
    const ids = resolveSelfIds({
      participants: [{ id: "1", username: "englishboostermalang" }],
      selfIds: new Set(["9"]),
      selfUsername: null,
    });
    expect([...ids]).toEqual(["9"]);
  });
});
