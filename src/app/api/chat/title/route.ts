import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { googleGenerativeAiModelId } from "@/lib/ai/google-generative-model";
import { summarizeMessagesForTitle } from "@/lib/chat/summarize-messages-for-title";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const uiMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  parts: z
    .array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
      })
    )
    .optional(),
});

const requestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1),
  nodeTitle: z.string().optional(),
});

const titleResultSchema = z.object({
  title: z
    .string()
    .min(2)
    .max(72)
    .describe(
      "Short chat title, 3–8 words, no quotes, describes the main topic of the conversation."
    ),
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
    const { messages, nodeTitle } = requestSchema.parse(await req.json());

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transcript = summarizeMessagesForTitle(
      messages as Parameters<typeof summarizeMessagesForTitle>[0]
    );

    if (!transcript.trim()) {
      return NextResponse.json({ title: "Chat" });
    }

    const { object } = await generateObject({
      model: google(googleGenerativeAiModelId()),
      schema: titleResultSchema,
      prompt: [
        "Generate a concise title for this chat thread in a personal knowledge app.",
        nodeTitle ? `Graph node context: "${nodeTitle}".` : null,
        "Use plain language. No trailing period. No quotation marks around the title.",
        "",
        "Conversation excerpt:",
        transcript,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    const title = object.title.trim().replace(/^["']|["']$/g, "");
    return NextResponse.json({ title: title || "Chat" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Title generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
