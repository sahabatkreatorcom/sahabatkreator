// Penentuan partner (pihak lawan bicara) untuk DM Meta (Instagram/Facebook).
//
// Dipisah ke modul sendiri tanpa dependensi agar mudah diuji murni — logikanya
// pernah salah dan menyebabkan balasan terkirim ke akun sendiri (Meta menolak
// dengan "Pengguna yang diminta tidak dapat ditemukan").

export type MetaDMParticipant = {
  id: string;
  username?: string | null;
  name?: string | null;
  profile_pic?: string | null;
};

export type MetaDMPartner = {
  id: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
};

/**
 * Tentukan partner dari satu conversation Meta.
 *
 * Aturan:
 * 1. Utamakan participant yang BUKAN akun kita (IG id / Page id).
 * 2. Kalau `participants` hanya memuat akun sendiri — terjadi pada Instagram
 *    standalone, di mana Graph API tidak mengembalikan participant lawan —
 *    pakai pengirim pesan inbound pertama.
 *
 * Tidak ada fallback ke `participants[0]`: pada Instagram standalone entri itu
 * adalah akun sendiri, sehingga partner_id = id sendiri dan balasan terkirim ke
 * diri sendiri → Meta menolak.
 *
 * Return null bila lawan bicara tidak bisa ditentukan (mis. semua pesan keluar).
 */
export function resolveMetaDMPartner(input: {
  participants: MetaDMParticipant[];
  messages: Array<{
    direction: "inbound" | "outbound";
    senderId: string | null;
    senderUsername: string | null;
  }>;
  selfIds: Set<string>;
}): MetaDMPartner | null {
  const { participants, messages, selfIds } = input;
  const other = participants.find((p) => !selfIds.has(p.id));
  // `direction` dihitung dari senderId, tapi tetap saring `selfIds` di sini agar
  // helper ini tidak pernah mengembalikan akun sendiri walau input tidak konsisten.
  const inboundFrom = messages.find(
    (m) => m.direction === "inbound" && m.senderId && !selfIds.has(m.senderId),
  );
  const partnerId = other?.id ?? inboundFrom?.senderId ?? null;
  if (!partnerId) return null;
  // Metadata tampilan: pakai entri participant bila ada, fallback ke pengirim
  // pesan inbound (Instagram standalone tidak menyertakan nama di participant).
  const partnerMeta = participants.find((p) => p.id === partnerId);
  return {
    id: partnerId,
    username: partnerMeta?.username ?? inboundFrom?.senderUsername ?? null,
    name: partnerMeta?.name ?? null,
    avatarUrl: partnerMeta?.profile_pic ?? null,
  };
}
