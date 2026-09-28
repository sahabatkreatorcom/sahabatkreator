// ⚠️ FILE INI DI-GENERATE — jangan edit manual.
// Regenerasi: bun run codegen:openapi (apps/web)
// Sumber: packages/api (createOpenApiDocument + createPublicApiDocument).
// Kontrak untuk router /api (session) belum tercover — lihat script header.

export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Service health */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HealthResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/private": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Private user data */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PrivateDataResponse"];
                    };
                };
                /** @description Authentication required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UnauthorizedResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cek koneksi & token
         * @description Satu-satunya endpoint tanpa scope. Membuktikan key valid, plan layak memakai /v1, dan mengembalikan identitas organisasi + scope key.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Key valid. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PingResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Daftar akun sosial
         * @description Semua akun sosial milik organisasi (termasuk status koneksi).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Daftar akun. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountsResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts/{id}/statistic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Statistik akun (bridge)
         * @description Statistik real-time satu akun via bridge Repliz. Akun non-bridge membalas 400/503.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID akun */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Statistik akun. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountStatisticResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/posts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Daftar post
         * @description Daftar grup post (draft, terjadwal, sudah tayang) milik organisasi.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Filter YYYY-MM-DD */
                    from?: string;
                    /** @description Filter YYYY-MM-DD */
                    to?: string;
                    /** @description Filter status post */
                    status?: string;
                    /** @description Sertakan post eksternal */
                    includeExternal?: "1";
                    page?: number;
                    perPage?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Daftar post. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PostsListResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Buat post
         * @description Membuat grup post baru. Bila `scheduledAt` diisi, menjadwalkannya (butuh fitur scheduled_posts).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreatePostRequest"];
                };
            };
            responses: {
                /** @description Grup post dibuat. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreatePostResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/posts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detail post */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID grup post */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Detail grup post + post items. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PostDetailResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Hapus post */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID grup post */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Post dihapus. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DeleteResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/posts/{id}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Publish segera
         * @description Mem- enqueue publish untuk post yang bisa dipublish. Membalas `{ok,queued}` bila masuk queue, atau `{ok,published,processing,failed}` bila dikerjakan inline.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID grup post */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Hasil publish. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PublishQueuedResponse"] | components["schemas"]["PublishInlineResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/posts/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ulang publish post gagal
         * @description Hanya untuk post berstatus failed yang punya schedule bridge.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID grup post */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Retry dijalankan. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RetryResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Bridge Repliz belum dikonfigurasi. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ringkasan performa
         * @description Pakai `from`+`to` (YYYY-MM-DD) atau `days` (default 30). Mode from/to mengembalikan `comparison`.
         */
        get: {
            parameters: {
                query?: {
                    /** @description YYYY-MM-DD */
                    from?: string;
                    /** @description YYYY-MM-DD */
                    to?: string;
                    days?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ringkasan + totals. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AnalyticsOverviewResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/timeseries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Deret waktu engagement */
        get: {
            parameters: {
                query?: {
                    days?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Series harian. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AnalyticsTimeseriesResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/top-posts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Post teratas */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    platform?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Post teratas. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AnalyticsTopPostsResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/reports/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ringkasan laporan
         * @description Ringkasan periode (default 30 hari terakhir).
         */
        get: {
            parameters: {
                query?: {
                    /** @description YYYY-MM-DD */
                    from?: string;
                    /** @description YYYY-MM-DD */
                    to?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ringkasan laporan. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReportSummaryResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Daftar media
         * @description Item media library (maks 200).
         */
        get: {
            parameters: {
                query?: {
                    folderId?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Daftar media. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaListResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/media/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import media dari URL
         * @description Mengunduh file dari URL publik ke media library organisasi.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ImportMediaRequest"];
                };
            };
            responses: {
                /** @description Media diimpor. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImportMediaResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Storage R2 belum dikonfigurasi. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/renders/manifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Manifest render
         * @description Daftar hasil render video organisasi (maks 200).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Manifest render. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RenderManifestResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Daftar aturan automation
         * @description Butuh fitur plan `automation`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Aturan + akun yang terhubung. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutomationListResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        /** Buat aturan automation */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["AutomationRuleRequest"];
                };
            };
            responses: {
                /** @description Aturan dibuat. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutomationRuleResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automation/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Hapus aturan automation */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID aturan */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Aturan dihapus. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DeleteResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /**
         * Ubah aturan automation
         * @description Semua field opsional (patch).
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID aturan */
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["AutomationRuleRequest"];
                };
            };
            responses: {
                /** @description Aturan diubah. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutomationRuleResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/carousel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Buat job carousel
         * @description Membuat job render carousel asinkron. Poll `GET /v1/carousel/{id}` untuk status.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateCarouselRequest"];
                };
            };
            responses: {
                /** @description Job dibuat dan diantrikan. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreateCarouselResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur carousel belum dikonfigurasi (MODAL_TOKEN/MODAL_CAROUSEL_URL). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/carousel/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Status job carousel
         * @description Polling status job + slide yang sudah ter-render.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID job */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Status job. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CarouselJobResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/video": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Buat job video
         * @description Merakit video dari base video + clip + voiceover + caption. Poll `GET /v1/video/{id}`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateVideoRequest"];
                };
            };
            responses: {
                /** @description Job dibuat. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreateVideoResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur render video belum dikonfigurasi (MODAL_TOKEN/MODAL_RENDER_URL). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/video/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status job video */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID job */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Status job. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["VideoJobResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auto-clip": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Buat job auto-clip
         * @description Mendeteksi momen viral dari video sumber. Pakai `sourceUrl` atau `baseVideoMediaId`. Pilih kandidat lewat `POST /v1/auto-clip/{id}/select`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateAutoClipRequest"];
                };
            };
            responses: {
                /** @description Job dibuat + rentang terdeteksi. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreateAutoClipResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur auto-clip belum dikonfigurasi (MODAL_CLIPPER_URL/TOKEN). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auto-clip/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status job auto-clip */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID job */
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Status job + kandidat segmen. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AutoClipJobResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auto-clip/{id}/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Pilih kandidat auto-clip
         * @description Memilih segmen yang akan dirender. Fan-out: `renderJobIds[]` berisi job render video.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description ID job */
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SelectAutoClipRequest"];
                };
            };
            responses: {
                /** @description Segmen dipilih, job render dibuat. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SelectAutoClipResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Analisis belum selesai / kandidat sudah dirender. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ai/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pemakaian kredit AI
         * @description Kredit AI organisasi bulan berjalan.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Pemakaian kredit. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AiUsageResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ai/caption": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Generate caption
         * @description Membuat caption + hashtag. Mengonsumsi kredit AI.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CaptionRequest"];
                };
            };
            responses: {
                /** @description Caption + hashtag. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CaptionResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur AI belum dikonfigurasi. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ai/hashtag": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Generate hashtag
         * @description Membuat hashtag dari prompt. Mengonsumsi kredit AI.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["HashtagRequest"];
                };
            };
            responses: {
                /** @description Daftar hashtag. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HashtagResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur AI belum dikonfigurasi. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ai/rewrite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tulis ulang teks
         * @description Menulis ulang teks sesuai gaya. Mengonsumsi kredit AI.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RewriteRequest"];
                };
            };
            responses: {
                /** @description Teks hasil. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RewriteResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur AI belum dikonfigurasi. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ai/repurpose": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reuse konten lintas platform
         * @description Mengubah konten untuk platform lain. Mengonsumsi kredit AI.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RepurposeRequest"];
                };
            };
            responses: {
                /** @description Konten hasil. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RepurposeResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur AI belum dikonfigurasi. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/trends": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tren harian
         * @description Tren Google Indonesia (tidak mengonsumsi kredit AI).
         */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Daftar tren. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TrendsResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/trends/ideas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ide konten dari tren
         * @description Membuat ide konten dari satu tren. Mengonsumsi kredit AI.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["TrendIdeasRequest"];
                };
            };
            responses: {
                /** @description Ide konten. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TrendIdeasResponse"];
                    };
                };
                /** @description Permintaan tidak valid (validasi schema / input salah). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description API key tidak ada, tidak valid, atau sudah dicabut. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Plan tidak termasuk api_access (atau api_write untuk endpoint tulis). */
                402: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Key tidak memiliki scope yang dibutuhkan endpoint ini. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Endpoint tidak ditemukan, atau sumber daya tidak ada. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Terlalu banyak permintaan (60/menit per key). */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description AI mengembalikan format yang tidak bisa dibaca. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Fitur AI belum dikonfigurasi. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        HealthResponse: {
            /** @enum {string} */
            status: "ok";
        };
        PrivateDataResponse: {
            message: string;
            user: {
                id: string;
                email: string;
                name: string | null;
            };
        };
        UnauthorizedResponse: {
            message: string;
        };
        ErrorResponse: {
            message: string;
        };
        ErrorWithIssues: {
            message: string;
            issues?: {
                path: string[];
                message: string;
            }[];
        };
        DateRangeQuery: {
            /** @example 2026-01-01 */
            from?: string;
            /** @example 2026-01-31 */
            to?: string;
        };
        PaginationQuery: {
            /** @default 1 */
            page: number;
            /** @default 50 */
            perPage: number;
        };
        PingResponse: {
            /** @enum {boolean} */
            ok: true;
            organization: {
                id: string;
                name: string;
                slug: string;
            };
            key: {
                id: string;
                name: string;
                /** @example sk_live_ab12 */
                prefix: string;
                scopes: string[];
            };
            /** Format: date-time */
            serverTime: string;
        };
        AccountsResponse: {
            accounts: components["schemas"]["AccountItem"][];
        };
        AccountItem: {
            id: string;
            platform: string;
            platformAccountId: string | null;
            username: string | null;
            displayName: string | null;
            avatarUrl: string | null;
            isConnected: boolean;
            needsReconnect: boolean;
            /** Format: date-time */
            lastSyncedAt: string | null;
            lastError: string | null;
            /** Format: date-time */
            tokenExpiresAt: string | null;
            hasRefreshToken: boolean;
            /** Format: date-time */
            createdAt: string;
            isBridge: boolean;
        };
        AccountStatisticResponse: {
            /** @description Statistik real-time dari bridge Repliz. null bila belum pernah disinkronkan. */
            statistic: {
                followers: number | null;
                posts: number | null;
                engagement: number | null;
            } | null;
            unsupported?: boolean;
        };
        PostsListResponse: {
            groups: components["schemas"]["PostGroupItem"][];
            page: number;
            perPage: number;
        };
        PostGroupItem: {
            id: string;
            content: string | null;
            /** Format: date-time */
            scheduledAt: string | null;
            /** Format: date-time */
            reminderAt: string | null;
            timezone: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            isExternal?: boolean;
            posts: components["schemas"]["PostItem"][];
        };
        PostItem: {
            id: string;
            postGroupId: string;
            socialAccountId: string;
            platform: string;
            /** @enum {string} */
            status: "draft" | "scheduled" | "publishing" | "published" | "failed";
            content: string | null;
            platformPostId: string | null;
            platformPostUrl: string | null;
            /** Format: date-time */
            publishedAt: string | null;
            errorCode: string | null;
            errorMessage: string | null;
            hashtags: string[] | null;
            firstComment: string | null;
            username: string | null;
            displayName: string | null;
            avatarUrl: string | null;
            isBridge: boolean;
        };
        PostDetailResponse: {
            group: components["schemas"]["PostGroupItem"];
            posts: components["schemas"]["PostItem"][];
        };
        CreatePostRequest: {
            /** @default  */
            content: string;
            /** Format: date-time */
            scheduledAt?: string | null;
            /** @default Asia/Jakarta */
            timezone: string;
            audioTrackId?: string | null;
            /** @default [] */
            productIds: string[];
            items: components["schemas"]["CreatePostItem"][];
        };
        CreatePostItem: {
            socialAccountId: string;
            content?: string;
            /** @default [] */
            hashtags: string[];
            firstComment?: string | null;
            platformSettings?: {
                [key: string]: unknown;
            };
            /** @default [] */
            mediaIds: string[];
        };
        CreatePostResponse: {
            postGroupId: string;
        };
        PublishQueuedResponse: {
            /** @enum {boolean} */
            ok: true;
            queued: number;
        };
        PublishInlineResponse: {
            /** @enum {boolean} */
            ok: true;
            published: number;
            processing: number;
            failed: number;
        };
        RetryResponse: {
            /** @enum {boolean} */
            ok: true;
        };
        DeleteResponse: {
            /** @enum {boolean} */
            ok: true;
        };
        AnalyticsTotals: {
            followers: number;
            likes: number;
            comments: number;
            shares: number;
            views: number;
            impressions: number;
        };
        AnalyticsAccount: {
            id: string;
            platform: string;
            username: string | null;
            displayName: string | null;
            avatarUrl: string | null;
            followers: number | null;
        };
        AnalyticsOverviewResponse: {
            range: {
                from: string;
                to: string;
            } | {
                days: number;
                since: string;
            };
            totals: components["schemas"]["AnalyticsTotals"];
            accounts: components["schemas"]["AnalyticsAccount"][];
            comparison?: {
                previous: components["schemas"]["AnalyticsTotals"];
                deltas: {
                    followers?: number;
                    likes?: number;
                    comments?: number;
                    shares?: number;
                    views?: number;
                    impressions?: number;
                } | null;
            };
        };
        AnalyticsTimeseriesResponse: {
            days: number;
            series: {
                date: string;
                likes: number;
                comments: number;
                shares: number;
                views: number;
                impressions: number;
            }[];
        };
        AnalyticsTopPost: {
            postId: string;
            platform: string;
            content: string | null;
            platformPostUrl: string | null;
            platformPostId: string | null;
            isBridge: boolean;
            /** Format: date-time */
            publishedAt: string | null;
            username: string | null;
            displayName: string | null;
            avatarUrl: string | null;
            likes: number | null;
            comments: number | null;
            shares: number | null;
            saves: number | null;
            views: number | null;
            impressions: number | null;
            reach: number | null;
            engagement: number | null;
            engagementRate: number | null;
            media: {
                url: string;
                /** @enum {string} */
                type: "video" | "image";
                videoUrl: string | null;
            } | null;
        };
        AnalyticsTopPostsResponse: {
            posts: components["schemas"]["AnalyticsTopPost"][];
        };
        ReportSummaryResponse: {
            report: {
                organizationName: string;
                from: string;
                to: string;
                postsPublished: number;
                totalEngagement: number;
                totalImpressions: number;
                totalReach: number;
                accounts: {
                    username: string;
                    platform: string;
                    followersStart: number | null;
                    followersEnd: number | null;
                }[];
                topPosts: {
                    content: string;
                    platform: string;
                    likes: number;
                    comments: number;
                    shares: number;
                    saves: number;
                    engagement: number;
                }[];
                goals: {
                    name: string;
                    metric: string;
                    currentValue: number;
                    targetValue: number;
                    progressPercent: number;
                }[];
            };
        };
        MediaItem: {
            id: string;
            name: string;
            /** @enum {string} */
            type: "image" | "video" | "audio";
            url: string;
            sizeBytes: number | null;
            width: number | null;
            height: number | null;
            folderId: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        MediaListResponse: {
            items: components["schemas"]["MediaItem"][];
            storageConfigured: boolean;
        };
        ImportMediaRequest: {
            /** Format: uri */
            url: string;
            name?: string;
            folderId?: string | null;
        };
        ImportMediaResponse: {
            media: components["schemas"]["MediaItem"];
        };
        RenderManifestItem: {
            id: string;
            project: string;
            title: string;
            /** @enum {string} */
            orientation: "landscape" | "portrait" | "square";
            videoUrl: string;
            sizeBytes: number;
            durationSeconds: number;
            width: number;
            height: number;
            commitSha: string;
            branch: string;
            /** Format: date-time */
            renderedAt: string;
        };
        RenderManifestResponse: {
            /** @enum {number} */
            version: 1;
            /** Format: date-time */
            generatedAt: string;
            renders: components["schemas"]["RenderManifestItem"][];
        };
        AutomationRuleRequest: {
            name: string;
            description?: string;
            /** @enum {string} */
            source: "dm" | "comment";
            socialAccountId?: string | null;
            triggers: string[];
            action: components["schemas"]["AutomationAction"];
            isActive?: boolean;
        };
        AutomationAction: components["schemas"]["AutomationReplyAction"] | components["schemas"]["AutomationAiReplyAction"];
        AutomationReplyAction: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "reply";
            message: string;
        };
        AutomationAiReplyAction: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "ai_reply";
            /**
             * @default ramah
             * @enum {string}
             */
            tone: "ramah" | "profesional" | "lucu";
            /** @default 2 */
            delayMinutes: number;
            /** @default false */
            dryRun: boolean;
        };
        AutomationRuleResponse: {
            rule: components["schemas"]["AutomationRuleRecord"];
        };
        AutomationRuleRecord: components["schemas"]["AutomationRuleRequest"] & {
            id: string;
            organizationId: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        AutomationListResponse: {
            rules: components["schemas"]["AutomationRuleRecord"][];
            accounts: {
                id: string;
                platform: string;
                username: string;
            }[];
        };
        CreateCarouselRequest: {
            topic: string;
            slides?: components["schemas"]["CarouselSlide"][];
            caption?: string;
            settings: components["schemas"]["CarouselSettings"];
        };
        CarouselSlide: {
            title: string;
            body?: string;
            backgroundMediaId?: string | null;
        };
        CarouselSettings: {
            /**
             * @default box
             * @enum {string}
             */
            style: "outline" | "box" | "box_title_content" | "plain";
            /**
             * @default portrait4_5
             * @enum {string}
             */
            format: "portrait" | "portrait4_5" | "square";
            /** @default 6 */
            slideCount: number;
            /** @default 235 */
            boxOpacity: number;
            /** @default Fredoka */
            titleFontFamily: string;
            /** @default Fredoka */
            contentFontFamily: string;
            /**
             * @default solid
             * @enum {string}
             */
            backgroundMode: "library" | "stock" | "solid";
            /** @default  */
            backgroundQuery: string;
            aiLayout?: {
                /** @default false */
                enabled: boolean;
            };
        };
        CreateCarouselResponse: {
            jobId: string;
            /** @enum {string} */
            status: "queued";
            slideCount: number;
        };
        CarouselJobResponse: {
            job: {
                id: string;
                topic: string;
                status: string;
                progress: number;
                settings?: unknown;
                caption: string | null;
                errorCode: string | null;
                errorMessage: string | null;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                updatedAt: string;
            };
            slides: {
                urutan: number;
                title: string;
                body: string | null;
                stockCredit: string | null;
                layout: string | null;
                url: string | null;
                width: number | null;
                height: number | null;
                sizeBytes: number | null;
            }[];
        };
        CreateVideoRequest: {
            baseVideoMediaId: string;
            clipMediaIds?: string[];
            voiceoverMediaId?: string | null;
            bgmAudioTrackId?: string | null;
            /** @default false */
            publishToGallery: boolean;
            settings: components["schemas"]["VideoSettings"];
        };
        VideoSettings: {
            /**
             * @default portrait
             * @enum {string}
             */
            orientation: "portrait" | "landscape" | "square";
            /**
             * @default 1080p
             * @enum {string}
             */
            resolution: "720p" | "1080p";
            /** @default true */
            removeOriginalAudio: boolean;
            /** @default 1 */
            voiceVolume: number;
            /** @default 0.3 */
            bgmVolume: number;
            montage?: {
                /** @default 2 */
                minSegmentSeconds: number;
                /** @default 5 */
                maxSegmentSeconds: number;
            } | null;
            caption?: components["schemas"]["VideoCaptionSettings"];
            headline?: components["schemas"]["VideoHeadlineSettings"];
        };
        VideoCaptionSettings: {
            /** @default true */
            enabled: boolean;
            /**
             * @default id
             * @enum {string}
             */
            language: "id" | "en" | "auto";
            /**
             * @default base
             * @enum {string}
             */
            model: "tiny" | "base" | "small" | "medium";
            /** @default 24 */
            fontSize: number;
            /** @default white */
            fontColor: string;
            /**
             * @default bottom
             * @enum {string}
             */
            position: "bottom" | "top" | "center";
            /** @default true */
            wordHighlight: boolean;
        };
        VideoHeadlineSettings: {
            text?: string;
            /** @default 48 */
            fontSize: number;
            /** @default white */
            fontColor: string;
            /** @default 0.1 */
            positionY: number;
        } | null;
        CreateVideoResponse: {
            job: {
                id: string;
                status: string;
                progress: number;
                /** Format: date-time */
                createdAt: string;
            };
        };
        VideoJobResponse: {
            job: {
                id: string;
                status: string;
                progress: number;
                settings?: unknown;
                errorCode: string | null;
                errorMessage: string | null;
                outputMediaId: string | null;
                srtStorageKey: string | null;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                updatedAt: string;
            };
        };
        CreateAutoClipRequest: {
            /** Format: uri */
            sourceUrl?: string | null;
            /**
             * @default t1
             * @enum {string}
             */
            sourceTier: "t1" | "t2";
            baseVideoMediaId?: string | null;
            clipSettings: {
                targetClipCount?: number;
                minDurationSec?: number;
                maxDurationSec?: number;
                /** @enum {string} */
                orientation?: "portrait" | "landscape" | "square";
                outputLanguage?: string;
                userDirection?: string | null;
                captionEnabled?: boolean;
            };
            renderSettings?: {
                /**
                 * @default 1080p
                 * @enum {string}
                 */
                resolution: "720p" | "1080p";
                /** @default false */
                removeOriginalAudio: boolean;
                /** @default 0.3 */
                bgmVolume: number;
            };
        };
        CreateAutoClipResponse: {
            job: {
                id: string;
                status: string;
                progress: number;
                /** Format: date-time */
                createdAt: string;
            };
            detectedRanges?: unknown;
        };
        AutoClipJobResponse: {
            job: {
                id: string;
                status: string;
                progress: number;
                clipSettings?: unknown;
                urlSource: string | null;
                urlSourceTier: string | null;
                srtStorageKey: string | null;
                errorCode: string | null;
                errorMessage: string | null;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                updatedAt: string;
                baseVideoName: string | null;
                baseVideoThumbnailUrl: string | null;
                baseVideoDuration: number | null;
            };
            segments: {
                id: string;
                order: number;
                startSec: number;
                endSec: number;
                title: string;
                viralScore: number | null;
                hookText: string | null;
                explicitRange: boolean | null;
                status: string;
                renderVideoJobId: string | null;
                renderStatus: string | null;
                renderProgress: number | null;
                outputMediaId: string | null;
            }[];
        };
        SelectAutoClipRequest: {
            segmentIds: string[];
        };
        SelectAutoClipResponse: {
            /** @enum {boolean} */
            ok: true;
            enqueuedCount: number;
            renderJobIds: string[];
        };
        AiUsageResponse: {
            configured: boolean;
            used: number;
            limit: number;
            /** @example 2026-09 */
            period: string;
        };
        CaptionRequest: {
            prompt: string;
            /** @enum {string} */
            platform: "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "linkedin_org" | "pinterest" | "threads" | "x";
            /**
             * @default santai
             * @enum {string}
             */
            tone: "santai" | "profesional" | "lucu" | "inspiratif" | "promosi";
            /** @default true */
            includeHashtags: boolean;
        };
        CaptionResponse: {
            caption: string;
            hashtags: string[];
            credits: components["schemas"]["AiCredits"];
        };
        AiCredits: {
            used: number;
            limit: number;
            remaining: number;
        };
        HashtagRequest: {
            prompt: string;
            /** @enum {string} */
            platform: "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "linkedin_org" | "pinterest" | "threads" | "x";
            /** @default 10 */
            count: number;
        };
        HashtagResponse: {
            hashtags: string[];
            credits: components["schemas"]["AiCredits"];
        };
        RewriteRequest: {
            text: string;
            /** @enum {string} */
            platform: "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "linkedin_org" | "pinterest" | "threads" | "x";
            /**
             * @default lebih-santai
             * @enum {string}
             */
            style: "lebih-santai" | "lebih-formal" | "lebih-pendek" | "lebih-panjang" | "hook-kuat" | "seo";
        };
        RewriteResponse: {
            text: string;
            credits: components["schemas"]["AiCredits"];
        };
        RepurposeRequest: {
            content: string;
            /** @enum {string} */
            targetPlatform: "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "linkedin_org" | "pinterest" | "threads" | "x";
            tone?: string;
        };
        RepurposeResponse: {
            content: string;
            credits: components["schemas"]["AiCredits"];
        };
        TrendsResponse: {
            trends: {
                title: string;
                approxTraffic?: string | null;
            }[];
            /** Format: date-time */
            fetchedAt: string;
            available: boolean;
        };
        TrendIdeasRequest: {
            trend: string;
            /** @enum {string} */
            platform: "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "pinterest" | "threads" | "x";
            niche?: string;
        };
        TrendIdeasResponse: {
            ideas: {
                title: string;
                angle: string;
                caption: string;
                hashtags: string[];
            }[];
            credits: components["schemas"]["AiCredits"];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
