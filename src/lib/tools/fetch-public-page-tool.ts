import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";

import { fetchPublicPageText } from "@/lib/http/fetch-public-page-text";

/**
 * Tool for chat: Gemini can invoke this when the user supplies a URL to ground answers.
 */
export const fetchPublicPageTool = tool({
  description:
    "Fetch a publicly reachable HTTP(S) URL and return a cleaned text excerpt plus metadata. Use when the user pastes a URL you need to summarize or cite. Do not infer secret content; obey robots/safety and surface fetch errors verbatim.",
  inputSchema: zodSchema(
    z.object({
      url: z.string().describe("Fully qualified HTTP or HTTPS URL the user referenced."),
      reason: z
        .string()
        .optional()
        .describe("Short rationale for fetching (helps audits)."),
    })
  ),
  execute: async (input) => {
    try {
      return await fetchPublicPageText(input.url);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        url: input.url,
        error: message,
        textExcerpt: "",
      };
    }
  },
});
