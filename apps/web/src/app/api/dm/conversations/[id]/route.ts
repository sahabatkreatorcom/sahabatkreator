import { NextResponse } from "next/server";
import { getDMAdapterRegistry } from "@/lib/dm/adapters";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const limit = Number(searchParams.get("limit") || "50");
  const cursor = searchParams.get("cursor") || undefined;

  if (!platform) {
    return NextResponse.json(
      { error: "platform wajib diisi." },
      { status: 400 },
    );
  }

  const registry = getDMAdapterRegistry();
  const adapter = registry.getAdapter(platform as never);

  if (!adapter) {
    return NextResponse.json(
      { error: `DM untuk ${platform} belum didukung.` },
      { status: 501 },
    );
  }

  // TODO: Get account from session/DB
  const account = {
    id: "placeholder",
    organizationId: "placeholder",
    platform: platform as never,
    accessToken: "placeholder",
  };

  const result = await adapter.fetchMessages(account, params.id, limit, cursor);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    messages: result.messages,
    nextCursor: result.nextCursor,
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");

  if (!platform) {
    return NextResponse.json(
      { error: "platform wajib diisi." },
      { status: 400 },
    );
  }

  const registry = getDMAdapterRegistry();
  const adapter = registry.getAdapter(platform as never);

  if (!adapter) {
    return NextResponse.json(
      { error: `DM untuk ${platform} belum didukung.` },
      { status: 501 },
    );
  }

  // TODO: Get account from session/DB
  const account = {
    id: "placeholder",
    organizationId: "placeholder",
    platform: platform as never,
    accessToken: "placeholder",
  };

  const body = await request.json();
  const { text, attachments } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "text wajib diisi." }, { status: 400 });
  }

  const result = await adapter.sendMessage(
    account,
    params.id,
    text,
    attachments,
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ messageId: result.messageId }, { status: 201 });
}
