import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";

export class FfmpegError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FfmpegError";
  }
}

function run(bin: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || "").slice(0, 400) || (stdout || "").slice(0, 400);
        reject(new FfmpegError(`${bin} gagal (${err.message}): ${detail}`));
        return;
      }
      resolve(stdout);
    });
    child.on("error", (e) => reject(new FfmpegError(`${bin} tidak dapat dijalankan: ${e.message}`)));
  });
}

export interface MediaProbe {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export async function probeMedia(inputPath: string): Promise<MediaProbe> {
  const out = await run(
    FFPROBE_BIN,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,width,height",
      "-of",
      "json",
      inputPath,
    ],
  );
  try {
    const parsed = JSON.parse(out) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const video = (parsed.streams ?? []).find((s) => s.codec_type === "video");
    const audio = (parsed.streams ?? []).find((s) => s.codec_type === "audio");
    const duration = parsed.format?.duration ? Number(parsed.format.duration) : null;
    return {
      durationSeconds: Number.isFinite(duration) ? duration : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
    };
  } catch {
    return { durationSeconds: null, width: null, height: null, hasVideo: false, hasAudio: false };
  }
}

/**
 * Ekstrak frame dari video:
 * - poster: frame pertama (detik ~0.1) — jadi thumbnail.
 * - frames: N frame merata di durasi video.
 * Mengembalikan buffer masing-masing frame.
 */
export async function extractFrames(
  inputPath: string,
  opts: { posterAtSeconds?: number; count?: number; maxDimension?: number },
): Promise<{ poster: Buffer; frames: Buffer[] }> {
  const count = opts.count ?? 4;
  const maxDimension = opts.maxDimension ?? 1280;
  const probe = await probeMedia(inputPath);
  const duration = probe.durationSeconds ?? 0;
  if (!probe.hasVideo) throw new FfmpegError("Media tidak memiliki video stream.");

  const scale = `scale='min(${maxDimension},iw)':-2`;
  const dir = await mkdtemp(path.join(tmpdir(), "seb-worker-"));
  try {
    const framePaths: string[] = [];

    const posterPath = path.join(dir, "poster.jpg");
    await run(
      FFMPEG_BIN,
      ["-y", "-ss", String(opts.posterAtSeconds ?? 0.1), "-i", inputPath, "-frames:v", "1", "-vf", scale, "-q:v", "4", posterPath],
    );
    framePaths.push(posterPath);

    for (let i = 0; i < count; i++) {
      const framePath = path.join(dir, `frame-${i + 1}.jpg`);
      const time = duration > 0 ? Math.min(Math.max((duration * (i + 0.5)) / count, 0), Math.max(duration - 0.1, 0)) : 0.1;
      await run(
        FFMPEG_BIN,
        ["-y", "-ss", String(time), "-i", inputPath, "-frames:v", "1", "-vf", scale, "-q:v", "4", framePath],
      );
      framePaths.push(framePath);
    }

    const buffers = await Promise.all(framePaths.map((p) => readFile(p)));
    return { poster: buffers[0]!, frames: buffers.slice(1) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Transcode video ke MP4 H.264/AAC (compatible lintas platform).
 * Mengembalikan buffer MP4 yang sudah siap.
 */
export async function transcodeToMp4(inputPath: string, outputPath: string): Promise<void> {
  await run(
    FFMPEG_BIN,
    [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    180_000,
  );
}

/**
 * Transcode satu buffer video menjadi MP4 H.264. Temp file dibersihkan otomatis.
 */
export async function transcodeVideoBuffer(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "seb-worker-"));
  const inputPath = path.join(dir, `input-${randomUUID()}.mp4`);
  const outputPath = path.join(dir, `output-${randomUUID()}.mp4`);
  try {
    await writeFile(inputPath, input);
    await transcodeToMp4(inputPath, outputPath);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Proses satu file video:
 * 1. Tulis buffer input ke temp file.
 * 2. Probe + ekstrak frame.
 * 3. Hapus temp.
 * Return frame buffers + info.
 */
export async function processVideoBuffer(
  input: Buffer,
  opts: { posterAtSeconds?: number; count?: number; maxDimension?: number } = {},
): Promise<{ poster: Buffer; frames: Buffer[]; durationSeconds: number | null; width: number | null; height: number | null }> {
  const dir = await mkdtemp(path.join(tmpdir(), "seb-worker-"));
  const inputPath = path.join(dir, `input-${randomUUID()}.mp4`);
  try {
    await writeFile(inputPath, input);
    const probe = await probeMedia(inputPath);
    const { poster, frames } = await extractFrames(inputPath, opts);
    return {
      poster,
      frames,
      durationSeconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}