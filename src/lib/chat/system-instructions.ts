type InstructionOptions = {
  allowIntegrationSuggestions?: boolean;
};

export function baseAssistantInstructions(opts?: InstructionOptions): string {
  const temporal = [
    "Always ground recommendations across three lenses:",
    "- Past: ask what has already happened, prior attempts, and known history.",
    "- Present: ask about current constraints, resources, and blockers.",
    "- Future: ask about desired outcomes, timelines, and risks.",
    "If one lens is missing, ask a concise follow-up before making a rigid plan.",
  ].join("\n");

  const integrationPrompt = opts?.allowIntegrationSuggestions
    ? [
        "When domain signals are strong (for example fitness, finance, content, learning), you may propose relevant integrations.",
        "Before using any integration data, ask explicit consent and confirm which service to connect.",
      ].join("\n")
    : "";

  return [temporal, integrationPrompt].filter(Boolean).join("\n\n");
}

