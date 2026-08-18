import { transcodeVideoBuffer } from "../ffmpeg.js";
import type { Transcoder, TranscodeRequest, TranscodeResult } from "./types.js";

export class LocalTranscoder implements Transcoder {
    readonly name = "local";

    async transcode(request: TranscodeRequest): Promise<TranscodeResult> {
        const output = await transcodeVideoBuffer(request.input);
        return { output, mimeType: "video/mp4" };
    }
}