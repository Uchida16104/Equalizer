import { NextRequest, NextResponse } from "next/server";

interface PresetPayload {
  id: string;
  name: string;
  data: Record<string, unknown>;
  createdAt: string;
}

const store = new Map<string, PresetPayload>();

export async function GET(_req: NextRequest) {
  const presets = Array.from(store.values());
  return NextResponse.json({ presets }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;

    if (
      typeof payload.id !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.data !== "object" ||
      payload.data === null
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const preset: PresetPayload = {
      id: payload.id,
      name: payload.name,
      data: payload.data as Record<string, unknown>,
      createdAt: typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString(),
    };

    store.set(preset.id, preset);

    return NextResponse.json({ ok: true, id: preset.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    store.delete(id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
