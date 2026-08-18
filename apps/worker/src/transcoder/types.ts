export interface TranscodeRequest {
    input: Buffer;
    mimeType: string;
}

export interface TranscodeResult {
    output: Buffer;
    mimeType: string;
}

/**
 * Kontrak transcoding video. Implementasi bisa apa saja — ffmpeg lokal,
 * Modal.com, worker remote, dsb. Worker loop hanya tahu interface ini.
 */
export interface Transcoder {
    readonly name: string;
    transcode(request: TranscodeRequest): Promise<TranscodeResult>;
}