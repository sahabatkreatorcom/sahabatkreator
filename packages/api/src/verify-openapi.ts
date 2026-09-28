import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createOpenApiDocument, createPublicApiDocument } from "./index";

function check(name: string, committedPath: string, document: unknown) {
  const committed = JSON.stringify(JSON.parse(readFileSync(committedPath, "utf-8")), null, 2);
  const regenerated = JSON.stringify(document, null, 2);

  if (committed !== regenerated) {
    console.error(`${name}: drift detected. Regenerate with \`bun scripts/gen-public-api.ts\`.`);
    process.exit(1);
  }

  console.log(`${name}: up to date.`);
}

check("OpenAPI document", join(import.meta.dirname, "openapi.json"), createOpenApiDocument());
check(
  "Public API document",
  join(import.meta.dirname, "..", "scripts", "public-api.json"),
  createPublicApiDocument(),
);
