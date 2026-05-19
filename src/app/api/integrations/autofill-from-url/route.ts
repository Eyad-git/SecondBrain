import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchPublicPageText } from "@/lib/http/fetch-public-page-text";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().url(),
});

function inferAuthType(text: string): "api_key" | "oauth" | "unknown" {
  const lc = text.toLowerCase();
  if (
    lc.includes("oauth") ||
    lc.includes("openid") ||
    lc.includes("authorization code") ||
    lc.includes("client id")
  ) {
    return "oauth";
  }
  if (
    lc.includes("api key") ||
    lc.includes("x-api-key") ||
    lc.includes("bearer token") ||
    lc.includes("personal access token")
  ) {
    return "api_key";
  }
  return "unknown";
}

function titleFromUrl(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  const first = host.split(".")[0] ?? host;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await req.json());
    const fetched = await fetchPublicPageText(body.url);
    const finalUrl = new URL(fetched.fetchedUrl || body.url);
    const text = `${fetched.title ?? ""}\n${fetched.textExcerpt ?? ""}`.trim();

    const inferredName =
      fetched.title?.split("|")[0]?.split("-")[0]?.trim() || titleFromUrl(finalUrl);

    const shortNotes =
      fetched.textExcerpt.length > 280
        ? `${fetched.textExcerpt.slice(0, 280).trim()}…`
        : fetched.textExcerpt;

    return NextResponse.json({
      integration: {
        name: inferredName,
        baseUrl: finalUrl.origin,
        auth: inferAuthType(text),
        notes:
          shortNotes.length > 0
            ? `Auto-filled from docs: ${shortNotes}`
            : "Auto-filled from docs URL.",
      },
      source: {
        fetchedUrl: fetched.fetchedUrl,
        title: fetched.title ?? null,
        warning: fetched.warning ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Failed to infer details.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

