// API OAuth — connect akun social media via OAuth 2.0 redirect flow
// Flow: GET /oauth/:platform/start (auth, buat state) → redirect platform consent
//       → GET /oauth/:platform/callback (state validasi, exchange code, upsert akun)
//       → redirect web app dengan status
//       → bila Meta (FB/IG) mengelola > 1 Page → simpan oauth_pending_selection,
//         redirect ke /accounts?pending=<id> agar user pilih Page (picker UI)
//
// Modul:
// - credentials: resolusi kredensial app (DB → env) + refresh token
// - start: GET /:platform/start
// - callback: GET /:platform/callback (native flow)
// - repliz-callback: GET /:platform/repliz-callback/:state (bridge Repliz)
// - bluesky: POST /bluesky/connect (app password)
// - token: POST /:platform/refresh + POST /:platform/revoke

import { Hono } from "hono";
import { handleBlueskyConnect } from "./bluesky";
import { handleCallback } from "./callback";
import { handleReplizCallback } from "./repliz-callback";
import { handleStart } from "./start";
import { handleRefresh, handleRevoke } from "./token";

export const oauthRoute = new Hono();

oauthRoute.get("/:platform/start", handleStart);
oauthRoute.get("/:platform/callback", handleCallback);
oauthRoute.get("/:platform/repliz-callback/:state", handleReplizCallback);
oauthRoute.post("/bluesky/connect", handleBlueskyConnect);
oauthRoute.post("/:platform/refresh", handleRefresh);
oauthRoute.post("/:platform/revoke", handleRevoke);
