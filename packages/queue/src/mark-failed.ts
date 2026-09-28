// Helper tandai post failed — dipakai processor saat attempt habis

import { db } from "@sahabatkreator/db";
import { post } from "@sahabatkreator/db/schema";
import { eq } from "drizzle-orm";

export async function markPostFailed(postId: string, code: string, message: string): Promise<void> {
  await db
    .update(post)
    .set({ status: "failed", errorCode: code, errorMessage: message.slice(0, 500) })
    .where(eq(post.id, postId));
}
