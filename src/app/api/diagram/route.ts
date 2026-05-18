import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { googleGenerativeAiModelId } from "@/lib/ai/google-generative-model";
import { baseAssistantInstructions } from "@/lib/chat/system-instructions";

export const runtime = "nodejs";

const requestSchema = z.object({
  planTitle: z.string().min(3),
  planSummary: z.string().min(8),
  milestonesMarkdown: z.string().min(8),
});

const diagramSchema = z.object({
  title: z.string().min(3),
  mermaid: z.string().min(12),
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
    const prompt = [
      `Plan title: ${body.planTitle}`,
      `Plan summary: ${body.planSummary}`,
      `Milestones:\n${body.milestonesMarkdown}`,
      "Return a compact Mermaid flowchart for this plan.",
    ].join("\n\n");

    const { object } = await generateObject({
      model: google(googleGenerativeAiModelId()),
      schema: diagramSchema,
      system: [
        "You generate Mermaid diagrams from plans.",
        baseAssistantInstructions(),
        "Output JSON only.",
        "Mermaid must start with flowchart TD and use safe node ids with no spaces.",
      ].join("\n"),
      prompt,
    });

    return NextResponse.json(object);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/diagram]", error);
    return NextResponse.json(
      { error: "Diagram generation failed." },
      { status: 500 }
    );
  }
}

