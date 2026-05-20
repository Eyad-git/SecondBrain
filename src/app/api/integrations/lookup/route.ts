import { NextResponse } from "next/server";
import { z } from "zod";

import { lookupIntegrationByName } from "@/lib/integrations/registry";

export const runtime = "nodejs";

const requestSchema = z.object({
  name: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await req.json());
    const candidate = lookupIntegrationByName(body.name);
    if (!candidate) {
      return NextResponse.json({ error: "No known integration matched that name." }, { status: 404 });
    }
    return NextResponse.json({
      integration: {
        name: candidate.name,
        baseUrl: candidate.website,
        auth: candidate.auth,
        notes: candidate.summary,
        requiresProfileName: Boolean(candidate.requiresProfileName),
        profileLabel: candidate.profileLabel ?? "profile name",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/integrations/lookup]", error);
    return NextResponse.json(
      { error: "Failed to lookup integration." },
      { status: 500 }
    );
  }
}

