Create Payment
curl -X POST https://api-pay-sandbox.sumopod.com/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{
    "order_id": "INV-2026-001",
    "amount": 50000,
    "currency": "IDR",
    "expires_in_hours": 24,
    "success_return_url": "https://yourapp.com/success",
    "cancel_return_url": "https://yourapp.com/cancel",
    "payment_method_type_code": "QRIS"
  }'

Response
{
  "payment_id": "uuid",
  "order_id": "INV-2026-001",
  "amount": 50000,
  "fee": 750,
  "net_amount": 49250,
  "payment_link_url": "https://pay.sumopod.com/pay/uuid",
  "payment_code": "1308300301295957",
  "payment_code_type": "ACCOUNT_NUMBER",
  "payment_channel_used": "BRI.VA",
  "status": "pending",
  "expires_at": "2026-01-01T12:00:00Z"
}

Webhook Events
Configure your webhook URL in the Settings tab. We'll send HTTP POST requests to your URL when payment events occur.

Supported Events
Event	Description
payment.completed	Payment has been successfully completed
payment.failed	Payment has failed
payment.expired	Payment link has expired without payment
payment.test	Test event sent from Settings page
Webhook Payload
{
  "event_type": "payment.completed",
  "data": {
    "payment_id": "uuid",
    "order_id": "INV-2026-001",
    "amount": 50000,
    "fee": 750,
    "net_amount": 49250,
    "status": "completed",
    "payment_method": "qris",
    "completed_at": "2026-06-18T12:00:00Z"
  }
}

Expected Response
Your endpoint must respond with a 2xx status code within 10 seconds. If we don't receive a successful response, the webhook will be marked as failed and can be resent from the Webhooks tab.

Verifying Webhook Signatures
Every request includes three headers so you can confirm it really came from us: svix-id, svix-timestamp, and svix-signature. Get your project's signing secret from the Settings tab, then recompute the signature and compare it to the header. Never trust the payload without checking this.
const crypto = require("crypto");

function verifyWebhookSignature(secret, svixId, svixTimestamp, svixSignature, rawBody) {
  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  const expectedSignature = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // svix-signature may contain multiple space-separated "v1,<sig>" values
  // (this happens for ~24h after rotating the secret)
  const signatures = svixSignature.split(" ").map((s) => s.split(",")[1]);
  return signatures.includes(expectedSignature);
}

// Express route, use express.raw() so req.body stays unparsed
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const isValid = verifyWebhookSignature(
    process.env.WEBHOOK_SECRET, // whsec_...
    req.headers["svix-id"],
    req.headers["svix-timestamp"],
    req.headers["svix-signature"],
    req.body.toString("utf8")
  );

  if (!isValid) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(req.body);
  console.log("Verified webhook:", event.event_type);
  res.sendStatus(200);
});

Use the raw, unparsed request body. A single re-formatted whitespace character will break the signature match. We recommend using Svix's official verification libraries instead of hand-rolling this in production.

Verifying the Webhook Token
As a simpler alternative to signature verification, every request also includes an X-Webhook-Token header. Get your project's webhook token from the Settings tab, then compare it directly. No HMAC computation needed.
// Express route
app.post("/webhook", express.json(), (req, res) => {
  const expected = process.env.WEBHOOK_TOKEN; // whtok_...
  const received = req.headers["x-webhook-token"];

  if (expected !== received) {
    return res.status(401).send("Invalid webhook token");
  }

  console.log("Verified webhook:", req.body.event_type);
  res.sendStatus(200);
});