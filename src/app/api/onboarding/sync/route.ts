import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { googleGenerativeAiModelId } from "@/lib/ai/google-generative-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_SUMMARY_CHARS = 32_000;
const NEXT_Q_MIN_LEN = 15;

const bodySchema = z.object({
  nodeId: z.string().uuid(),
  question: z.string().optional(),
  answer: z.string(),
});

/** Scalar-ish fields for Gemini structured output (mirrors `/api/architect`). */
const syncResultSchema = z.object({
  core_summary: z
    .string()
    .describe(
      "Full updated Markdown-ready summary merging the prior summary and the user's newest answer."
    ),
  answer_sufficient: z.boolean(),
  coach_message: z
    .string()
    .describe(
      "If answer_sufficient is false: one short actionable hint (otherwise empty)."
    ),
  next_question_if_any: z.string().describe(
    "When answer_sufficient is true AND a single strong follow-up would help further: question with clear ask (otherwise empty)."
  ),
});

function clampStringList(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((q) => q.length > 0);
}

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
    const { nodeId, answer, question } = bodySchema.parse(await req.json());

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: row, error: rowErr } = await supabase
      .from("nodes")
      .select(
        "id,user_id,title,node_level,core_summary,status,system_prompt,onboarding_questions,onboarding_answers,archived_at"
      )
      .eq("id", nodeId)
      .maybeSingle();

    if (rowErr) {
      console.error("[api/onboarding/sync] load:", rowErr.message);
      return NextResponse.json({ error: "Failed to load node" }, { status: 400 });
    }
    if (!row || row.archived_at) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }
    if ((row.user_id as string | null) !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const questions = clampStringList(row.onboarding_questions);
    if (questions.length === 0) {
      return NextResponse.json({
        done: true as const,
        core_summary:
          typeof row.core_summary === "string" ? row.core_summary : null,
        onboarding_questions: null as string[] | null,
        onboarding_answers: null as string[] | null,
        status: typeof row.status === "string" ? row.status : "active",
      });
    }

    const selectedQuestion =
      typeof question === "string" ? question.trim() : "";
    const selectedIndex = selectedQuestion
      ? questions.findIndex((q) => q === selectedQuestion)
      : -1;
    const questionIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const currentQuestion = questions[questionIndex];

    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({
        skipped: true as const,
        reason: "empty_answer",
      });
    }

    const priorSummary = (row.core_summary as string | null)?.trim() ?? "";
    const systemPrompt = (row.system_prompt as string | null)?.trim() ?? "";

    if (trimmed.length < 6) {
      return NextResponse.json({
        skipped: true as const,
        reason: "answer_too_short",
        coach_message:
          "Write a sentence or two so we can weave it into Context.",
      });
    }

    const nodeBrief = [
      "## Workspace node",
      `Title: ${(row.title as string | null) ?? "(untitled)"}`,
      `Level: ${String(row.node_level)}`,
      systemPrompt ? `Persona excerpt:\n${systemPrompt.slice(0, 2800)}` : "",
      priorSummary
        ? `Existing core_summary:\n${priorSummary.slice(0, 12_000)}`
        : "Existing core_summary: (none yet)",
      "\n## Current onboarding question\n",
      currentQuestion,
      "\n## Latest user reply\n",
      trimmed,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { object } = await generateObject({
      model: google(googleGenerativeAiModelId()),
      schema: syncResultSchema,
      system: [
        "You ingest onboarding answers into a node's living Context summary.",
        "Output JSON only matching the schema. No preamble.",
        "Always return fresh core_summary: merge factual content from Prior summary plus the Latest reply;",
        "do not silently drop unrelated prior bullets unless plainly superseded.",
        "Keep tone crisp; headings or bullets okay; preserve node-specific facts.",
        "answer_sufficient: true ONLY when the reply meaningfully engages the onboarding question;",
        "'yes'/'idk'/single words normally false unless the question invites that.",
        "coach_message only when insufficient: ONE short line guiding what to clarify (else empty string).",
        "next_question_if_any only when advancing: optionally ONE substantive follow-up (>=15 chars) that deepens onboarding;",
        "usually empty unless the user's answer uncovered a clearer next gap.",
        "Never invent URLs, KPIs, or events that appear nowhere above.",
      ].join("\n"),
      prompt: nodeBrief,
    });

    const nextSummary = object.core_summary.trim().slice(0, MAX_SUMMARY_CHARS);
    const rowStatus =
      typeof row.status === "string" ? row.status : "onboarding";

    if (!object.answer_sufficient) {
      const { error: updErr } = await supabase
        .from("nodes")
        .update({ core_summary: nextSummary })
        .eq("id", nodeId);

      if (updErr) {
        console.error("[api/onboarding/sync] persist:", updErr.message);
        return NextResponse.json(
          { error: "Could not save context." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        answer_sufficient: false as const,
        coach_message: object.coach_message?.trim() ?? "",
        core_summary: nextSummary,
      });
    }

    let restQueue = questions.filter((_, index) => index !== questionIndex);
    const follow = object.next_question_if_any?.trim() ?? "";
    if (follow.length >= NEXT_Q_MIN_LEN) {
      restQueue = [...restQueue, follow].slice(0, 6);
    }

    const onboardingQuestionsPayload =
      restQueue.length > 0 ? restQueue : null;

    const nextStatus =
      onboardingQuestionsPayload == null
        ? rowStatus === "onboarding"
          ? "active"
          : rowStatus
        : rowStatus;

    const updateBody: Record<string, unknown> = {
      core_summary: nextSummary,
      onboarding_questions: onboardingQuestionsPayload,
      onboarding_answers: null,
    };
    if (nextStatus !== rowStatus) updateBody.status = nextStatus;

    const { error: advanceErr } = await supabase
      .from("nodes")
      .update(updateBody)
      .eq("id", nodeId);

    if (advanceErr) {
      console.error("[api/onboarding/sync] advance:", advanceErr.message);
      return NextResponse.json(
        { error: "Could not advance onboarding." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      answer_sufficient: true as const,
      coach_message: "",
      core_summary: nextSummary,
      onboarding_questions: onboardingQuestionsPayload,
      onboarding_answers: null as string[] | null,
      status: nextStatus,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/onboarding/sync]", error);
    return NextResponse.json(
      { error: "Onboarding sync failed." },
      { status: 500 }
    );
  }
}
