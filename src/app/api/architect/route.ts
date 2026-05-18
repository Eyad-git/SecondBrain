import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { googleGenerativeAiModelId } from "@/lib/ai/google-generative-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    /** Load an existing row the user owns (RLS). */
    nodeId: z.string().uuid().optional(),
    /** Or describe a node before INSERT — title + node_level required when nodeId omitted. */
    title: z.string().min(1).optional(),
    node_level: z.enum(["account", "domain", "project", "task"]).optional(),
    parent_title: z.string().optional(),
    /** Optional user-entered hints (URLs, pasted notes, constraints). */
    context_hint: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.nodeId) return;
    if (!val.title || !val.node_level) {
      ctx.addIssue({
        code: "custom",
        message: "Provide nodeId OR both title and node_level.",
      });
    }
  });

/** Scalar fields only — Gemini rejects tuple/array JSON Schema (`items`) in response_schema. */
const architectResultSchema = z.object({
  system_prompt: z
    .string()
    .min(40)
    .describe(
      "Persona and operating rules this tab should follow (Markdown allowed, second person)."
    ),
  onboarding_question_1: z
    .string()
    .min(15)
    .describe("First actionable onboarding question."),
  onboarding_question_2: z
    .string()
    .min(15)
    .describe("Second actionable onboarding question."),
  onboarding_question_3: z
    .string()
    .min(15)
    .describe("Third actionable onboarding question."),
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
    const body = requestSchema.parse(await req.json());

    let title = body.title ?? "";
    let nodeLevel = body.node_level ?? "domain";
    let parentTitle = body.parent_title;
    let contextHint = body.context_hint ?? "";

    if (body.nodeId) {
      const supabase = await createSupabaseServerClient();

      const { data: row, error } = await supabase
        .from("nodes")
        .select(
          "id,title,node_level,parent_id,core_summary,status,system_prompt"
        )
        .eq("id", body.nodeId)
        .is("archived_at", null)
        .maybeSingle();

      if (error) {
        console.error("[api/architect] Supabase:", error.message);
        return NextResponse.json(
          { error: "Failed to load node" },
          { status: 400 }
        );
      }
      if (!row) {
        return NextResponse.json({ error: "Node not found" }, { status: 404 });
      }

      title = row.title ?? title;
      nodeLevel = row.node_level ?? nodeLevel;

      if (row.parent_id) {
        const { data: parent } = await supabase
          .from("nodes")
          .select("title")
          .eq("id", row.parent_id)
          .maybeSingle();
        parentTitle = parent?.title ?? parentTitle;
      }

      if (row.system_prompt?.trim()) {
        contextHint = [contextHint, `Existing_prompt_stub: ${row.system_prompt}`]
          .filter(Boolean)
          .join("\n");
      }
      if (row.core_summary?.trim()) {
        contextHint = [contextHint, `Known_summary: ${row.core_summary}`]
          .filter(Boolean)
          .join("\n");
      }
    }

    const userBrief = [
      "## Node",
      `Title: ${title}`,
      `Level: ${nodeLevel}`,
      parentTitle ? `Parent context: ${parentTitle}` : "Parent context: (none)",
      contextHint.trim()
        ? `Additional hints:\\n${contextHint.trim()}`
        : "",
    ].join("\n");

    const { object } = await generateObject({
      model: google(googleGenerativeAiModelId()),
      schema: architectResultSchema,
      system: [
        "You design Second Brain workspaces: personas for focused tabs.",
        "Output JSON only matching the schema. No preamble.",
        "system_prompt: concrete operating instructions + tone limits + escalation rules (<500 words preferred). Avoid claiming live web access.",
        "onboarding_question_1/2/3: distinct short actionable questions tailored to accelerate context capture (profiles, urls, KPIs).",
      ].join("\n"),
      prompt: userBrief,
    });

    const architectBody = {
      system_prompt: object.system_prompt,
      onboarding_questions: [
        object.onboarding_question_1,
        object.onboarding_question_2,
        object.onboarding_question_3,
      ],
    };

    return NextResponse.json(architectBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/architect]", error);
    return NextResponse.json({ error: "Architect failed" }, { status: 500 });
  }
}
