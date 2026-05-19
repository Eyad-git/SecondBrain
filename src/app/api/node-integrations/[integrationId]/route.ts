import { NextResponse } from "next/server";
import { z } from "zod";

import { encryptIntegrationSecret } from "@/lib/integrations/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  baseUrl: z.string().max(400).optional(),
  auth: z.enum(["api_key", "oauth", "unknown"]).optional(),
  notes: z.string().max(500).optional(),
  credential: z.string().max(4000).optional(),
});
const INTEGRATIONS_SETUP_MESSAGE =
  "Node API integrations are not initialized yet. Run db/node_api_integrations.sql in your Supabase SQL editor.";

function getMissingIntegrationsTableMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("node_api_integrations") &&
    (normalized.includes("could not find the table") ||
      normalized.includes("relation") ||
      normalized.includes("does not exist"))
  ) {
    return INTEGRATIONS_SETUP_MESSAGE;
  }
  return null;
}

function secretHint(secret: string): string | null {
  const trimmed = secret.trim();
  if (trimmed.length < 4) return null;
  return `••••${trimmed.slice(-4)}`;
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ integrationId: string }> }
) {
  try {
    const { integrationId } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("node_api_integrations")
      .delete()
      .eq("id", integrationId)
      .eq("user_id", user.id);

    if (error) {
      const setupMessage = getMissingIntegrationsTableMessage(error.message);
      if (setupMessage) {
        return NextResponse.json({ error: setupMessage }, { status: 503 });
      }
      return NextResponse.json(
        { error: `Delete failed: ${error.message}` },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/node-integrations:delete]", error);
    return NextResponse.json(
      { error: "Failed to delete node integration." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ integrationId: string }> }
) {
  try {
    const { integrationId } = await ctx.params;
    const body = patchSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updateBody: Record<string, unknown> = {};
    if (typeof body.name === "string") updateBody.name = body.name.trim();
    if (typeof body.baseUrl === "string") updateBody.base_url = body.baseUrl.trim();
    if (typeof body.auth === "string") updateBody.auth_type = body.auth;
    if (typeof body.notes === "string") updateBody.notes = body.notes.trim();
    if (typeof body.credential === "string") {
      const trimmed = body.credential.trim();
      updateBody.secret_ciphertext =
        trimmed.length > 0 ? encryptIntegrationSecret(trimmed) : null;
      updateBody.secret_hint = trimmed.length > 0 ? secretHint(trimmed) : null;
    }

    const { data, error } = await supabase
      .from("node_api_integrations")
      .update(updateBody)
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .select(
        "id,name,base_url,auth_type,notes,secret_ciphertext,secret_hint,created_at"
      )
      .single();

    if (error || !data) {
      const setupMessage = getMissingIntegrationsTableMessage(error?.message ?? "");
      if (setupMessage) {
        return NextResponse.json({ error: setupMessage }, { status: 503 });
      }
      return NextResponse.json(
        { error: `Update failed: ${error?.message ?? "unknown"}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      integration: {
        id: String(data.id),
        name: String(data.name ?? "Integration"),
        baseUrl: typeof data.base_url === "string" ? data.base_url : "",
        auth:
          data.auth_type === "api_key" ||
          data.auth_type === "oauth" ||
          data.auth_type === "unknown"
            ? data.auth_type
            : "unknown",
        notes: typeof data.notes === "string" ? data.notes : "",
        hasSecret: Boolean(data.secret_ciphertext),
        secretHint: typeof data.secret_hint === "string" ? data.secret_hint : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/node-integrations:patch]", error);
    return NextResponse.json(
      { error: "Failed to update node integration." },
      { status: 500 }
    );
  }
}

