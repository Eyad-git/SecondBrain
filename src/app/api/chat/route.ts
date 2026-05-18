import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { googleGenerativeAiModelId } from "@/lib/ai/google-generative-model";
import { stringifyUserUiMessages } from "@/lib/chat/extract-user-text-from-ui";
import { buildGraphSystemAugmentation } from "@/lib/chat/graph-chat-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchPublicPageTool } from "@/lib/tools/fetch-public-page-tool";

export const runtime = "nodejs";

const requestSchema = z.object({
  messages: z.array(z.unknown()),
  mentionNodeIds: z.array(z.string()).optional(),
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
    const uiMessages = body.messages as UIMessage[];

    const userDigest = stringifyUserUiMessages(uiMessages);
    const supabase = await createSupabaseServerClient();
    const graphBlock = await buildGraphSystemAugmentation(supabase, userDigest, {
      extraNodeIds: body.mentionNodeIds,
    });

    const core = [
      "You are the Second Brain AI OS: concise, practical, and honest about uncertainty.",
      "When graph context is supplied, weight it heavily. If it is empty, do not invent node data.",
      "Respect user privacy: only reason about data that appears in messages or the graph block.",
    ].join(" ");

    const toolsInstructions =
      "You may call fetch_public_page when the user explicitly provides HTTP(S) URLs you must read verbatim from the wire. Prefer summarizing the returned excerpt; mention fetch failures honestly.";

    const system = [
      core,
      graphBlock,
      `(Tools) ${toolsInstructions}`,
      graphBlock
        ? ""
        : "(Graph) No @-mentioned nodes were parsed — answer from conversation + tools only.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const withoutIds = uiMessages.map(
      ({ id: _id, ...rest }) => rest
    ) as Omit<UIMessage, "id">[];

    const modelMessages = await convertToModelMessages(withoutIds);

    const result = streamText({
      model: google(googleGenerativeAiModelId()),
      system,
      messages: modelMessages,
      tools: {
        fetch_public_page: fetchPublicPageTool,
      },
      stopWhen: stepCountIs(10),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[api/chat]", error);
    return NextResponse.json(
      { error: "Failed to start chat stream" },
      { status: 500 }
    );
  }
}
