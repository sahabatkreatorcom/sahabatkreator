import { describe, expect, it, vi } from "vitest";
import { MemoryRateLimitStore } from "./rate-limit";

describe("MemoryRateLimitStore (fallback single-instance)", () => {
  it("mengizinkan request sampai max, lalu menolak", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 5; i++) {
      expect((await store.hit("k", 60_000, 5)).allowed).toBe(true);
    }
    const blocked = await store.hit("k", 60_000, 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("window reset setelah windowMs berlalu", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit("k", 60_000, 2);
    await store.hit("k", 60_000, 2);
    expect((await store.hit("k", 60_000, 2)).allowed).toBe(false);
    // Bucket lama dianggap kedaluwarsa setelah resetAt.
    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);
    expect((await store.hit("k", 60_000, 2)).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("key berbeda tidak saling memengaruhi", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit("a", 60_000, 1);
    expect((await store.hit("a", 60_000, 1)).allowed).toBe(false);
    expect((await store.hit("b", 60_000, 1)).allowed).toBe(true);
  });

  it("bucket kedaluwarsa dibersihkan oleh sweep interval", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit("ephemeral", 1_000, 1);
    vi.useFakeTimers();
    // CLEANUP_INTERVAL_MS = 2 menit. Fake timer juga memajukan Date.now(),
    // jadi assertion harus terjadi sebelum timer asli dipulihkan.
    vi.advanceTimersByTime(121_000);
    // Hanya mengecek tidak ada error — sweep tidak boleh crash pada bucket kosong.
    expect((await store.hit("ephemeral", 60_000, 1)).allowed).toBe(true);
    vi.useRealTimers();
  });
});
