import { NextResponse } from "next/server";
import { z } from "zod";

import { discoverIntegrations } from "@/lib/integrations/registry";

export const runtime = "nodejs";

const requestSchema = z.object({
  context: z.string().min(1),
  limit: z.number().int().min(1).max(8).optional(),
});

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await req.json());
    const candidates = discoverIntegrations(body.context, body.limit ?? 5);
    return NextResponse.json({ suggested: candidates });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/integrations/discover]", error);
    return NextResponse.json(
      { error: "Failed to discover integration candidates." },
      { status: 500 }
    );
  }
}

