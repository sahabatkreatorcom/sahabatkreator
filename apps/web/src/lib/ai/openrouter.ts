import { env } from "@sahabat-kreator/env/server";

export const DEFAULT_SEB_MODEL = "openai/gpt-4o-mini";

export class OpenRouterError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body: string,
    ) {
        super(message);
        this.name = "OpenRouterError";
    }
}

export interface OpenRouterSettings {
    apiKey: string;
    model: string;
    temperature: number;
}

/**
 * Baca konfigurasi OpenRouter. Key dari env OPENROUTER_API_KEY.
 * Bila belum dikonfigurasi, kembalikan null — pemanggil boleh fallback/menolak.
 */
export function getOpenRouterSettings(): OpenRouterSettings | null {
    if (!env.OPENROUTER_API_KEY) return null;
    return {
        apiKey: env.OPENROUTER_API_KEY,
        model: DEFAULT_SEB_MODEL,
        temperature: 0.55,
    };
}

export interface OpenRouterMessage {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

/**
 * Panggil OpenRouter chat completions. jsonMode = minta response JSON object.
 */
export async function callOpenRouter(
    settings: OpenRouterSettings,
    messages: OpenRouterMessage[],
    maxTokens = 3500,
    jsonMode = false,
): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": env.BETTER_AUTH_URL || "https://localhost:3000",
            "X-Title": "Sahabat Kreator Seb",
        },
        body: JSON.stringify({
            model: settings.model,
            messages,
            temperature: settings.temperature,
            max_tokens: maxTokens,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new OpenRouterError(
            `OpenRouter request failed: ${response.status} ${text.slice(0, 200)}`,
            response.status,
            text,
        );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty response");

    return content;
}

/** Parse JSON yang mungkin dibungkus markdown atau punya teks di sekitar objek. */
export function safeJsonParse<T>(text: string): T | null {
    const cleaned = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
    try {
        return JSON.parse(cleaned) as T;
    } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(cleaned.slice(start, end + 1)) as T;
            } catch {
                return null;
            }
        }
        return null;
    }
}