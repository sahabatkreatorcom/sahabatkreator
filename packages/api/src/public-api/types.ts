// Definisi tipe OpenAPI minimal yang dipakai generator /v1.
// Cukup untuk tip-check `paths`; bukan tipe OpenAPI lengkap.
export type OpenAPIParameter = {
  name: string;
  in: "query" | "path" | "header";
  required?: boolean;
  schema: object;
  description?: string;
};

export type OpenAPIResponse = {
  description: string;
  content?: { "application/json": { schema: object } };
};

export type OpenAPIOperation = {
  summary: string;
  description?: string;
  tags: string[];
  "x-required-scopes": string[];
  security: unknown[];
  parameters?: unknown[];
  requestBody?: { required: boolean; content: { "application/json": { schema: object } } };
  responses: Record<string, OpenAPIResponse>;
};

export type OpenAPIPaths = Record<string, Record<string, OpenAPIOperation>>;
