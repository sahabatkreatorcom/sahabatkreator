/**
 * Mengisi DATA CONTOH di akun demo supaya halaman dokumentasi tidak kosong.
 *
 * Kenapa perlu: dua halaman /panduan menampilkan keadaan kosong secara bawaan —
 *
 *   • Automation      → "Belum ada rule" — tanpa satu pun rule, tangkapan
 *                       layarnya tidak menjelaskan fitur apa pun.
 *   • Social Listening → ringkasan nol, tanpa monitor dan tanpa hasil.
 *
 * Isi di sini sengaja memakai data yang sama dengan yang dipakai halaman lain
 * (istilah kuliner/retail, bukan nama orang), supaya seluruh dokumentasi terbaca
 * sebagai satu contoh usaha yang konsisten. Semuanya FIKTIF — tidak ada satu pun
 * nilai yang diambil dari akun nyata.
 *
 * Skrip ini idempoten: dijalankan dua kali tidak menggandakan apa pun. Rule dan
 * monitor dicek lewat namanya lebih dulu; hasil listening dihapus per monitor
 * supaya sync berikutnya menulis ulang tanpa duplikat.
 *
 * Cara pakai (dipanggil otomatis oleh `docs:fixtures:record` bila
 * DOCS_FIXTURE_PREP=1):
 *   DOCS_SHOT_EMAIL=... DOCS_SHOT_PASSWORD=... DOCS_FIXTURE_PREP=1 \
 *     bun run docs:fixtures:record
 *
 * ⚠️ Menulis ke organisasi DEMO di produksi. Aman diulang, tapi jangan
 *    dijalankan terhadap organisasi pelanggan sungguhan.
 */
import type { Page } from "playwright";

/** Nilai fiktif — semuanya dipakai apa adanya, jadi sengaja bukan data nyata. */
export const SAMPLE_RULES = [
  {
    name: "Balas pertanyaan harga",
    description:
      "Menjawab otomatis pertanyaan harga yang paling sering masuk lewat DM, supaya tidak menumpuk di luar jam kerja.",
    source: "dm" as const,
    triggers: ["harga", "berapa", "price list", "brp"],
    action: {
      type: "reply" as const,
      message:
        "Hai {{name}}! Terima kasih sudah bertanya 🙏 Daftar harga lengkap ada di link bio ya. Kalau mau tanya paket lain, balas pesan ini saja.",
    },
    isActive: true,
  },
  {
    name: "Arahkan komentar promo",
    description:
      "Komentar yang menanyakan promo diarahkan ke DM supaya detail pesanan tidak terbuka di kolom komentar.",
    source: "comment" as const,
    triggers: ["promo", "diskon", "potongan", "kode"],
    action: {
      type: "reply" as const,
      message:
        "Halo! Promo bulan ini masih jalan. Detailnya kami kirim lewat DM ya, cek pesan masuk 🙌",
    },
    isActive: true,
  },
  {
    name: "Draft balasan pertanyaan pengiriman",
    description:
      "Menjawab pertanyaan pengiriman dengan nada ramah, tapi masih berupa draft untuk ditinjau manual dulu.",
    source: "dm" as const,
    triggers: ["kirim", "ongkir", "sampai kapan", "ekspedisi"],
    action: {
      type: "ai_reply" as const,
      tone: "ramah" as const,
      delayMinutes: 1.5,
      dryRun: true,
    },
    isActive: false,
  },
];

export const SAMPLE_MONITORS = [
  {
    name: "Pemantauan merek & pesaing",
    keywords: ["Sahabat Kreator", "sahabatkreator", "review sahabat kreator"],
    excludedTerms: ["lowongan", "loker"],
    platforms: [] as string[],
  },
  {
    // Keyword sengaja dipilih yang BENAR-BENAR ada di data engagement organisasi
    // demo. Kalau tidak, monitor tersimpan tapi daftar hasilnya kosong dan
    // tangkapan layarnya tetap tidak menjelaskan apa pun. Daftar lengkap ada di
    // SAMPLE_KEYWORD_CANDIDATES di bawah.
    name: "Percakapan seputar konten",
    keywords: ["gaes", "yuk"],
    excludedTerms: [],
    platforms: [] as string[],
  },
];

/**
 * Kata yang sudah terbukti muncul di data engagement organisasi demo (bukan
 * pagar, bukan kata mati). Dipakai untuk memilih keyword monitor di atas —
 * perbarui kalau data engagement demo berubah, kalau tidak hasil listening
 * akan kosong lagi.
 */
export const SAMPLE_KEYWORD_CANDIDATES = [
  "gaes",
  "yuk",
  "semoga",
  "amin",
  "kak",
  "nyanyi",
  "sahabat kreator",
];

export const SAMPLE_SOURCES = [
  {
    name: "Blog contoh — berita UMKM",
    url: "https://contoh.id/blog/umkm",
    sourceType: "auto" as const,
  },
  {
    name: "Kanal contoh — tips pemasaran",
    url: "https://contoh.id/rss/pemasaran",
    sourceType: "rss" as const,
  },
];

/** Batas kuota /api/* di server. Sisa margin dipakai halaman yang sedang terbuka. */
const RATE_WINDOW_MS = 60_000;
const RATE_BUDGET = 60;
const apiHits: number[] = [];

function noteApiHit() {
  apiHits.push(Date.now());
}

async function waitForRateHeadroom(page: Page) {
  for (;;) {
    const now = Date.now();
    while (apiHits.length > 0 && now - (apiHits[0] as number) > RATE_WINDOW_MS) apiHits.shift();
    if (apiHits.length < RATE_BUDGET) return;
    const wait = RATE_WINDOW_MS - (now - (apiHits[0] as number)) + 400;
    console.log(`    … jeda ${Math.ceil(wait / 1000)}s (kuota API terpakai)`);
    await page.waitForTimeout(Math.min(wait, 20_000));
  }
}

type ApiResult = { status: number; body: unknown };

/**
 * Panggil API lewat sesi browser yang sudah login — cookie & CSRF-nya ikut,
 * jadi tidak perlu mengurus token sendiri.
 */
async function callApi(
  page: Page,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  await waitForRateHeadroom(page);
  const result = (await page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // biarkan sebagai teks
      }
      return { status: res.status, body: parsed };
    },
    { method, path, body },
  )) as ApiResult;
  noteApiHit();
  return result;
}

function fail(what: string, result: ApiResult): never {
  throw new Error(
    `${what} gagal — HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}`,
  );
}

/** Ambil akun sosial pertama yang cocok, supaya rule terikat ke akun nyata. */
async function pickAccountId(page: Page, platforms: string[]): Promise<string | null> {
  const res = await callApi(page, "GET", "/api/automation");
  if (res.status !== 200) fail("baca /api/automation", res);
  const accounts = (res.body as { accounts?: { id: string; platform: string }[] }).accounts ?? [];
  for (const platform of platforms) {
    const found = accounts.find((a) => a.platform === platform);
    if (found) return found.id;
  }
  return accounts[0]?.id ?? null;
}

export async function prepareDemoData(page: Page, base: string): Promise<void> {
  console.log("\nMenyiapkan data contoh untuk /panduan…");

  // --- Automation ---------------------------------------------------------
  const existingRulesRes = await callApi(page, "GET", "/api/automation");
  if (existingRulesRes.status !== 200) fail("baca /api/automation", existingRulesRes);
  const existingRules = (existingRulesRes.body as { rules?: { name: string }[] }).rules ?? [];
  const existingRuleNames = new Set(existingRules.map((r) => r.name));

  const accountId = await pickAccountId(page, ["instagram", "instagram_standalone", "facebook"]);

  for (const rule of SAMPLE_RULES) {
    if (existingRuleNames.has(rule.name)) {
      console.log(`  = rule "${rule.name}" sudah ada`);
      continue;
    }
    const res = await callApi(page, "POST", "/api/automation", {
      ...rule,
      socialAccountId: accountId,
    });
    if (res.status >= 400) fail(`buat rule "${rule.name}"`, res);
    console.log(`  + rule "${rule.name}" (${rule.source}, ${rule.triggers.length} trigger)`);
  }

  // --- Social Listening ---------------------------------------------------
  const listeningRes = await callApi(page, "GET", "/api/listening");
  if (listeningRes.status !== 200) fail("baca /api/listening", listeningRes);
  const existingMonitors =
    (listeningRes.body as { monitors?: { id: string; name: string }[] }).monitors ?? [];
  const monitorByName = new Map(existingMonitors.map((m) => [m.name, m.id]));

  for (const monitor of SAMPLE_MONITORS) {
    if (monitorByName.has(monitor.name)) {
      console.log(`  = monitor "${monitor.name}" sudah ada`);
      continue;
    }
    const res = await callApi(page, "POST", "/api/listening/monitors", monitor);
    if (res.status >= 400) fail(`buat monitor "${monitor.name}"`, res);
    // Server langsung menjalankan sync pertama; hasilnya ikut masuk respons.
    const newItems = (res.body as { newItems?: number }).newItems ?? 0;
    console.log(`  + monitor "${monitor.name}" (${newItems} hasil dari sync pertama)`);
    const created = (res.body as { id?: string }).id;
    if (created) monitorByName.set(monitor.name, created);
  }

  const sourcesRes = await callApi(page, "GET", "/api/listening/sources");
  if (sourcesRes.status !== 200) fail("baca /api/listening/sources", sourcesRes);
  const existingSources = (sourcesRes.body as { sources?: { name: string }[] }).sources ?? [];
  const existingSourceNames = new Set(existingSources.map((s) => s.name));

  for (const source of SAMPLE_SOURCES) {
    if (existingSourceNames.has(source.name)) {
      console.log(`  = sumber "${source.name}" sudah ada`);
      continue;
    }
    const res = await callApi(page, "POST", "/api/listening/sources", source);
    if (res.status >= 400) {
      console.log(`  ! sumber "${source.name}" dilewati — HTTP ${res.status}`);
      continue;
    }
    console.log(`  + sumber "${source.name}" (${source.sourceType})`);
  }

  // Paksa sync sekali lagi supaya hasil listening terisi dari akun sosial yang
  // sudah tersambung (komentar/mention yang cocok dengan keyword monitor).
  // POST /listening/sync menjalankan SEMUA monitor aktif org sekaligus.
  const syncRes = await callApi(page, "POST", "/api/listening/sync");
  if (syncRes.status >= 400) {
    console.log(`  ! sync semua monitor dilewati — HTTP ${syncRes.status}`);
  } else {
    const results =
      (syncRes.body as { results?: { monitorId: string; newItems: number }[] }).results ?? [];
    for (const result of results) {
      const name =
        [...monitorByName.entries()].find(([, id]) => id === result.monitorId)?.[0] ??
        result.monitorId;
      console.log(`  ↻ sync "${name}" — ${result.newItems} hasil baru`);
    }
  }

  const after = await callApi(page, "GET", "/api/listening");
  const summary =
    (after.body as { summary?: { activeMonitors?: number; totalItems?: number } }).summary ?? {};
  console.log(
    `Data contoh siap: ${summary.activeMonitors ?? 0} monitor aktif, ${summary.totalItems ?? 0} hasil listening.`,
  );
  console.log(`  (halaman ${base}/panduan siap direkam)`);
}

export { noteApiHit };
