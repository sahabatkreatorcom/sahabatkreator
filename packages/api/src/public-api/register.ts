// Pendaftaran semua schema /v1 ke registry OpenAPI.
// Dipanggil sekali di index.ts; urutan bebas.
import { zodToOpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  DateRangeQuerySchema,
  ErrorResponseSchema,
  ErrorWithIssuesSchema,
  PaginationQuerySchema,
  publicApiRegistry,
} from "./common";
import {
  AuthorizeResponseSchema,
  ConnectAccountResponseSchema,
  ConnectPendingResponseSchema,
  ConnectRequestSchema,
  PendingAssetSchema,
  PendingSelectionResponseSchema,
  SelectAssetRequestSchema,
  SelectAssetResponseSchema,
} from "./connect";
import { PingResponseSchema } from "./ping";
import {
  AccountItemSchema,
  AccountStatisticResponseSchema,
  AccountsResponseSchema,
  AnalyticsAccountSchema,
  AnalyticsOverviewResponseSchema,
  AnalyticsTimeseriesResponseSchema,
  AnalyticsTopPostSchema,
  AnalyticsTopPostsResponseSchema,
  AnalyticsTotalsSchema,
  MediaItemSchema,
  MediaListResponseSchema,
  PostDetailResponseSchema,
  PostGroupItemSchema,
  PostItemSchema,
  PostsListResponseSchema,
  RenderManifestItemSchema,
  RenderManifestResponseSchema,
  ReportSummaryResponseSchema,
} from "./reads";
import {
  AiUsageResponseSchema,
  AutoClipJobResponseSchema,
  CaptionResponseSchema,
  CaptionSchema,
  CarouselJobResponseSchema,
  CreateAutoClipResponseSchema,
  CreateAutoClipSchema,
  CreateCarouselResponseSchema,
  CreateCarouselSchema,
  CreateVideoResponseSchema,
  CreateVideoSchema,
  HashtagResponseSchema,
  HashtagSchema,
  RepurposeResponseSchema,
  RepurposeSchema,
  RewriteResponseSchema,
  RewriteSchema,
  SelectAutoClipResponseSchema,
  SelectAutoClipSchema,
  TrendIdeasResponseSchema,
  TrendIdeasSchema,
  TrendsResponseSchema,
  VideoJobResponseSchema,
} from "./render-ai";
import { WebhookDeliveriesResponseSchema, WebhookEventsResponseSchema } from "./webhooks";
import {
  AutomationListResponseSchema,
  AutomationRuleResponseSchema,
  AutomationRuleSchema,
  CreatePostResponseSchema,
  CreatePostSchema,
  DeleteResponseSchema,
  ImportMediaResponseSchema,
  ImportMediaSchema,
  PublishInlineResponseSchema,
  PublishQueuedResponseSchema,
  RetryResponseSchema,
} from "./writes";

/** Schema root yang direferensikan dari paths. */
const ROOT_SCHEMAS = [
  PingResponseSchema,
  AccountsResponseSchema,
  AccountItemSchema,
  AccountStatisticResponseSchema,
  PostsListResponseSchema,
  PostGroupItemSchema,
  PostItemSchema,
  PostDetailResponseSchema,
  CreatePostSchema,
  CreatePostResponseSchema,
  PublishQueuedResponseSchema,
  PublishInlineResponseSchema,
  RetryResponseSchema,
  DeleteResponseSchema,
  AnalyticsTotalsSchema,
  AnalyticsAccountSchema,
  AnalyticsOverviewResponseSchema,
  AnalyticsTimeseriesResponseSchema,
  AnalyticsTopPostSchema,
  AnalyticsTopPostsResponseSchema,
  ReportSummaryResponseSchema,
  MediaItemSchema,
  MediaListResponseSchema,
  ImportMediaSchema,
  ImportMediaResponseSchema,
  RenderManifestItemSchema,
  RenderManifestResponseSchema,
  AutomationRuleSchema,
  AutomationRuleResponseSchema,
  AutomationListResponseSchema,
  CreateCarouselSchema,
  CreateCarouselResponseSchema,
  CarouselJobResponseSchema,
  CreateVideoSchema,
  CreateVideoResponseSchema,
  VideoJobResponseSchema,
  CreateAutoClipSchema,
  CreateAutoClipResponseSchema,
  AutoClipJobResponseSchema,
  SelectAutoClipSchema,
  SelectAutoClipResponseSchema,
  AiUsageResponseSchema,
  CaptionSchema,
  CaptionResponseSchema,
  HashtagSchema,
  HashtagResponseSchema,
  RewriteSchema,
  RewriteResponseSchema,
  RepurposeSchema,
  RepurposeResponseSchema,
  TrendsResponseSchema,
  TrendIdeasSchema,
  TrendIdeasResponseSchema,
  WebhookDeliveriesResponseSchema,
  WebhookEventsResponseSchema,
];

/**
 * Schema pendukung yang direferensikan dari paths tetapi BUKAN root response.
 *
 * Sebelumnya schema ini didefinisikan dengan .openapi("Name") tapi tidak pernah
 * di-register — akibatnya $ref "#/components/schemas/ErrorResponse" (dipakai di
 * 30 endpoint /v1) TIDAK ter-resolve: dokumen OpenAPI tidak valid, Scalar docs
 * menampilkan error schema kosong, dan codegen tipe (openapi-typescript)
 * langsung gagal. Lihat ANALISA-CODEBASE.md.
 */
const SHARED_SCHEMAS = [
  ErrorResponseSchema,
  ErrorWithIssuesSchema,
  DateRangeQuerySchema,
  PaginationQuerySchema,
];

/**
 * Schema alur connect akun lewat API (fase 3–4).
 *
 * Wajib didaftarkan: path-nya mereferensikan schema ini lewat `$ref`, dan `$ref`
 * yang tidak terdaftar membuat dokumen OpenAPI tidak valid — Scalar menampilkan
 * schema kosong dan codegen tipe gagal. Bug yang sama pernah terjadi pada
 * SHARED_SCHEMAS (lihat komentar di bawah).
 */
const CONNECT_SCHEMAS = [
  AuthorizeResponseSchema,
  ConnectRequestSchema,
  ConnectAccountResponseSchema,
  ConnectPendingResponseSchema,
  PendingAssetSchema,
  PendingSelectionResponseSchema,
  SelectAssetRequestSchema,
  SelectAssetResponseSchema,
];

export function registerPublicApiSchemas() {
  for (const schema of [...SHARED_SCHEMAS, ...CONNECT_SCHEMAS]) {
    const meta = zodToOpenAPIRegistry.get(schema as never) as
      | { _internal?: { refId?: string } }
      | undefined;
    const name = meta?._internal?.refId;
    if (!name) {
      throw new Error(
        "[public-api] SHARED_SCHEMAS/CONNECT_SCHEMAS berisi schema tanpa nama .openapi() — " +
          "beri nama eksplisit di berkas skemanya.",
      );
    }
    publicApiRegistry.register(name, schema);
  }
  for (const schema of ROOT_SCHEMAS) {
    const meta = zodToOpenAPIRegistry.get(schema as never) as
      | { _internal?: { refId?: string } }
      | undefined;
    const name = meta?._internal?.refId;
    if (!name) {
      const def = (schema as { _zod?: { def: { type: string } } })?._zod?.def;
      throw new Error(
        `[public-api] schema tanpa nama .openapi() ditemukan di ROOT_SCHEMAS: type=${def?.type ?? "?"}`,
      );
    }
    publicApiRegistry.register(name, schema);
  }
}
