// SEB — chat multi-sesi dengan konteks org + history + lampiran media relevan.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { generateId } from "../id";
import { db } from "../index";
import { media, post, postMedia, sebChatMessage, sebChatSession, socialAccount } from "../schema";
import { collectSebContext } from "./context";
import { callSebModel, getSebSettings, type SebSettings, safeJsonParse } from "./settings";

export type SebChatMediaAttachment = {
  id: string;
  postId?: string;
  title: string;
  caption?: string | null;
  platform?: string | null;
  status?: string;
  type: "image" | "video" | "audio";
  mimeType: string;
  url: string;
  previewUrl: string;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  rationale: string;
};

export type ChatWithSebOptions = {
  organizationId: string;
  userId: string;
  sessionId?: string;
  message: string;
};

function tidySebChatText(text: string) {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/<[^>]+>/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSebChatAnswer(text: string) {
  const parsed = safeJsonParse<{ message?: string; response?: string; content?: string }>(text);
  const parsedText = parsed?.message || parsed?.response || parsed?.content;
  if (parsedText) return tidySebChatText(parsedText);

  const looseMatch = text
    .trim()
    .match(/^[{\s]*["'](?:message|response|content)["']\s*:\s*"([\s\S]*)"\s*}?\s*$/);
  if (looseMatch?.[1]) {
    const captured = looseMatch[1];
    try {
      return tidySebChatText(JSON.parse(`"${captured}"`) as string);
    } catch {
      return tidySebChatText(captured);
    }
  }

  return tidySebChatText(text);
}

function searchTokens(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (word) =>
            word.length > 2 &&
            ![
              "the",
              "and",
              "for",
              "this",
              "that",
              "with",
              "from",
              "what",
              "how",
              "why",
              "you",
              "seb",
              "user",
              "question",
              "recommendation",
            ].includes(word),
        )
        .slice(0, 16),
    ),
  );
}

async function findSebChatMediaAttachments(
  organizationId: string,
  message: string,
  answer: string,
): Promise<SebChatMediaAttachment[]> {
  const tokens = searchTokens(`${message} ${answer}`);
  const visualIntent =
    /\b(show|see|visual|image|photo|video|preview|example|creative|design|hook|thumbnail|reel|story|ad)\b/i.test(
      `${message} ${answer}`,
    );

  // Post terbaru dengan media (max 60)
  const posts = await db
    .select({
      id: post.id,
      content: post.content,
      status: post.status,
      platform: post.platform,
      socialAccountName: socialAccount.displayName,
      socialAccountUsername: socialAccount.username,
    })
    .from(post)
    .innerJoin(socialAccount, eq(post.socialAccountId, socialAccount.id))
    .where(eq(post.organizationId, organizationId))
    .orderBy(desc(post.publishedAt), desc(post.createdAt))
    .limit(60);

  const postIds = posts.map((p) => p.id);
  if (postIds.length === 0) return [];

  const rows = await db
    .select({
      postId: postMedia.postId,
      sortOrder: postMedia.sortOrder,
      mediaId: media.id,
      name: media.name,
      type: media.type,
      mimeType: media.mimeType,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      width: media.width,
      height: media.height,
      durationSeconds: media.durationSeconds,
      altText: media.altText,
    })
    .from(postMedia)
    .innerJoin(media, eq(postMedia.mediaId, media.id))
    .where(inArray(postMedia.postId, postIds))
    .limit(240);

  const postsById = new Map(posts.map((p) => [p.id, p]));

  const scored = rows.map((row) => {
    const parentPost = postsById.get(row.postId);
    const haystack = [
      parentPost?.content,
      parentPost?.platform,
      parentPost?.socialAccountName,
      parentPost?.socialAccountUsername,
      row.name,
      row.altText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score =
      tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0) +
      (visualIntent ? 0.5 : 0);

    return {
      score,
      attachment: {
        id: row.mediaId,
        postId: row.postId,
        title: row.name,
        caption: parentPost?.content ?? null,
        platform: parentPost?.platform ?? null,
        status: parentPost?.status,
        type: row.type,
        mimeType: row.mimeType,
        url: row.url,
        previewUrl: row.thumbnailUrl || row.url,
        width: row.width,
        height: row.height,
        durationSeconds: row.durationSeconds,
        rationale: score > 0 ? "Matched Seb chat context" : "Recent visual example",
      } satisfies SebChatMediaAttachment,
    };
  });

  return scored
    .filter((item) => item.score > 0 || visualIntent)
    .sort((a, b) => b.score - a.score)
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.attachment.id === item.attachment.id) === index,
    )
    .slice(0, visualIntent ? 6 : 3)
    .map((item) => item.attachment);
}

/** Chat dengan SEB — buat/lanjut sesi, generate jawaban, attach media relevan */
export async function chatWithSeb({
  organizationId,
  userId,
  sessionId,
  message,
}: ChatWithSebOptions) {
  const settings: SebSettings = await getSebSettings();

  const session = sessionId
    ? (
        await db
          .select()
          .from(sebChatSession)
          .where(
            and(
              eq(sebChatSession.id, sessionId),
              eq(sebChatSession.organizationId, organizationId),
            ),
          )
          .limit(1)
      )[0]
    : (
        await db
          .insert(sebChatSession)
          .values({
            id: generateId("sebcs"),
            organizationId,
            userId,
            title: message.slice(0, 60) || "Chat SEB",
          })
          .returning()
      )[0];

  if (!session) throw new Error("Sesi chat SEB tidak ditemukan");

  const [context, history] = await Promise.all([
    collectSebContext(organizationId),
    db
      .select()
      .from(sebChatMessage)
      .where(eq(sebChatMessage.sessionId, session.id))
      .orderBy(asc(sebChatMessage.createdAt))
      .limit(20),
  ]);

  await db.insert(sebChatMessage).values({
    id: generateId("sebcm"),
    sessionId: session.id,
    role: "user",
    content: message,
  });

  const answer = await callSebModel(
    settings,
    [
      {
        role: "system",
        content: `${settings.systemPrompt}\nYou are in chat mode. Ignore any report-mode JSON-only instruction for this reply. Return clean plain text only, with short paragraphs or simple numbered lists. Do not wrap the answer in JSON, markdown fences, or a response/message/content object. Answer conversationally but stay strictly scoped to this organization's social media. Treat all posting times, scheduled times, and timing recommendations in the organization timezone from context.timezone, using local date/time fields when present instead of inferring wall-clock times from UTC timestamps. If asked unrelated questions, kindly redirect back to social media advice. When visual examples would help, say what to look at and Seb will attach matching image or video previews separately. If discussing captions, separate written post captions from on-video captions/subtitles/text overlays, and remember STORY posts often do not need normal feed-style captions.`,
      },
      {
        role: "user",
        content: `Organization context for Seb chat:\n${JSON.stringify(context).slice(0, 65000)}`,
      },
      ...history.map((item) => ({
        role: item.role === "user" ? ("user" as const) : ("assistant" as const),
        content: item.content,
      })),
      { role: "user", content: message },
    ],
    { maxTokens: 4000 },
  );

  const normalizedAnswer = normalizeSebChatAnswer(answer);
  const attachments = await findSebChatMediaAttachments(organizationId, message, normalizedAnswer);
  const saved = await db
    .insert(sebChatMessage)
    .values({
      id: generateId("sebcm"),
      sessionId: session.id,
      role: "assistant",
      content: normalizedAnswer,
      metadata: { attachments },
    })
    .returning();
  await db
    .update(sebChatSession)
    .set({ updatedAt: new Date() })
    .where(eq(sebChatSession.id, session.id));

  return { session, message: saved };
}
