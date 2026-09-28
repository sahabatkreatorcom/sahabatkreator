// Middleware gate fitur per paket — return 402 (errorResponse) bila fitur
// tidak termasuk `features` plan tier tertinggi pool. Daftarkan SEBELUM
// handler: `XRoute.use("*", gateFeature("listening"))`.
import type { Context, Next } from "hono";
import { errorResponse, requireOrg } from "./auth-guard";
import { checkPlanFeature } from "./billing";

export function gateFeature(feature: string) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    try {
      const ctx = await requireOrg(c);
      await checkPlanFeature(ctx.organization.id, feature);
    } catch (error) {
      return errorResponse(error);
    }
    await next();
    return undefined;
  };
}
