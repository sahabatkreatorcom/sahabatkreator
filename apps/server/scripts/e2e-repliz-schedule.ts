/**
 * E2E: siklus Repliz Schedule API lewat fungsi produksi.
 * Membuktikan fix `repliz_no_schedule_id` (response create = {scheduleId}).
 * Schedule dijadwalkan 3 jam ke depan & dihapus di akhir — tidak ada post tayang.
 */
import { resolve } from "node:path";
import {
  replizActiveCredentials,
  replizCreateSchedule,
  replizGetSchedule,
  replizListAccounts,
  replizRemoveSchedule,
} from "@sahabatkreator/publishing";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../../.env") });

let failures = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
};

async function main() {
  const cred = await replizActiveCredentials();
  if (!cred) {
    console.log("bridge tidak aktif — batal");
    process.exit(1);
  }

  const { docs } = await replizListAccounts(cred);
  if (docs.length === 0) {
    console.log("tidak ada akun bridge — batal");
    process.exit(1);
  }
  const target = docs[0];
  console.log(`akun: ${target.type} @${target.username} (${target.id})\n`);

  // 1. CREATE — dulu melempar repliz_no_schedule_id; sekarang harus return id
  const scheduleAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  let scheduleId: string;
  try {
    scheduleId = await replizCreateSchedule(cred, {
      description: "[E2E] verifikasi fix scheduleId — terhapus otomatis",
      type: "text",
      medias: [],
      accountId: target.id,
      scheduleAt,
      topic: target.type,
    });
  } catch (e) {
    check("create schedule", false, String((e as Error)?.message ?? e));
    console.log(`\n${failures} kegagalan`);
    process.exit(1);
  }
  check("create schedule", /^[0-9a-f]{24}$/.test(scheduleId), `scheduleId=${scheduleId}`);

  // 2. GET — replizGetSchedule baca list docs (_id) harus temukan schedule baru
  const sched = await replizGetSchedule(cred, scheduleId, target.id);
  check("get schedule by id", sched !== null, sched ? `status=${sched.status}` : "tidak ditemukan");
  if (sched) {
    check(
      "get status pending",
      sched.status === "pending" || sched.status === "process",
      `status=${sched.status}`,
    );
    check("get accountId", sched.accountId === target.id);
  }

  // 3. DELETE — schedule belum tayang, harus bisa dicancel
  await replizRemoveSchedule(cred, scheduleId);
  const after = await replizGetSchedule(cred, scheduleId, target.id);
  check("delete schedule", after === null, after ? "masih ada" : "hilang dari list");

  console.log(`\n${failures === 0 ? "SEMUA PASS" : `${failures} kegagalan`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
