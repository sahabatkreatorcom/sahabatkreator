import type { Platform } from "@/lib/platforms";
import type { PublishPayload } from "../../types";
import type { ReplizScheduleBody } from "./client";

/** Map Sahabat Kreator Platform → Repliz platform name */
function mapPlatformToRepliz(platform: Platform): string {
  const map: Record<string, string> = {
    INSTAGRAM: "instagram",
    INSTAGRAM_PAGE: "instagram",
    FACEBOOK: "facebook",
    TIKTOK: "tiktok",
    YOUTUBE: "youtube",
    LINKEDIN: "linkedin",
    THREADS: "threads",
  };
  return map[platform] || platform.toLowerCase();
}

/** Map postType + mediaType → Repliz schedule type */
function mapPostType(
  postType: string,
  mediaType: string,
): ReplizScheduleBody["type"] {
  if (postType === "reel") return "reel";
  if (postType === "story") return "story";
  if (postType === "pin") return "image";
  if (mediaType === "video") return "video";
  if (mediaType === "carousel") return "album";
  if (mediaType === "image") return "image";
  return "text";
}

/** Detect media type from URL */
function detectMediaType(url: string): "image" | "video" {
  return /\.(mp4|mov|webm)(\?|#|$)/i.test(url) ? "video" : "image";
}

/** Map Sahabat Kreator PublishPayload → Repliz ScheduleBody */
export function mapToReplizSchedule(
  accountAccountId: string,
  payload: PublishPayload,
): ReplizScheduleBody {
  const type = mapPostType(payload.postType, payload.mediaType);

  const medias: ReplizScheduleBody["medias"] = payload.mediaUrls.map((url) => ({
    url,
    type: detectMediaType(url),
    alt: payload.altText,
  }));

  const additionalInfo: ReplizScheduleBody["additionalInfo"] = {};

  if (payload.instagramCollaborators?.length) {
    additionalInfo.collaborators = payload.instagramCollaborators;
  }
  if (payload.videoTags?.length) {
    additionalInfo.tags = payload.videoTags;
  }
  if (payload.tiktokAutoAddMusic) {
    additionalInfo.isAutoAddMusic = true;
  }

  const body: ReplizScheduleBody = {
    title: payload.videoTitle || "",
    description: payload.caption,
    type,
    medias,
    accountId: accountAccountId,
    scheduleAt: new Date().toISOString(),
  };

  if (Object.keys(additionalInfo).length > 0) {
    body.additionalInfo = additionalInfo;
  }
  if (payload.threadsTopicTag) {
    body.topic = payload.threadsTopicTag;
  }
  if (payload.link) {
    body.meta = {
      title: payload.pinTitle || "",
      description: payload.caption,
      url: payload.link,
    };
  }

  return body;
}

export { mapPlatformToRepliz };
