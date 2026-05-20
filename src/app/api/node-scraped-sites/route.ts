import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchPublicPageText } from "@/lib/http/fetch-public-page-text";
import {
  discoverIntegrations,
  lookupIntegrationByName,
  type IntegrationCandidate,
} from "@/lib/integrations/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SCRAPED_SETUP_MESSAGE =
  "Node scraped sites are not initialized yet. Run db/node_scraped_sites.sql in your Supabase SQL editor.";

const createSchema = z.object({
  nodeId: z.string().uuid(),
  target: z.string().min(1).max(2000).optional(),
  url: z.string().min(1).max(2000).optional(),
  validateOnly: z.boolean().optional(),
});

function getMissingTableMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("node_scraped_sites") &&
    (normalized.includes("could not find the table") ||
      normalized.includes("relation") ||
      normalized.includes("does not exist"))
  ) {
    return SCRAPED_SETUP_MESSAGE;
  }
  return null;
}

function slugifySiteName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(".")[0]
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractUsername(context: string): string | null {
  const explicit = context.match(
    /\b(?:username|profile|handle)\s*[:=]\s*(.+?)(?=\s+\b(?:details|company|location|headline)\s*[:=]|$)/i
  );
  if (explicit?.[1]) return explicit[1].trim();

  const atMention = context.match(/(?:^|\s)@([a-zA-Z0-9._-]{2,})/);
  if (atMention?.[1]) return atMention[1];
  return null;
}

function extractDetails(context: string): string | null {
  const explicit = context.match(/\b(?:details|company|location|headline)\s*[:=]\s*([^\n]+)$/i);
  if (explicit?.[1]) return explicit[1].trim();
  return null;
}

function extractProfileUrl(context: string): string | null {
  const direct = context.match(/https?:\/\/[^\s]+/i);
  if (!direct?.[0]) return null;
  return direct[0].replace(/[),.;!?]+$/g, "");
}

function parseDomainFromText(input: string): string | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0] ?? "";
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cleaned) ? cleaned : null;
}

function resolveIntegrationFromContext(context: string): IntegrationCandidate | null {
  const byName = lookupIntegrationByName(context);
  if (byName) return byName;
  const discovered = discoverIntegrations(context, 1);
  return discovered[0] ?? null;
}

function buildProfileCandidates(origin: string, username: string): string[] {
  const safeUser = username.trim();
  if (!safeUser) return [];
  return [
    `${origin}/${safeUser}`,
    `${origin}/@${safeUser}`,
    `${origin}/user/${safeUser}`,
    `${origin}/users/${safeUser}`,
    `${origin}/profile/${safeUser}`,
    `${origin}/profiles/${safeUser}`,
  ];
}

function candidatesForIntegration(
  integration: IntegrationCandidate,
  username: string | null,
  details: string | null
): string[] {
  const origin = integration.website.replace(/\/+$/, "");
  if (!username) return [origin];

  if (integration.id === "github") {
    return [`https://github.com/${username}`];
  }
  if (integration.id === "strava") {
    return [
      `https://www.strava.com/athletes/${username}`,
      `https://www.strava.com/profiles/${username}`,
      ...buildProfileCandidates(origin, username),
    ];
  }
  if (integration.id === "hevy") {
    return [
      `https://www.hevyapp.com/user/${username}`,
      `https://www.hevyapp.com/@${username}`,
      ...buildProfileCandidates(origin, username),
    ];
  }
  if (integration.id === "linkedin") {
    if (/^https?:\/\//i.test(username)) return [username];
    const clean = username
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?linkedin\.com\//i, "")
      .replace(/^www\.linkedin\.com\//i, "")
      .replace(/^linkedin\.com\//i, "")
      .replace(/^in\//i, "")
      .replace(/^company\//i, "")
      .replace(/\/+$/g, "");
    const looksLikeSlug = !clean.includes(" ");
    if (looksLikeSlug) {
      const looksCompany = /^company\//i.test(username.trim());
      if (looksCompany) {
        return [`https://www.linkedin.com/company/${clean.replace(/^company\//i, "")}`];
      }
      return [`https://www.linkedin.com/in/${clean}`];
    }
    if (details && !details.includes(" ")) {
      const slug = details
        .trim()
        .replace(/^@/, "")
        .replace(/^https?:\/\/(www\.)?linkedin\.com\//i, "")
        .replace(/^linkedin\.com\//i, "")
        .replace(/^in\//i, "")
        .replace(/^company\//i, "")
        .replace(/\/+$/g, "");
      return [`https://www.linkedin.com/in/${slug}`];
    }
    throw new Error(
      "LinkedIn needs a unique profile URL or public handle. Please provide /in/<slug> or full profile URL."
    );
  }
  return [origin, ...buildProfileCandidates(origin, username)];
}

function resolveScrapeCandidates(rawTarget: string): {
  target: string;
  candidates: string[];
  integration: IntegrationCandidate | null;
  username: string | null;
  explicitUrl: string | null;
} {
  const trimmed = rawTarget.trim();
  if (!trimmed) throw new Error("Scrape target is required.");

  if (/^https?:\/\//i.test(trimmed)) {
    return {
      target: trimmed,
      candidates: [trimmed],
      integration: null,
      username: extractUsername(trimmed),
      explicitUrl: trimmed,
    };
  }

  const username = extractUsername(trimmed);
  const details = extractDetails(trimmed);
  const profileUrl = extractProfileUrl(trimmed);
  if (profileUrl) {
    return {
      target: trimmed,
      candidates: [profileUrl],
      integration: null,
      username: username ?? details,
      explicitUrl: profileUrl,
    };
  }
  const integration = resolveIntegrationFromContext(trimmed);
  if (integration?.requiresProfileName && !username) {
    throw new Error(
      `This source needs a ${integration.profileLabel ?? "profile name"}. Example: /scrape ${integration.name} username: your_name`
    );
  }
  if (integration?.website) {
    return {
      target: trimmed,
      candidates: candidatesForIntegration(integration, username, details),
      integration,
      username,
      explicitUrl: null,
    };
  }

  const domain = parseDomainFromText(trimmed);
  if (domain) {
    const origin = `https://${domain}`;
    return {
      target: trimmed,
      candidates: username ? [origin, ...buildProfileCandidates(origin, username)] : [origin],
      integration: null,
      username,
      explicitUrl: null,
    };
  }

  const slug = slugifySiteName(trimmed);
  if (!slug) throw new Error("Could not infer a site from that context.");
  const inferredOrigin = `https://www.${slug}.com`;
  return {
    target: trimmed,
    candidates: username
      ? [inferredOrigin, ...buildProfileCandidates(inferredOrigin, username)]
      : [inferredOrigin],
    integration: null,
    username,
    explicitUrl: null,
  };
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function compactLines(lines: string[], maxLines: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const clean = normalizeLine(line);
    if (!clean) continue;
    const dedupeKey = clean.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(clean);
    if (out.length >= maxLines) break;
  }
  return out;
}

function cleanGenericExcerpt(raw: string): string {
  const dropPatterns = [
    /cookie/i,
    /sign in/i,
    /log in/i,
    /javascript/i,
    /enable (?:your )?browser/i,
    /terms of (?:service|use)/i,
    /privacy policy/i,
    /all rights reserved/i,
    /skip to main/i,
  ];
  const lines = raw
    .split(/\r?\n+/)
    .map(normalizeLine)
    .filter((line) => line.length > 0)
    .filter((line) => !dropPatterns.some((pattern) => pattern.test(line)));
  return compactLines(lines, 36).join("\n");
}

function cleanLinkedInExcerpt(raw: string, username: string | null): string {
  const lowerUserTokens =
    username
      ?.toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 3) ?? [];

  const profileSignal = [
    /headline/i,
    /about/i,
    /experience/i,
    /education/i,
    /skills?/i,
    /location/i,
    /current/i,
    /worked at/i,
    /open to work/i,
    /contact/i,
  ];

  const hardDrop = [
    /join now/i,
    /sign in/i,
    /agree & join/i,
    /people also viewed/i,
    /followers/i,
    /connections/i,
    /advertisement/i,
    /cookie/i,
    /terms of use/i,
    /privacy policy/i,
    /linkedin corporation/i,
  ];

  const lines = raw
    .split(/\r?\n+/)
    .map(normalizeLine)
    .filter((line) => line.length > 0)
    .filter((line) => !hardDrop.some((pattern) => pattern.test(line)));

  const relevant = lines.filter((line) => {
    const lc = line.toLowerCase();
    const hasUserToken =
      lowerUserTokens.length > 0 &&
      lowerUserTokens.some((token) => lc.includes(token));
    const hasSignal = profileSignal.some((pattern) => pattern.test(line));
    const looksLikeBio = line.length >= 40 && line.length <= 240;
    return hasUserToken || hasSignal || looksLikeBio;
  });

  const picked = compactLines(
    relevant.length >= 8 ? relevant : lines,
    42
  );
  return picked.join("\n");
}

function cleanScrapedExcerpt(params: {
  rawExcerpt: string;
  integration: IntegrationCandidate | null;
  username: string | null;
}): string {
  const { rawExcerpt, integration, username } = params;
  if (!rawExcerpt.trim()) return "";

  const integrationId = integration?.id ?? "";
  if (integrationId === "linkedin") {
    return cleanLinkedInExcerpt(rawExcerpt, username);
  }
  return cleanGenericExcerpt(rawExcerpt);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function scoreSentence(
  sentence: string,
  integration: IntegrationCandidate | null,
  username: string | null
): number {
  const lc = sentence.toLowerCase();
  let score = Math.min(sentence.length / 80, 3);

  const highSignal = [
    "about",
    "experience",
    "education",
    "skills",
    "location",
    "project",
    "role",
    "company",
    "repository",
    "activity",
    "profile",
    "summary",
  ];
  for (const token of highSignal) {
    if (lc.includes(token)) score += 1.6;
  }

  if (integration) {
    if (lc.includes(integration.name.toLowerCase())) score += 1.8;
    for (const keyword of integration.keywords.slice(0, 8)) {
      if (lc.includes(keyword.toLowerCase())) score += 0.6;
    }
  }

  if (username) {
    for (const part of username.toLowerCase().split(/[^a-z0-9]+/g)) {
      if (part.length < 3) continue;
      if (lc.includes(part)) score += 1.4;
    }
  }

  if (lc.includes("cookie") || lc.includes("privacy policy") || lc.includes("sign in")) {
    score -= 3;
  }

  return score;
}

function buildStructuredExcerpt(params: {
  cleaned: string;
  sourceUrl: string;
  fetchedUrl: string;
  title?: string;
  integration: IntegrationCandidate | null;
  username: string | null;
  target: string;
}): string {
  const { cleaned, sourceUrl, fetchedUrl, title, integration, username, target } = params;
  const sentences = splitSentences(cleaned);

  const ranked = sentences
    .map((s) => ({
      text: s,
      score: scoreSentence(s, integration, username),
    }))
    .sort((a, b) => b.score - a.score);

  const summary = ranked[0]?.text ?? cleaned.slice(0, 220).trim();
  const keyPoints = compactLines(
    ranked.slice(0, 8).map((row) => row.text),
    5
  );

  const targetLines = compactLines(
    sentences.filter((line) => {
      const lc = line.toLowerCase();
      const userMatch =
        username &&
        username
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .filter((part) => part.length >= 3)
          .some((part) => lc.includes(part));
      return Boolean(userMatch) || lc.includes("profile") || lc.includes("headline");
    }),
    3
  );

  const confidenceSignals: string[] = [];
  const fetchedLc = fetchedUrl.toLowerCase();
  const targetLc = target.toLowerCase();

  if (integration) {
    confidenceSignals.push(`Matched integration: ${integration.name}`);
    if (fetchedLc.includes(integration.id.toLowerCase())) {
      confidenceSignals.push("Fetched URL aligns with integration domain.");
    }
  }
  if (username) {
    const userLc = username.toLowerCase();
    if (fetchedLc.includes(userLc) || cleaned.toLowerCase().includes(userLc)) {
      confidenceSignals.push("Username appears in fetched source or content.");
    } else {
      confidenceSignals.push("Username not directly found in source text.");
    }
  }
  if (title && title.trim().length >= 6) {
    confidenceSignals.push("Source includes a non-empty page title.");
  }
  if (targetLc.includes("linkedin") && !fetchedLc.includes("/in/")) {
    confidenceSignals.push("LinkedIn URL is not a direct /in profile.");
  }
  if (cleaned.length < 220) {
    confidenceSignals.push("Limited extracted content length.");
  }

  const positive = confidenceSignals.filter(
    (line) =>
      /matched integration|aligns|appears|non-empty page title/i.test(line)
  ).length;
  const negative = confidenceSignals.filter(
    (line) => /not directly found|not a direct|limited extracted/i.test(line)
  ).length;
  const confidence: "High" | "Medium" | "Low" =
    positive >= 3 && negative === 0
      ? "High"
      : positive >= 2 && negative <= 1
        ? "Medium"
        : "Low";

  return [
    `Source: ${sourceUrl}`,
    fetchedUrl !== sourceUrl ? `Fetched via: ${fetchedUrl}` : null,
    title ? `Title: ${title}` : null,
    integration ? `Integration: ${integration.name}` : null,
    `Confidence: ${confidence}`,
    "",
    "Summary:",
    summary || "No concise summary extracted.",
    "",
    "Key points:",
    ...(keyPoints.length > 0 ? keyPoints.map((line) => `- ${line}`) : ["- No clear key points extracted."]),
    "",
    "Target relevance:",
    ...(targetLines.length > 0
      ? targetLines.map((line) => `- ${line}`)
      : [username ? `- Username reference: ${username}` : "- General site context only."]),
    "",
    "Confidence rationale:",
    ...compactLines(confidenceSignals, 5).map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchFirstWorkingCandidate(candidates: string[]) {
  let lastWarning = "Unknown fetch error.";
  for (const candidate of candidates) {
    const expanded = [
      candidate,
      candidate.startsWith("https://r.jina.ai/")
        ? null
        : `https://r.jina.ai/http://${candidate.replace(/^https?:\/\//i, "")}`,
    ].filter((x): x is string => Boolean(x));

    for (const probe of expanded) {
      try {
        const fetched = await fetchPublicPageText(probe);
        if (!fetched.warning || fetched.textExcerpt.length > 0) {
          return fetched;
        }
        lastWarning = fetched.warning;
      } catch (error) {
        lastWarning =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Fetch attempt failed.";
      }
    }
  }
  throw new Error(lastWarning);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) {
      return NextResponse.json({ error: "nodeId is required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("node_scraped_sites")
      .select(
        "id,node_id,url,fetched_url,title,content_excerpt,content_type,bytes_read,created_at"
      )
      .eq("user_id", user.id)
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      const setupMessage = getMissingTableMessage(error.message);
      if (setupMessage) {
        return NextResponse.json({
          scrapedSites: [],
          setupRequired: true,
          setupMessage,
        });
      }
      return NextResponse.json(
        { error: `Could not load scraped sites: ${error.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      scrapedSites: (data ?? []).map((row) => ({
        id: String(row.id),
        nodeId: String(row.node_id),
        url: typeof row.url === "string" ? row.url : "",
        fetchedUrl: typeof row.fetched_url === "string" ? row.fetched_url : "",
        title: typeof row.title === "string" ? row.title : null,
        contentExcerpt:
          typeof row.content_excerpt === "string" ? row.content_excerpt : "",
        contentType: typeof row.content_type === "string" ? row.content_type : null,
        bytesRead:
          typeof row.bytes_read === "number" && Number.isFinite(row.bytes_read)
            ? row.bytes_read
            : 0,
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
      })),
    });
  } catch (error) {
    console.error("[api/node-scraped-sites:get]", error);
    return NextResponse.json(
      { error: "Failed to load scraped sites." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const target = body.target?.trim() || body.url?.trim() || "";
    const resolved = resolveScrapeCandidates(target);
    const validateOnly = body.validateOnly === true;
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: node } = await supabase
      .from("nodes")
      .select("id,user_id")
      .eq("id", body.nodeId)
      .maybeSingle();
    if (!node || node.user_id !== user.id) {
      return NextResponse.json({ error: "Node not found." }, { status: 404 });
    }

    const fetched = await fetchFirstWorkingCandidate(
      resolved.candidates.slice(0, 8)
    );
    const linkedinWeakSignals = [
      /profile not found/i,
      /page not found/i,
      /join now/i,
      /sign in/i,
      /member-only/i,
      /this profile is unavailable/i,
      /log in/i,
    ];
    const linkedinStrongSignals = [
      /experience/i,
      /education/i,
      /skills/i,
      /about/i,
      /activity/i,
      /connections?/i,
      /followers?/i,
      /headline/i,
    ];
    const hasLinkedinWeakSignal = linkedinWeakSignals.some((rx) =>
      rx.test(fetched.textExcerpt)
    );
    const hasLinkedinStrongSignal = linkedinStrongSignals.some((rx) =>
      rx.test(fetched.textExcerpt)
    );
    const expectsLinkedInPersonProfile =
      resolved.integration?.id === "linkedin" &&
      Boolean(resolved.username) &&
      !/company\//i.test(resolved.username ?? "");
    if (expectsLinkedInPersonProfile) {
      const isPersonProfile = /linkedin\.com\/in\//i.test(fetched.fetchedUrl);
      if (!isPersonProfile) {
        throw new Error(
          "Could not verify a unique LinkedIn person profile. Please provide an exact LinkedIn /in/<slug> URL."
        );
      }
    }
    if (resolved.integration?.id === "linkedin") {
      const weakByLength = fetched.textExcerpt.length < 260;
      const fetchedViaJina = /r\.jina\.ai/i.test(fetched.fetchedUrl);
      const isLikelyLoginWall =
        /join now|sign in|log in|member-only|this profile is unavailable/i.test(
          fetched.textExcerpt
        ) && fetchedViaJina;
      const inferredBlockedByLogin =
        fetchedViaJina && weakByLength && !hasLinkedinStrongSignal;
      if (isLikelyLoginWall || inferredBlockedByLogin) {
        throw new Error(
          "LinkedIn profile content is behind a login wall. I can only scrape public profile data. Please provide a publicly accessible /in/<slug> URL or paste profile details manually."
        );
      }
      if (hasLinkedinWeakSignal || weakByLength || !hasLinkedinStrongSignal) {
        throw new Error(
          "LinkedIn scrape did not return profile-specific content. Provide exact public /in/<slug> URL or more profile details."
        );
      }
    }
    const cleanedExcerpt = cleanScrapedExcerpt({
      rawExcerpt: fetched.textExcerpt,
      integration: resolved.integration,
      username: resolved.username,
    });
    const excerptToStore = buildStructuredExcerpt({
      cleaned: cleanedExcerpt || fetched.textExcerpt,
      sourceUrl: resolved.explicitUrl ?? fetched.fetchedUrl,
      fetchedUrl: fetched.fetchedUrl,
      title: fetched.title,
      integration: resolved.integration,
      username: resolved.username,
      target: resolved.target,
    });

    if (validateOnly) {
      return NextResponse.json({
        preview: {
          target: resolved.target,
          fetchedUrl: fetched.fetchedUrl,
          title: fetched.title ?? null,
          contentExcerpt: excerptToStore,
          contentType: fetched.contentType ?? null,
          bytesRead: fetched.bytesRead,
        },
        warning: fetched.warning ?? null,
        resolved: {
          integration: resolved.integration?.name ?? null,
          username: resolved.username,
        },
      });
    }

    const { data: inserted, error } = await supabase
      .from("node_scraped_sites")
      .insert({
        user_id: user.id,
        node_id: body.nodeId,
        url: resolved.target,
        fetched_url: fetched.fetchedUrl,
        title: fetched.title ?? null,
        content_excerpt: excerptToStore,
        content_type: fetched.contentType ?? null,
        bytes_read: fetched.bytesRead,
      })
      .select(
        "id,node_id,url,fetched_url,title,content_excerpt,content_type,bytes_read,created_at"
      )
      .single();

    if (error || !inserted) {
      const setupMessage = getMissingTableMessage(error?.message ?? "");
      if (setupMessage) {
        return NextResponse.json({ error: setupMessage }, { status: 503 });
      }
      return NextResponse.json(
        { error: `Could not persist scraped site: ${error?.message ?? "unknown"}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      scrapedSite: {
        id: String(inserted.id),
        nodeId: String(inserted.node_id),
        url: typeof inserted.url === "string" ? inserted.url : resolved.target,
        fetchedUrl:
          typeof inserted.fetched_url === "string" ? inserted.fetched_url : "",
        title: typeof inserted.title === "string" ? inserted.title : null,
        contentExcerpt:
          typeof inserted.content_excerpt === "string" ? inserted.content_excerpt : "",
        contentType:
          typeof inserted.content_type === "string" ? inserted.content_type : null,
        bytesRead:
          typeof inserted.bytes_read === "number" &&
          Number.isFinite(inserted.bytes_read)
            ? inserted.bytes_read
            : 0,
        createdAt: typeof inserted.created_at === "string" ? inserted.created_at : "",
      },
      warning: fetched.warning ?? null,
      resolved: {
        integration: resolved.integration?.name ?? null,
        username: resolved.username,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Failed to save scraped site.";
    console.error("[api/node-scraped-sites:post]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
