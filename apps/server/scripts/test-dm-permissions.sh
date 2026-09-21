#!/bin/bash
# =============================================================================
# Test DM Permissions — generate API calls untuk Meta App Review
# =============================================================================
#
# Instagram: instagram_business_manage_messages (butuh 10 test calls)
# Facebook:  pages_messaging (butuh test calls)
#
# Usage:
#   ./test-dm-permissions.sh --platform instagram --token TOKEN --account-id 17841475755074774
#   ./test-dm-permissions.sh --platform facebook --token TOKEN --account-id 622205640985000
#
# Atau ambil token dari DB:
#   ./test-dm-permissions.sh --from-db
# =============================================================================

set -euo pipefail

GRAPH_API="https://graph.facebook.com/v26.0"
CALLS_NEEDED_IG=10
CALLS_NEEDED_FB=10

# Parse args
PLATFORM=""
TOKEN=""
ACCOUNT_ID=""
FROM_DB=false
CALLS=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --platform) PLATFORM="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --account-id) ACCOUNT_ID="$2"; shift 2 ;;
    --from-db) FROM_DB=true; shift ;;
    --help)
      echo "Usage: $0 --platform <instagram|facebook> --token TOKEN --account-id ID"
      echo "       $0 --from-db"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# If --from-db, get tokens from Docker container
if [ "$FROM_DB" = true ]; then
  echo "=== Getting tokens from database via Docker ==="
  
  echo ""
  echo "--- Instagram DM Test Calls ---"
  # Get Instagram account info from DB
  IG_RESULT=$(docker exec sahabatkreator-postgres psql -U sahabatkreator -d sahabatkreator -t -A -c "
    SELECT 
      sa.id,
      sa.platform_account_id,
      sa.access_token_enc,
      sa.metadata
    FROM social_account sa
    WHERE sa.platform = 'instagram' AND sa.is_connected = true
    LIMIT 1;
  " 2>/dev/null || echo "")
  
  if [ -n "$IG_RESULT" ]; then
    echo "Found Instagram account. Decrypting token..."
    # For now, we'll use the token directly - in production, you'd need to decrypt
    echo "Run this command to get the decrypted token:"
    echo "  docker exec sahabatkreator-app node -e \"const {decrypt}=require('./packages/publishing/src/crypto');console.log(decrypt('ENCRYPTED_TOKEN'))\""
    echo ""
    echo "Then run:"
    echo "  $0 --platform instagram --token DECRYPTED_TOKEN --account-id PLATFORM_ACCOUNT_ID"
  fi
  
  echo ""
  echo "--- Facebook DM Test Calls ---"
  FB_RESULT=$(docker exec sahabatkreator-postgres psql -U sahabatkreator -d sahabatkreator -t -A -c "
    SELECT 
      sa.id,
      sa.platform_account_id,
      sa.access_token_enc,
      sa.metadata
    FROM social_account sa
    WHERE sa.platform = 'facebook' AND sa.is_connected = true
    LIMIT 1;
  " 2>/dev/null || echo "")
  
  if [ -n "$FB_RESULT" ]; then
    echo "Found Facebook account. Run:"
    echo "  $0 --platform facebook --token PAGE_ACCESS_TOKEN --account-id PAGE_ID"
  fi
  
  echo ""
  echo "=== To get tokens manually ==="
  echo "Option 1: From Meta Developer Console → Graph API Explorer"
  echo "Option 2: From DB (encrypted) → decrypt with app key"
  echo ""
  exit 0
fi

# Validate args
if [ -z "$PLATFORM" ] || [ -z "$TOKEN" ] || [ -z "$ACCOUNT_ID" ]; then
  echo "Error: --platform, --token, and --account-id are required"
  echo "Usage: $0 --platform <instagram|facebook> --token TOKEN --account-id ID"
  exit 1
fi

echo "=== Testing DM Permissions for $PLATFORM ==="
echo "Account ID: $ACCOUNT_ID"
echo "Graph API: $GRAPH_API"
echo ""

# Instagram: platform=instagram required
# Facebook: no platform param needed
if [ "$PLATFORM" = "instagram" ]; then
  PLATFORM_PARAM="platform=instagram"
  CALLS_NEEDED=$CALLS_NEEDED_IG
  PERMISSION="instagram_business_manage_messages"
else
  PLATFORM_PARAM=""
  CALLS_NEEDED=$CALLS_NEEDED_FB
  PERMISSION="pages_messaging"
fi

echo "Permission: $PERMISSION"
echo "Required test calls: $CALLS_NEEDED"
echo ""

# Make test calls
for i in $(seq 1 $CALLS_NEEDED); do
  echo -n "Call $i/$CALLS_NEEDED: "
  
  URL="${GRAPH_API}/${ACCOUNT_ID}/conversations?fields=id,updated_time,participants&limit=5&access_token=${TOKEN}"
  if [ -n "$PLATFORM_PARAM" ]; then
    URL="${URL}&${PLATFORM_PARAM}"
  fi
  
  RESPONSE=$(curl -s -w "\n%{http_code}" "$URL" 2>&1)
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  
  if [ "$HTTP_CODE" = "200" ]; then
    # Extract conversation count
    CONV_COUNT=$(echo "$BODY" | grep -o '"data":\[' | head -1 | wc -c)
    if [ "$CONV_COUNT" -gt 1 ]; then
      echo "✅ HTTP $HTTP_CODE (OK)"
    else
      echo "✅ HTTP $HTTP_CODE (OK, may be empty)"
    fi
  else
    echo "❌ HTTP $HTTP_CODE"
    # Check for permission error
    if echo "$BODY" | grep -q '"code":3\|"code":200'; then
      echo "   ⚠️  Permission error — app review may not be approved yet"
    fi
    echo "   Response: $(echo "$BODY" | head -c 200)"
  fi
  
  # Small delay to avoid rate limit
  sleep 0.5
done

echo ""
echo "=== Done! $CALLS_NEEDED test calls completed ==="
echo ""
echo "Next steps:"
echo "1. Check Meta Developer Console → App Review → Permissions"
echo "2. Verify 'panggilan API uji' count has increased"
echo "3. Submit for review if all test calls are recorded"
