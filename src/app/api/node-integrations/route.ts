import { NextResponse } from "next/server";
import { z } from "zod";

import { listEffectiveIntegrationsForNodes } from "@/lib/integrations/effective-node-integrations";
import { encryptIntegrationSecret } from "@/lib/integrations/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const authEnum = z.enum(["api_key", "oauth", "unknown"]);
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

const createSchema = z.object({
  nodeId: z.string().uuid(),
  name: z.string().min(1).max(120),
  baseUrl: z.string().max(400).optional().default(""),
  auth: authEnum,
  notes: z.string().max(500).optional().default(""),
  credential: z.string().max(4000).optional(),
});

function secretHint(secret: string): string | null {
  const trimmed = secret.trim();
  if (trimmed.length < 4) return null;
  return `••••${trimmed.slice(-4)}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) {
      return NextResponse.json({ error: "nodeId is required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const byNodeId = await listEffectiveIntegrationsForNodes(supabase, user.id, [nodeId]);
      return NextResponse.json({ integrations: byNodeId[nodeId] ?? [] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      const setupMessage = getMissingIntegrationsTableMessage(message);
      if (setupMessage) {
        return NextResponse.json({
          integrations: [],
          setupRequired: true,
          setupMessage,
        });
      }
      return NextResponse.json(
        { error: `Could not load integrations: ${message}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[api/node-integrations:get]", error);
    return NextResponse.json(
      { error: "Failed to load node integrations." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: node } = await supabase
      .from("nodes")
      .select("id,user_id")
      .eq("id", body.nodeId)
      .maybeSingle();
    if (!node || node.user_id !== user.id) {
      return NextResponse.json({ error: "Node not found." }, { status: 404 });
    }

    const trimmedCredential = body.credential?.trim() ?? "";
    const encryptedCredential =
      trimmedCredential.length > 0
        ? encryptIntegrationSecret(trimmedCredential)
        : null;

    const { data: inserted, error } = await supabase
      .from("node_api_integrations")
      .insert({
        user_id: user.id,
        node_id: body.nodeId,
        name: body.name.trim(),
        base_url: body.baseUrl.trim(),
        auth_type: body.auth,
        notes: body.notes.trim(),
        secret_ciphertext: encryptedCredential,
        secret_hint: encryptedCredential ? secretHint(trimmedCredential) : null,
      })
      .select(
        "id,name,base_url,auth_type,notes,secret_ciphertext,secret_hint,created_at"
      )
      .single();

    if (error || !inserted) {
      const setupMessage = getMissingIntegrationsTableMessage(error?.message ?? "");
      if (setupMessage) {
        return NextResponse.json({ error: setupMessage }, { status: 503 });
      }
      return NextResponse.json(
        { error: `Could not create integration: ${error?.message ?? "unknown"}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      integration: {
        id: String(inserted.id),
        name: String(inserted.name ?? "Integration"),
        baseUrl: typeof inserted.base_url === "string" ? inserted.base_url : "",
        auth:
          inserted.auth_type === "api_key" ||
          inserted.auth_type === "oauth" ||
          inserted.auth_type === "unknown"
            ? inserted.auth_type
            : "unknown",
        notes: typeof inserted.notes === "string" ? inserted.notes : "",
        hasSecret: Boolean(inserted.secret_ciphertext),
        secretHint:
          typeof inserted.secret_hint === "string" ? inserted.secret_hint : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/node-integrations:post]", error);
    return NextResponse.json(
      { error: "Failed to create node integration." },
      { status: 500 }
    );
  }
}

