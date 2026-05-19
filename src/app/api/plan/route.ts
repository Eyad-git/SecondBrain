import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { googleGenerativeAiModelId } from "@/lib/ai/google-generative-model";
import { buildGraphSystemAugmentation } from "@/lib/chat/graph-chat-context";
import { baseAssistantInstructions } from "@/lib/chat/system-instructions";
import { listEffectiveIntegrationsForNodes } from "@/lib/integrations/effective-node-integrations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  nodeId: z.string().uuid(),
  reason: z.string().optional(),
});

const planSchema = z.object({
  title: z.string().min(4),
  summary: z.string().min(20),
  milestones_markdown: z.string().min(20),
  next_actions_markdown: z.string().min(20),
  risks_markdown: z.string().min(20),
});

export async function POST(req: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "Missing GOOGLE_GENERATIVE_AI_API_KEY. Add it to .env.local for Gemini.",
      },
      { status: 500 }
    );
  }

  try {
    const { nodeId, reason } = requestSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: node, error } = await supabase
      .from("nodes")
      .select("id,title,node_level,core_summary,system_prompt,status,archived_at")
      .eq("id", nodeId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!node || node.archived_at) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const digest = [
      node.title ?? "",
      node.core_summary ?? "",
      node.system_prompt ?? "",
      reason ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const graphBlock = await buildGraphSystemAugmentation(supabase, digest, {
      extraNodeIds: [nodeId],
    });

    let nodeIntegrations: Array<{
      name: string;
      auth: "api_key" | "oauth" | "unknown";
      baseUrl: string;
      notes: string;
      secretHint: string | null;
      inherited: boolean;
      sourceNodeId: string;
      sourceNodeTitle: string | null;
    }> = [];
    try {
      const byNode = await listEffectiveIntegrationsForNodes(supabase, user.id, [nodeId]);
      nodeIntegrations = (byNode[nodeId] ?? []).map((x) => ({
        name: x.name,
        auth: x.auth,
        baseUrl: x.baseUrl,
        notes: x.notes,
        secretHint: x.secretHint,
        inherited: x.inherited,
        sourceNodeId: x.sourceNodeId,
        sourceNodeTitle: x.sourceNodeTitle,
      }));
    } catch (integrationsErr) {
      const message =
        integrationsErr instanceof Error ? integrationsErr.message : "unknown";
      console.error("[api/plan] node_api_integrations:", message);
    }

    const prompt = [
      "Create a practical living plan for this node.",
      `Node title: ${node.title ?? "Untitled node"}`,
      `Node level: ${String(node.node_level)}`,
      `Node status: ${String(node.status ?? "active")}`,
      node.system_prompt ? `System prompt:\n${node.system_prompt}` : "",
      node.core_summary ? `Core summary:\n${node.core_summary}` : "",
      graphBlock ? `Graph context:\n${graphBlock}` : "",
      nodeIntegrations.length > 0
        ? [
            "Node API integrations (effective, including inherited):",
            ...nodeIntegrations.map(
              (x) =>
                `- ${x.name} (${x.auth})${x.inherited ? ` inherited from ${x.sourceNodeTitle ?? x.sourceNodeId}` : ""} base=${x.baseUrl || "(none)"} notes=${x.notes || "(none)"} secret=${x.secretHint || "none"}`
            ),
          ].join("\n")
        : "",
      reason ? `Refresh reason: ${reason}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { object } = await generateObject({
      model: google(googleGenerativeAiModelId()),
      schema: planSchema,
      system: [
        "You generate concise operating plans for a single workspace node.",
        baseAssistantInstructions(),
        "Output JSON only.",
        "Use markdown lists in milestones_markdown, next_actions_markdown, and risks_markdown.",
        "Prioritize specific steps that can be executed this week.",
      ].join("\n"),
      prompt,
    });

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      plan: object,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/plan]", error);
    return NextResponse.json({ error: "Plan generation failed." }, { status: 500 });
  }
}

