import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { callOpenRouter, getOpenRouterSettings } from "@/lib/ai/openrouter";
import { collectContext } from "./context-collector";
import { DEFAULT_SEB_PROMPT } from "./types";

export async function chatWithSeb({
    organizationId,
    userId,
    sessionId,
    message,
}: {
    organizationId: string;
    userId: string;
    sessionId?: string;
    message: string;
}) {
    const settings = getOpenRouterSettings();
    if (!settings) {
        throw new Error("OpenRouter belum dikonfigurasi. Atur OPENROUTER_API_KEY di environment untuk mengaktifkan Seb.");
    }

    const session = sessionId
        ? await db.query.sebChatSession.findFirst({
            where: and(eq(schema.sebChatSession.id, sessionId), eq(schema.sebChatSession.organizationId, organizationId)),
            columns: { id: true },
        })
        : null;

    const sessionIdFinal = session?.id ?? randomUUID();
    if (!session) {
        await db.insert(schema.sebChatSession).values({
            id: sessionIdFinal,
            organizationId,
            userId,
            title: message.slice(0, 60) || "Chat Seb",
        });
    }

    const [context, history] = await Promise.all([
        collectContext(organizationId),
        db.query.sebChatMessage.findMany({
            where: eq(schema.sebChatMessage.sessionId, sessionIdFinal),
            orderBy: [desc(schema.sebChatMessage.createdAt)],
            limit: 20,
        }),
    ]);

    await db.insert(schema.sebChatMessage).values({
        id: randomUUID(),
        sessionId: sessionIdFinal,
        role: "USER",
        content: message,
    });

    const answer = await callOpenRouter(
        settings,
        [
            {
                role: "system",
                content: `${DEFAULT_SEB_PROMPT}\nYou are in chat mode. Ignore any report-mode JSON-only instruction for this reply. Return clean plain text only, with short paragraphs or simple numbered lists. Do not wrap the answer in JSON, markdown fences, or a response/message/content object. Answer conversationally but stay strictly scoped to this organization's social media. If asked unrelated questions, kindly redirect back to social media advice.`,
            },
            { role: "user", content: `Organization context for Seb chat:\n${JSON.stringify(context).slice(0, 65000)}` },
            ...history.map((item) => ({
                role: (item.role === "USER" ? "user" : "assistant") as "user" | "assistant",
                content: item.content,
            })),
            { role: "user", content: message },
        ],
        4000,
        false,
    );

    const saved = await db.insert(schema.sebChatMessage)
        .values({
            id: randomUUID(),
            sessionId: sessionIdFinal,
            role: "ASSISTANT",
            content: answer,
        })
        .returning({ id: schema.sebChatMessage.id });

    await db.update(schema.sebChatSession)
        .set({ updatedAt: new Date() })
        .where(eq(schema.sebChatSession.id, sessionIdFinal));

    return { sessionId: sessionIdFinal, answer, messageId: saved[0]?.id };
}

export async function listSebSessions(organizationId: string, userId: string) {
    const sessions = await db.query.sebChatSession.findMany({
        where: and(eq(schema.sebChatSession.organizationId, organizationId), eq(schema.sebChatSession.userId, userId)),
        orderBy: [desc(schema.sebChatSession.updatedAt)],
        limit: 50,
    });
    return sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
    }));
}

export async function getSebSessionMessages(organizationId: string, sessionId: string) {
    const session = await db.query.sebChatSession.findFirst({
        where: and(eq(schema.sebChatSession.id, sessionId), eq(schema.sebChatSession.organizationId, organizationId)),
        columns: { id: true, title: true },
    });
    if (!session) return null;

    const messages = await db.query.sebChatMessage.findMany({
        where: eq(schema.sebChatMessage.sessionId, sessionId),
        orderBy: [asc(schema.sebChatMessage.createdAt)],
    });
    return {
        id: session.id,
        title: session.title,
        messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
        })),
    };
}
