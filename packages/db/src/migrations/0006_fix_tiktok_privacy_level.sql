-- Fix TikTok privacy_level values to match TikTok API requirements:
-- 'PUBLIC' → 'PUBLIC_TO_EVERYONE'
-- 'PRIVATE_TO_FRIENDS' → 'MUTUAL_FOLLOW_FRIENDS'
UPDATE "post" SET "tiktok_privacy_level" = 'PUBLIC_TO_EVERYONE' WHERE "tiktok_privacy_level" = 'PUBLIC';
UPDATE "post" SET "tiktok_privacy_level" = 'MUTUAL_FOLLOW_FRIENDS' WHERE "tiktok_privacy_level" = 'PRIVATE_TO_FRIENDS';
