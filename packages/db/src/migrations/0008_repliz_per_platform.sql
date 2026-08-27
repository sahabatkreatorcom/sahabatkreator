-- Drop old boolean column
ALTER TABLE "global_integration_settings" DROP COLUMN IF EXISTS "repliz_oauth_enabled";

-- Add new jsonb column for per-platform Repliz settings
ALTER TABLE "global_integration_settings" ADD COLUMN "repliz_platforms" jsonb DEFAULT '[]' NOT NULL;
