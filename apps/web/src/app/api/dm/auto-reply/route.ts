import { env } from "@sahabat-kreator/env/server";
import { NextResponse } from "next/server";
import { DMAutoReplyManager } from "@/lib/dm/auto-reply";

function getManager() {
  if (!env.REPLIZ_ACCESS_KEY || !env.REPLIZ_SECRET_KEY) {
    return null;
  }
  return new DMAutoReplyManager(
    env.REPLIZ_ACCESS_KEY,
    env.REPLIZ_SECRET_KEY,
    env.REPLIZ_API_URL,
  );
}

export async function GET(request: Request) {
  const manager = getManager();
  if (!manager) {
    return NextResponse.json(
      { error: "Repliz belum dikonfigurasi." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || "instagram";

  try {
    const rules = await manager.getRules(platform);
    return NextResponse.json({ rules });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengambil rules." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const manager = getManager();
  if (!manager) {
    return NextResponse.json(
      { error: "Repliz belum dikonfigurasi." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const result = await manager.createRule(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ruleId: result.ruleId }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal membuat rule." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const manager = getManager();
  if (!manager) {
    return NextResponse.json(
      { error: "Repliz belum dikonfigurasi." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const { ruleId, ...updates } = body;

    if (!ruleId) {
      return NextResponse.json(
        { error: "ruleId wajib diisi." },
        { status: 400 },
      );
    }

    const result = await manager.updateRule(ruleId, updates);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengupdate rule." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const manager = getManager();
  if (!manager) {
    return NextResponse.json(
      { error: "Repliz belum dikonfigurasi." },
      { status: 503 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("ruleId");

    if (!ruleId) {
      return NextResponse.json(
        { error: "ruleId wajib diisi." },
        { status: 400 },
      );
    }

    const result = await manager.deleteRule(ruleId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menghapus rule." },
      { status: 500 },
    );
  }
}
