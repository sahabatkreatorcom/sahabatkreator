export interface AccountRef {
    id: string;
    platform: string;
    name: string;
    avatar: string | null;
}

export interface CalendarPost {
    id: string;
    caption: string;
    status: "draft" | "scheduled" | "publishing" | "published" | "failed";
    scheduledAt: string | null;
    publishedAt: string | null;
    platform: string;
    postUrl: string | null;
    viralityScore: number | null;
    account: AccountRef | null;
    media: Array<{
        id: string;
        url: string;
        thumbnailUrl: string | null;
        type: "image" | "video";
    }>;
}
