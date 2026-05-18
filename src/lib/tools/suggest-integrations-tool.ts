import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";

import { discoverIntegrations } from "@/lib/integrations/registry";

export const suggestIntegrationsTool = tool({
  description:
    "Suggest third-party APIs that match the user's current domain. Use this to propose possible integrations and then ask user consent before connecting any service.",
  inputSchema: zodSchema(
    z.object({
      context: z
        .string()
        .describe("User domain/context text used to infer relevant integrations."),
      limit: z.number().int().min(1).max(8).optional(),
    })
  ),
  execute: async (input) => {
    const matches = discoverIntegrations(input.context, input.limit ?? 5);
    return {
      suggested: matches,
      guidance:
        "Ask the user which integration they want, and get explicit consent before any connection workflow.",
    };
  },
});

