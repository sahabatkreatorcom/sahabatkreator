/**
 * Next.js instrumentation — menjalankan BullMQ worker di proses server.
 * File ini berada di root src (bukan di dalam app/pages) sesuai konvensi Next 16.
 *
 * Worker hanya dimulai saat:
 *   - runtime Node.js (bukan edge), dan
 *   - REDIS_URL dikonfigurasi, dan
 *   - QUEUE_WORKER_ENABLED tidak diset "false".
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    if (process.env.QUEUE_WORKER_ENABLED === "false") return;
    if (!process.env.REDIS_URL) return;

    try {
        const { startQueueWorkers } = await import("./lib/queue-worker");
        const stop = startQueueWorkers();
        console.log("[instrumentation] BullMQ workers started");

        // Tutup worker pada sinyal shutdown tanpa memanggil process.exit —
        // biarkan Next.js menangani graceful shutdown request yang sedang berjalan.
        const shutdown = async () => {
            try {
                await stop();
            } catch (err) {
                console.error("[instrumentation] gagal menutup worker:", err);
            }
        };
        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    } catch (err) {
        console.error("[instrumentation] gagal start queue worker:", err);
    }
}
