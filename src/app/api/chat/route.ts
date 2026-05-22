import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { googleGenerativeAiModelId } from "@/lib/ai/google-generative-model";
import { stringifyUserUiMessages } from "@/lib/chat/extract-user-text-from-ui";
import { buildGraphSystemAugmentation } from "@/lib/chat/graph-chat-context";
import { baseAssistantInstructions } from "@/lib/chat/system-instructions";
import { listEffectiveIntegrationsForNodes } from "@/lib/integrations/effective-node-integrations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchPublicPageTool } from "@/lib/tools/fetch-public-page-tool";
import { suggestIntegrationsTool } from "@/lib/tools/suggest-integrations-tool";
import { fetchGooglePhotoBinary } from "@/lib/google-photos/fetch-photo-binary";
import { GOOGLE_PHOTOS_TOKEN_COOKIE } from "@/lib/google-photos/token";

export const runtime = "nodejs";

const requestSchema = z.object({
  messages: z.array(z.unknown()),
  mentionNodeIds: z.array(z.string()).optional(),
  googlePhotosAccessToken: z.string().min(1).max(6000).optional().nullable(),
});

type ChatPhotoRow = {
  node_id: string;
  item_type: string | null;
  title: string | null;
  mime_type: string | null;
  created_time: string | null;
  camera_make: string | null;
  camera_model: string | null;
  product_url: string | null;
  media_url: string | null;
};

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
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(GOOGLE_PHOTOS_TOKEN_COOKIE)?.value?.trim() ?? "";
    const effectiveGooglePhotosToken = body.googlePhotosAccessToken?.trim() || cookieToken || "";

    const userDigest = stringifyUserUiMessages(uiMessages);
    const supabase = await createSupabaseServerClient();
    const graphBlock = await buildGraphSystemAugmentation(supabase, userDigest, {
      extraNodeIds: body.mentionNodeIds,
    });

    const core = [
      "You are the Second Brain AI OS: concise, practical, and honest about uncertainty.",
      "When graph context is supplied, weight it heavily. If it is empty, do not invent node data.",
      "Respect user privacy: only reason about data that appears in messages or the graph block.",
      "Be proactively curious about the user's past baseline, present constraints, and future goals.",
    ].join(" ");

    const toolsInstructions =
      [
        "You may call fetch_public_page when the user explicitly provides HTTP(S) URLs you must read verbatim from the wire.",
        "You may call suggest_integrations when domain context implies useful API connections. Offer suggestions and ask user consent before any integration workflow.",
        "Prefer summarizing tool output and mention fetch failures honestly.",
      ].join(" ");

    const integrationNodeIds = [
      ...new Set((body.mentionNodeIds ?? []).filter(Boolean)),
    ];
    let integrationBlock = "";
    let googlePhotosBlock = "";
    if (integrationNodeIds.length > 0) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        try {
          const integrationsByNode = await listEffectiveIntegrationsForNodes(
            supabase,
            user.id,
            integrationNodeIds
          );
          const lines = integrationNodeIds.flatMap((nodeId) =>
            (integrationsByNode[nodeId] ?? []).map((x) => {
              const inheritedLabel = x.inherited
                ? ` (inherited from ${x.sourceNodeTitle ?? x.sourceNodeId})`
                : "";
              return `- node=${nodeId} | ${x.name}${inheritedLabel} | auth=${x.auth} | base=${x.baseUrl || "(none)"} | notes=${x.notes || "(none)"} | secret=${x.secretHint || "none"}`;
            })
          );
          if (lines.length > 0) {
            integrationBlock = [
              "## Node API integrations (effective metadata)",
              ...lines,
            ].join("\n");
          }
        } catch (integrationErr) {
          const message =
            integrationErr instanceof Error ? integrationErr.message : "unknown";
          console.error("[api/chat] node_api_integrations:", message);
        }
        try {
          const { data: photosRows, error: photosError } = await supabase
            .from("node_google_photos_items")
            .select(
              "node_id,item_type,title,mime_type,created_time,camera_make,camera_model,product_url,media_url"
            )
            .eq("user_id", user.id)
            .in("node_id", integrationNodeIds)
            .order("created_at", { ascending: false })
            .limit(80);
          if (photosError) throw new Error(photosError.message);
          const normalizedRows = (photosRows ?? []) as ChatPhotoRow[];
          const lines = normalizedRows.slice(0, 60).map((row) => {
            const parts = [
              `- node=${String(row.node_id)}`,
              `type=${row.item_type === "album" ? "album" : "photo"}`,
              `title=${typeof row.title === "string" && row.title.trim().length > 0 ? row.title : "(untitled)"}`,
              typeof row.created_time === "string" ? `created=${row.created_time}` : null,
              typeof row.mime_type === "string" ? `mime=${row.mime_type}` : null,
              row.camera_make || row.camera_model
                ? `camera=${[row.camera_make, row.camera_model].filter(Boolean).join(" ")}`
                : null,
              typeof row.product_url === "string" && row.product_url.length > 0
                ? `url=${row.product_url}`
                : null,
            ].filter(Boolean);
            return parts.join(" | ");
          });
          if (lines.length > 0) {
            googlePhotosBlock = [
              "## Node Google Photos context (user-selected)",
              ...lines,
            ].join("\n");
          }
          if (effectiveGooglePhotosToken) {
            const selectedForVision = normalizedRows
              .filter((row) => typeof row.media_url === "string" && row.media_url.length > 0)
              .slice(0, 4);
            const imageParts: Array<{
              title: string;
              mimeType: string;
              bytes: Uint8Array;
            }> = [];
            for (const row of selectedForVision) {
              const mediaUrl = row.media_url ?? "";
              if (!mediaUrl) continue;
              const binary = await fetchGooglePhotoBinary(
                mediaUrl,
                effectiveGooglePhotosToken,
                row.mime_type
              );
              if (!binary) continue;
              imageParts.push({
                title:
                  typeof row.title === "string" && row.title.trim().length > 0
                    ? row.title
                    : "Selected Google Photo",
                mimeType: binary.mimeType,
                bytes: binary.bytes,
              });
            }
            if (imageParts.length > 0) {
              const notes = imageParts
                .map((part, i) => `${i + 1}. ${part.title}`)
                .join("\n");
              googlePhotosBlock = [
                googlePhotosBlock,
                `Attached ${imageParts.length} selected Google Photos image(s) for visual analysis in this turn.`,
              ]
                .filter(Boolean)
                .join("\n\n");
              const imageAugmentationMessage = {
                role: "user" as const,
                content: [
                  {
                    type: "text" as const,
                    text: [
                      "You MUST analyze the attached image pixels (composition, lighting, subject, color, framing).",
                      "Do not answer from filenames or metadata alone.",
                      "Image list:",
                      notes,
                    ].join("\n"),
                  },
                  ...imageParts.map((part) => ({
                    type: "image" as const,
                    image: part.bytes,
                    mimeType: part.mimeType,
                  })),
                ],
              };
              const withoutIds = uiMessages.map((m) => {
                const rest = { ...m } as Partial<UIMessage>;
                delete rest.id;
                return rest as Omit<UIMessage, "id">;
              });
              const modelMessages = await convertToModelMessages(withoutIds);
              const result = streamText({
                model: google(googleGenerativeAiModelId()),
                system: [
                  core,
                  baseAssistantInstructions({ allowIntegrationSuggestions: true }),
                  graphBlock,
                  integrationBlock,
                  googlePhotosBlock,
                  `(Tools) ${toolsInstructions}`,
                  graphBlock
                    ? ""
                    : "(Graph) No @-mentioned nodes were parsed — answer from conversation + tools only.",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
                messages: [...modelMessages, imageAugmentationMessage],
                tools: {
                  fetch_public_page: fetchPublicPageTool,
                  suggest_integrations: suggestIntegrationsTool,
                },
                stopWhen: stepCountIs(10),
              });

              return result.toUIMessageStreamResponse();
            }
          }
        } catch (photosErr) {
          const message = photosErr instanceof Error ? photosErr.message : "unknown";
          console.error("[api/chat] node_google_photos_items:", message);
        }
      }
    }

    const system = [
      core,
      baseAssistantInstructions({ allowIntegrationSuggestions: true }),
      graphBlock,
      integrationBlock,
      googlePhotosBlock,
      `(Tools) ${toolsInstructions}`,
      graphBlock
        ? ""
        : "(Graph) No @-mentioned nodes were parsed — answer from conversation + tools only.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const withoutIds = uiMessages.map((m) => {
      const rest = { ...m } as Partial<UIMessage>;
      delete rest.id;
      return rest as Omit<UIMessage, "id">;
    });

    const modelMessages = await convertToModelMessages(withoutIds);

    const result = streamText({
      model: google(googleGenerativeAiModelId()),
      system,
      messages: modelMessages,
      tools: {
        fetch_public_page: fetchPublicPageTool,
        suggest_integrations: suggestIntegrationsTool,
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
