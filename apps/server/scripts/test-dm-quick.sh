#!/bin/bash
# =============================================================================
# Quick DM Permission Test — untuk generate test calls Meta App Review
# =============================================================================
#
# Cara pakai:
#   1. Buka Graph API Explorer: https://developers.facebook.com/tools/explorer/
#   2. Pilih app Sahabat Kreator
#   3. Generate token dengan permission: instagram_manage_messages, pages_messaging
#   4. Copy token
#   5. Jalankan script ini
#
# Instagram: butuh 10 test calls ke /conversations
# Facebook: butuh test calls ke /conversations
# =============================================================================

set -euo pipefail

GRAPH="https://graph.facebook.com/v26.0"

# ===== CONFIGURATION =====
# Isi token dari Graph API Explorer
IG_TOKEN=""
IG_ACCOUNT_ID="17841475755074774"  # Instagram account ID dari logs

FB_TOKEN=""
FB_ACCOUNT_ID="622205640985000"  # Facebook Page ID dari logs

IG_CALLS=10  # instagram_business_manage_messages: 10 test calls needed
FB_CALLS=10  # pages_messaging: test calls needed
# ==========================

echo "============================================"
echo "  DM Permission Test — Meta App Review"
echo "============================================"
echo ""

# --- Instagram DM Test ---
if [ -n "$IG_TOKEN" ]; then
  echo "=== Instagram DM (instagram_business_manage_messages) ==="
  echo "Account: $IG_ACCOUNT_ID"
  echo "Calls needed: $IG_CALLS"
  echo ""
  
  for i in $(seq 1 $IG_CALLS); do
    echo -n "  [$i/$IG_CALLS] "
    RESP=$(curl -s -w "|%{http_code}" \
      "${GRAPH}/${IG_ACCOUNT_ID}/conversations?platform=instagram&fields=id,updated_time,participants&limit=5&access_token=${IG_TOKEN}")
    
    CODE=$(echo "$RESP" | cut -d'|' -f2)
    BODY=$(echo "$RESP" | cut -d'|' -f1)
    
    if [ "$CODE" = "200" ]; then
      echo "✅ 200 OK"
    else
      ERR=$(echo "$BODY" | grep -o '"message":"[^"]*"' | head -1)
      echo "❌ $CODE — $ERR"
    fi
    sleep 0.3
  done
  echo ""
  echo "✅ Instagram: $IG_CALLS calls completed"
  echo ""
else
  echo "⚠️  Instagram: Token not set (set IG_TOKEN in script)"
  echo ""
fi

# --- Facebook DM Test ---
if [ -n "$FB_TOKEN" ]; then
  echo "=== Facebook DM (pages_messaging) ==="
  echo "Page: $FB_ACCOUNT_ID"
  echo "Calls needed: $FB_CALLS"
  echo ""
  
  for i in $(seq 1 $FB_CALLS); do
    echo -n "  [$i/$FB_CALLS] "
    RESP=$(curl -s -w "|%{http_code}" \
      "${GRAPH}/${FB_ACCOUNT_ID}/conversations?fields=id,updated_time,participants&limit=5&access_token=${FB_TOKEN}")
    
    CODE=$(echo "$RESP" | cut -d'|' -f2)
    BODY=$(echo "$RESP" | cut -d'|' -f1)
    
    if [ "$CODE" = "200" ]; then
      echo "✅ 200 OK"
    else
      ERR=$(echo "$BODY" | grep -o '"message":"[^"]*"' | head -1)
      echo "❌ $CODE — $ERR"
    fi
    sleep 0.3
  done
  echo ""
  echo "✅ Facebook: $FB_CALLS calls completed"
  echo ""
else
  echo "⚠️  Facebook: Token not set (set FB_TOKEN in script)"
  echo ""
fi

echo "============================================"
echo "  NEXT STEPS"
echo "============================================"
echo ""
echo "1. Buka: https://developers.facebook.com/apps/"
echo "2. Pilih app → App Review → Permissions and Features"
echo "3. Cek 'panggilan API uji' sudah bertambah"
echo "4. Instagram: perlu 10 calls → Submit for review"
echo "5. Facebook: perlu pages_messaging → Request permission"
echo ""
echo "Cara generate token:"
echo "  1. Graph API Explorer: https://developers.facebook.com/tools/explorer/"
echo "  2. Select app: Sahabat Kreator"
echo "  3. Click 'Generate Access Token'"
echo "  4. Add permissions: instagram_manage_messages, pages_messaging"
echo "  5. Copy token → paste ke script ini"
