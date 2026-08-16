import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@sahabat-kreator/env/server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const ENCRYPTED_PREFIX = "enc:";

function getKey(): Buffer {
    if (env.ENCRYPTION_KEY) {
        const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
        if (key.length === 32) return key;
    }
    // Fallback: derive 32-byte key dari BETTER_AUTH_SECRET (deterministik).
    return createHash("sha256").update(env.BETTER_AUTH_SECRET).digest();
}

export function encryptToken(plaintext: string): string {
    if (!plaintext) return plaintext;
    if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ENCRYPTED_PREFIX + Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export function decryptToken(stored: string): string {
    if (!stored) return stored;
    if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;

    try {
        const combined = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), "base64");
        const iv = combined.subarray(0, IV_LENGTH);
        const tag = combined.subarray(combined.length - TAG_LENGTH);
        const data = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
        const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
        return "";
    }
}