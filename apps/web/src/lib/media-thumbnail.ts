// Utilitas media — thumbnail video client-side (frame awal via canvas)

/**
 * Generate thumbnail JPEG dari frame video (detik ~10% durasi, fallback frame 0).
 * Return null bila browser gagal decode video (mis. codec tidak didukung) —
 * pemanggil lanjut upload tanpa thumbnail.
 */
export async function generateVideoThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("video/")) return null;

  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  try {
    // Tunggu metadata (durasi/dimensi) lalu seek
    await waitForEvent(video, "loadedmetadata", 10_000);
    // Seek ke ~10% durasi (frame lebih representatif daripada frame 0 yang
    // sering hitam), maksimal 1s untuk video pendek
    const seekTo = Math.min(video.duration * 0.1, 1);
    video.currentTime = Number.isFinite(seekTo) && seekTo > 0 ? seekTo : 0;
    await waitForEvent(video, "seeked", 10_000);

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    // Batasi sisi terpanjang 640px — thumbnail cukup untuk grid/picker
    const scale = Math.min(1, 640 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8),
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

/** Promise event sekali dengan timeout — reject saat lewat batas waktu */
function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout menunggu ${event}`));
    }, timeoutMs);
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("gagal load video"));
    };
    function cleanup() {
      clearTimeout(timer);
      el.removeEventListener(event, onDone);
      el.removeEventListener("error", onError);
    }
    el.addEventListener(event, onDone, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}
