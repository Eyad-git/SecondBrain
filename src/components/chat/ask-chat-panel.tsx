"use client";

import type { ReactNode } from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";

import {
  AskEditor,
  type AskEditorHandle,
} from "@/components/editor/ask-editor";
import { ChatConfirmModal } from "@/components/chat/chat-confirm-modal";
import { ChatRecycleBinPanel } from "@/components/chat/chat-recycle-bin-panel";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  chatKeyFromAnchor,
  useChatTrashStore,
} from "@/lib/store/use-chat-trash-store";
import { useGooglePhotosAuth } from "@/hooks/use-google-photos-auth";
import { useNodeStore, useSelectedNodeTitle } from "@/lib/store/use-node-store";
import { cn } from "@/lib/utils";
import { extractMentionedNodeIds } from "@/lib/chat/mention-extract";
import { parseChatCommand } from "@/lib/chat/parse-chat-command";
import type { NodeApiIntegration, NodeScrapedSite } from "@/types/nodes";

type Props = {
  anchorNodeId: string | null;
};

type PendingApiSetup = {
  integrationName: string;
  baseUrl: string;
  auth: NodeApiIntegration["auth"];
  notes: string;
  requiresProfileName: boolean;
  profileLabel: string;
  profileName: string | null;
  stage: "profile" | "key";
};

type ScrapePreview = {
  target: string;
  fetchedUrl: string;
  title: string | null;
  contentExcerpt: string;
};

const ASK_HISTORY_PREFIX = "sb.ask.history.";

type PendingScrapeSetup = {
  stage: "site" | "username" | "details" | "confirm";
  site: string | null;
  username: string | null;
  details: string | null;
  preview: ScrapePreview | null;
};

type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "mermaid"; value: string };

function parseScrapeContext(input: string): { site: string | null; username: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { site: null, username: null };

  const usernameMatch = trimmed.match(
    /\b(?:username|profile|handle)\s*[:=]\s*(.+?)(?=\s+\b(?:details|company|location|headline)\s*[:=]|$)/i
  );
  const username = usernameMatch?.[1]?.trim() ?? null;
  const site = trimmed
    .replace(
      /\b(?:username|profile|handle)\s*[:=]\s*.+?(?=\s+\b(?:details|company|location|headline)\s*[:=]|$)/gi,
      ""
    )
    .trim();
  return { site: site.length > 0 ? site : null, username };
}

function isExplicitUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function splitTextWithMermaid(value: string): TextSegment[] {
  const blocks: TextSegment[] = [];
  const rx = /```mermaid\s*([\s\S]*?)```/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(value)) !== null) {
    const before = value.slice(cursor, match.index).trim();
    if (before) blocks.push({ kind: "text", value: before });
    const diagram = (match[1] ?? "").trim();
    if (diagram) blocks.push({ kind: "mermaid", value: diagram });
    cursor = rx.lastIndex;
  }

  const tail = value.slice(cursor).trim();
  if (tail) blocks.push({ kind: "text", value: tail });
  return blocks.length > 0 ? blocks : [{ kind: "text", value }];
}

function collectUserTexts(messages: UIMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const p of m.parts ?? []) {
      if (p.type === "text" && typeof (p as { text?: unknown }).text === "string") {
        parts.push((p as { text: string }).text);
      }
    }
  }
  return parts.join("\n");
}

function makeLocalAssistantMessage(text: string): UIMessage {
  return {
    id: `local-${crypto.randomUUID()}`,
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

function Bubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  const body: ReactNode[] = [];
  message.parts.forEach((part, i) => {
    if (part.type === "text") {
      const segments = splitTextWithMermaid(part.text);
      body.push(
        <div key={`${message.id}-t-${i}`} className="mb-2 space-y-2 last:mb-0">
          {segments.map((segment, segmentIndex) =>
            segment.kind === "text" ? (
              <p
                key={`${message.id}-t-${i}-${segmentIndex}`}
                className="whitespace-pre-wrap"
              >
                {segment.value}
              </p>
            ) : (
              <div
                key={`${message.id}-m-${i}-${segmentIndex}`}
                className="overflow-x-auto rounded-lg border border-border/70 bg-background/60 p-2"
              >
                <MermaidDiagram chart={segment.value} />
              </div>
            )
          )}
        </div>
      );
      return;
    }
    if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      body.push(
        <p
          key={`${message.id}-tool-${i}`}
          className="text-[0.8rem] text-muted-foreground"
        >
          Ran tool ({part.type.replace(/^tool-/, "")})…
        </p>
      );
    }
  });

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-[0.95rem] leading-relaxed",
        isUser
          ? "ml-8 border-primary/35 bg-primary/12 text-foreground"
          : "mr-8 border-border bg-muted/40 text-muted-foreground"
      )}
    >
      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {isUser ? "You" : "Assistant"}
      </p>
      {body.length ? body : (
        <p className="text-muted-foreground text-xs italic">No text.</p>
      )}
    </div>
  );
}

export function AskChatPanel({ anchorNodeId }: Props) {
  const editorRef = useRef<AskEditorHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nodeTitle = useSelectedNodeTitle();
  const setNodeIntegrations = useNodeStore((s) => s.setNodeIntegrations);
  const setNodeScrapedSites = useNodeStore((s) => s.setNodeScrapedSites);
  const googlePhotosAuth = useGooglePhotosAuth();
  const googlePhotosAccessToken = googlePhotosAuth.accessToken;

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [confirmMoveToBinOpen, setConfirmMoveToBinOpen] = useState(false);
  const [pendingApiSetup, setPendingApiSetup] = useState<PendingApiSetup | null>(
    null
  );
  const [pendingScrapeSetup, setPendingScrapeSetup] =
    useState<PendingScrapeSetup | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const historyStorageKey = anchorNodeId
    ? `${ASK_HISTORY_PREFIX}${anchorNodeId}`
    : null;

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const archiveConversation = useChatTrashStore((s) => s.archiveConversation);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => {
          const digest = collectUserTexts(messages as UIMessage[]);
          const fromCopy = extractMentionedNodeIds(digest);
          const mentionNodeIds = [
            ...new Set([
              ...(anchorNodeId ? [anchorNodeId] : []),
              ...fromCopy,
            ]),
          ];

          const base =
            body && typeof body === "object" && !Array.isArray(body)
              ? { ...(body as Record<string, unknown>) }
              : {};

          return {
            body: {
              ...base,
              messages,
              mentionNodeIds,
              googlePhotosAccessToken: googlePhotosAccessToken ?? null,
            },
          };
        },
      }),
    [anchorNodeId, googlePhotosAccessToken]
  );

  const {
    messages,
    sendMessage,
    stop,
    status,
    error,
    setMessages,
    clearError,
  } = useChat({
    id: anchorNodeId ? `ask-${anchorNodeId}` : "ask-none",
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  useEffect(() => {
    if (!historyStorageKey) return;
    try {
      const raw = window.localStorage.getItem(historyStorageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setMessages(parsed as UIMessage[]);
      clearError?.();
    } catch {
      /* ignore */
    }
  }, [clearError, historyStorageKey, setMessages]);

  useEffect(() => {
    if (!historyStorageKey) return;
    try {
      window.localStorage.setItem(historyStorageKey, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [historyStorageKey, messages]);

  const appendAssistantMessage = useCallback(
    (text: string) => {
      setMessages((prev) => [...prev, makeLocalAssistantMessage(text)]);
    },
    [setMessages]
  );

  const appendUserMessage = useCallback(
    (text: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-user-${crypto.randomUUID()}`,
          role: "user",
          parts: [{ type: "text", text }],
        },
      ]);
    },
    [setMessages]
  );

  const refreshNodeIntegrations = useCallback(
    async (nodeId: string) => {
      const res = await fetch(
        `/api/node-integrations?nodeId=${encodeURIComponent(nodeId)}`
      );
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const list =
        json &&
        typeof json === "object" &&
        "integrations" in json &&
        Array.isArray((json as { integrations?: unknown }).integrations)
          ? ((json as { integrations: NodeApiIntegration[] }).integrations ?? [])
          : [];
      setNodeIntegrations(nodeId, list);
    },
    [setNodeIntegrations]
  );

  const refreshScrapedSites = useCallback(
    async (nodeId: string) => {
      const res = await fetch(
        `/api/node-scraped-sites?nodeId=${encodeURIComponent(nodeId)}`
      );
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list =
        json &&
        typeof json === "object" &&
        "scrapedSites" in json &&
        Array.isArray((json as { scrapedSites?: unknown }).scrapedSites)
          ? ((json as { scrapedSites: NodeScrapedSite[] }).scrapedSites ?? [])
          : [];
      setNodeScrapedSites(nodeId, list);
    },
    [setNodeScrapedSites]
  );

  const buildScrapeTarget = useCallback(
    (site: string, username: string | null, details: string | null) => {
    const safeSite = site.trim();
    if (!safeSite) return "";
    const parts = [safeSite];
    if (username && username.trim().length > 0) {
      parts.push(`username: ${username.trim()}`);
    }
    if (details && details.trim().length > 0) {
      parts.push(`details: ${details.trim()}`);
    }
    return parts.join(" ");
  }, []);

  const requestScrapePreview = useCallback(
    async (
      nodeId: string,
      site: string,
      username: string | null,
      details: string | null
    ) => {
      const res = await fetch("/api/node-scraped-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          target: buildScrapeTarget(site, username, details),
          validateOnly: true,
        }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const preview =
        json &&
        typeof json === "object" &&
        "preview" in json &&
        (json as { preview?: unknown }).preview &&
        typeof (json as { preview?: unknown }).preview === "object"
          ? ((json as {
              preview: {
                target?: unknown;
                fetchedUrl?: unknown;
                title?: unknown;
                contentExcerpt?: unknown;
              };
            }).preview as {
              target?: unknown;
              fetchedUrl?: unknown;
              title?: unknown;
              contentExcerpt?: unknown;
            })
          : null;
      if (!preview || typeof preview.fetchedUrl !== "string") {
        throw new Error("Could not generate a scrape preview.");
      }
      return {
        target:
          typeof preview.target === "string"
            ? preview.target
            : buildScrapeTarget(site, username, details),
        fetchedUrl: preview.fetchedUrl,
        title: typeof preview.title === "string" ? preview.title : null,
        contentExcerpt:
          typeof preview.contentExcerpt === "string" ? preview.contentExcerpt : "",
      } satisfies ScrapePreview;
    },
    [buildScrapeTarget]
  );

  const previewAndAskScrapeConfirmation = useCallback(
    async (site: string, username: string | null, details: string | null) => {
      if (!anchorNodeId) return;
      try {
        setCommandBusy(true);
        const preview = await requestScrapePreview(
          anchorNodeId,
          site,
          username,
          details
        );
        setPendingScrapeSetup({
          stage: "confirm",
          site,
          username,
          details,
          preview,
        });
        appendAssistantMessage(
          [
            `Preview ready.`,
            `Resolved URL: ${preview.fetchedUrl}`,
            preview.title ? `Title: ${preview.title}` : null,
            preview.contentExcerpt
              ? `Excerpt:\n${preview.contentExcerpt.slice(0, 500)}${preview.contentExcerpt.length > 500 ? "…" : ""}`
              : null,
            `Store this in context? Reply "yes" to save, or "no" to cancel.`,
          ]
            .filter(Boolean)
            .join("\n\n")
        );
      } catch (previewErr) {
        const msg =
          previewErr instanceof Error ? previewErr.message : "Unknown preview error.";
        const loginWall = /login wall|behind a login wall/i.test(msg);
        appendAssistantMessage(
          loginWall
            ? `I could not scrape this LinkedIn profile because it is behind login. Provide a public /in/<slug> URL, or paste the profile details you want stored.`
            : `I could not validate that scrape target: ${msg}\nPlease provide a different username, URL, or site.`
        );
      } finally {
        setCommandBusy(false);
      }
    },
    [anchorNodeId, appendAssistantMessage, requestScrapePreview]
  );

  const handleSubmit = useCallback(async () => {
    if (!anchorNodeId || busy || commandBusy) return;
    const text = editorRef.current?.serializeWireText().trim() ?? "";
    if (!text) return;

    if (pendingApiSetup) {
      appendUserMessage(text);
      if (/^(cancel|stop|abort)$/i.test(text.trim())) {
        setPendingApiSetup(null);
        appendAssistantMessage("API setup canceled.");
        editorRef.current?.clear();
        return;
      }
      if (pendingApiSetup.stage === "profile") {
        setPendingApiSetup({
          ...pendingApiSetup,
          profileName: text,
          stage: "key",
        });
        appendAssistantMessage(
          `Saved ${pendingApiSetup.profileLabel}: "${text}". Now send the API key for "${pendingApiSetup.integrationName}".`
        );
        editorRef.current?.clear();
        return;
      }
      try {
        setCommandBusy(true);
        const res = await fetch("/api/node-integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: anchorNodeId,
            name: pendingApiSetup.integrationName,
            baseUrl: pendingApiSetup.baseUrl,
            auth: pendingApiSetup.auth,
            notes: pendingApiSetup.profileName
              ? `${pendingApiSetup.notes}\nProfile: ${pendingApiSetup.profileName}`
              : pendingApiSetup.notes,
            credential: text,
          }),
        });
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            json &&
            typeof json === "object" &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : `HTTP ${res.status}`;
          appendAssistantMessage(
            `Could not save API key for "${pendingApiSetup.integrationName}": ${msg}`
          );
          return;
        }
        await refreshNodeIntegrations(anchorNodeId);
        appendAssistantMessage(
          `Saved API key for "${pendingApiSetup.integrationName}". It is now available in Node APIs for this context.`
        );
        setPendingApiSetup(null);
      } catch {
        appendAssistantMessage(
          `Could not save API key for "${pendingApiSetup.integrationName}" due to a network error.`
        );
      } finally {
        setCommandBusy(false);
        editorRef.current?.clear();
      }
      return;
    }

    if (pendingScrapeSetup) {
      appendUserMessage(text);
      if (/^(cancel|stop|abort)$/i.test(text.trim())) {
        setPendingScrapeSetup(null);
        appendAssistantMessage("Scrape flow canceled.");
        editorRef.current?.clear();
        return;
      }
      if (pendingScrapeSetup.stage === "site") {
        if (isExplicitUrl(text)) {
          await previewAndAskScrapeConfirmation(text.trim(), null, null);
          editorRef.current?.clear();
          return;
        }
        setPendingScrapeSetup({
          stage: "username",
          site: text,
          username: null,
          details: null,
          preview: null,
        });
        appendAssistantMessage(
          `Great. What profile username/handle should I scrape for "${text}"? Reply with the username, or type "skip" to scrape general site context only.`
        );
        editorRef.current?.clear();
        return;
      }

      if (pendingScrapeSetup.stage === "username") {
        const skip = /^(skip|none|n\/a)$/i.test(text.trim());
        const username = skip ? null : text.trim();
        if (!pendingScrapeSetup.site) {
          setPendingScrapeSetup({
            stage: "site",
            site: null,
            username: null,
            details: null,
            preview: null,
          });
          appendAssistantMessage("I lost the site context. Tell me which site/tool to scrape.");
          editorRef.current?.clear();
          return;
        }
        const needsLinkedInDetails =
          /linkedin/i.test(pendingScrapeSetup.site) &&
          Boolean(username) &&
          /\s/.test(username ?? "");
        if (needsLinkedInDetails) {
          setPendingScrapeSetup({
            stage: "details",
            site: pendingScrapeSetup.site,
            username,
            details: null,
            preview: null,
          });
          appendAssistantMessage(
            "For LinkedIn, that looks ambiguous. Please provide one more identifier: exact profile URL, /in/<slug>, or company/location/headline."
          );
          editorRef.current?.clear();
          return;
        }
        await previewAndAskScrapeConfirmation(
          pendingScrapeSetup.site,
          username,
          pendingScrapeSetup.details
        );
        editorRef.current?.clear();
        return;
      }

      if (pendingScrapeSetup.stage === "details") {
        if (!pendingScrapeSetup.site) {
          setPendingScrapeSetup({
            stage: "site",
            site: null,
            username: null,
            details: null,
            preview: null,
          });
          appendAssistantMessage("I lost the site context. Tell me which site/tool to scrape.");
          editorRef.current?.clear();
          return;
        }
        const details = text.trim();
        await previewAndAskScrapeConfirmation(
          pendingScrapeSetup.site,
          pendingScrapeSetup.username,
          details
        );
        editorRef.current?.clear();
        return;
      }

      if (pendingScrapeSetup.stage === "confirm") {
        const answer = text.trim().toLowerCase();
        if (answer === "yes" || answer === "y") {
          if (!pendingScrapeSetup.site) {
            setPendingScrapeSetup({
              stage: "site",
              site: null,
              username: null,
              details: null,
              preview: null,
            });
            appendAssistantMessage("I lost the scrape details. Start again with /scrape.");
            editorRef.current?.clear();
            return;
          }
          try {
            setCommandBusy(true);
            const res = await fetch("/api/node-scraped-sites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nodeId: anchorNodeId,
                target: buildScrapeTarget(
                  pendingScrapeSetup.site,
                  pendingScrapeSetup.username,
                  pendingScrapeSetup.details
                ),
              }),
            });
            const json: unknown = await res.json().catch(() => ({}));
            if (!res.ok) {
              const msg =
                json &&
                typeof json === "object" &&
                "error" in json &&
                typeof (json as { error: unknown }).error === "string"
                  ? (json as { error: string }).error
                  : `HTTP ${res.status}`;
              appendAssistantMessage(`Scrape failed: ${msg}`);
              editorRef.current?.clear();
              return;
            }
            const scraped =
              json &&
              typeof json === "object" &&
              "scrapedSite" in json &&
              (json as { scrapedSite?: unknown }).scrapedSite &&
              typeof (json as { scrapedSite?: unknown }).scrapedSite === "object"
                ? ((json as { scrapedSite: NodeScrapedSite }).scrapedSite as NodeScrapedSite)
                : null;
            const warning =
              json &&
              typeof json === "object" &&
              "warning" in json &&
              typeof (json as { warning?: unknown }).warning === "string"
                ? (json as { warning: string }).warning
                : null;
            if (scraped) {
              await refreshScrapedSites(anchorNodeId);
              appendAssistantMessage(
                [
                  `Saved scrape from ${scraped.fetchedUrl || scraped.url}.`,
                  scraped.title ? `Title: ${scraped.title}` : null,
                  scraped.contentExcerpt
                    ? `Excerpt:\n${scraped.contentExcerpt.slice(0, 800)}${scraped.contentExcerpt.length > 800 ? "…" : ""}`
                    : null,
                  warning ? `Note: ${warning}` : null,
                ]
                  .filter(Boolean)
                  .join("\n\n")
              );
            }
            setPendingScrapeSetup(null);
          } catch {
            appendAssistantMessage("Scrape failed due to a network error.");
          } finally {
            setCommandBusy(false);
            editorRef.current?.clear();
          }
          return;
        }
        if (answer === "no" || answer === "n" || answer === "cancel") {
          setPendingScrapeSetup(null);
          appendAssistantMessage("Scrape canceled. Start again with /scrape when ready.");
          editorRef.current?.clear();
          return;
        }
        appendAssistantMessage(`Please reply "yes" to store or "no" to cancel.`);
        editorRef.current?.clear();
        return;
      }
    }

    const command = parseChatCommand(text);
    if (command.type === "api-start") {
      appendUserMessage(text);
      try {
        setCommandBusy(true);
        const lookupRes = await fetch("/api/integrations/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: command.integrationName }),
        });
        const lookupJson: unknown = await lookupRes.json().catch(() => ({}));
        if (!lookupRes.ok) {
          const msg =
            lookupJson &&
            typeof lookupJson === "object" &&
            "error" in lookupJson &&
            typeof (lookupJson as { error: unknown }).error === "string"
              ? (lookupJson as { error: string }).error
              : `HTTP ${lookupRes.status}`;
          appendAssistantMessage(`Could not auto-configure "${command.integrationName}": ${msg}`);
          editorRef.current?.clear();
          return;
        }

        const lookedUp =
          lookupJson &&
          typeof lookupJson === "object" &&
          "integration" in lookupJson &&
          (lookupJson as { integration?: unknown }).integration &&
          typeof (lookupJson as { integration?: unknown }).integration === "object"
            ? ((lookupJson as {
                integration: {
                  name?: unknown;
                  baseUrl?: unknown;
                  auth?: unknown;
                  notes?: unknown;
                  requiresProfileName?: unknown;
                  profileLabel?: unknown;
                };
              }).integration as {
                name?: unknown;
                baseUrl?: unknown;
                auth?: unknown;
                notes?: unknown;
                requiresProfileName?: unknown;
                profileLabel?: unknown;
              })
            : null;

        if (!lookedUp || typeof lookedUp.name !== "string") {
          appendAssistantMessage(
            `Could not auto-configure "${command.integrationName}". Try a more specific tool name.`
          );
          editorRef.current?.clear();
          return;
        }

        let name = lookedUp.name;
        let baseUrl = typeof lookedUp.baseUrl === "string" ? lookedUp.baseUrl : "";
        let auth: NodeApiIntegration["auth"] =
          lookedUp.auth === "api_key" ||
          lookedUp.auth === "oauth" ||
          lookedUp.auth === "unknown"
            ? lookedUp.auth
            : "unknown";
        let notes =
          typeof lookedUp.notes === "string" && lookedUp.notes.trim().length > 0
            ? lookedUp.notes.trim()
            : "Added from Ask chat auto setup.";

        if (baseUrl) {
          const scrapeRes = await fetch("/api/integrations/autofill-from-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: baseUrl }),
          });
          const scrapeJson: unknown = await scrapeRes.json().catch(() => ({}));
          if (scrapeRes.ok) {
            const scraped =
              scrapeJson &&
              typeof scrapeJson === "object" &&
              "integration" in scrapeJson &&
              (scrapeJson as { integration?: unknown }).integration &&
              typeof (scrapeJson as { integration?: unknown }).integration === "object"
                ? ((scrapeJson as {
                    integration: {
                      name?: unknown;
                      baseUrl?: unknown;
                      auth?: unknown;
                      notes?: unknown;
                    };
                  }).integration as {
                    name?: unknown;
                    baseUrl?: unknown;
                    auth?: unknown;
                    notes?: unknown;
                  })
                : null;
            if (scraped) {
              if (typeof scraped.name === "string" && scraped.name.trim().length > 0) {
                name = scraped.name;
              }
              if (
                typeof scraped.baseUrl === "string" &&
                scraped.baseUrl.trim().length > 0
              ) {
                baseUrl = scraped.baseUrl;
              }
              if (
                scraped.auth === "api_key" ||
                scraped.auth === "oauth" ||
                scraped.auth === "unknown"
              ) {
                auth = scraped.auth;
              }
              if (typeof scraped.notes === "string" && scraped.notes.trim().length > 0) {
                notes = scraped.notes.trim();
              }
            }
          }
        }

        const requiresProfileName = Boolean(lookedUp.requiresProfileName);
        const profileLabel =
          typeof lookedUp.profileLabel === "string" && lookedUp.profileLabel.trim().length > 0
            ? lookedUp.profileLabel.trim()
            : "profile name";

        setPendingApiSetup({
          integrationName: name,
          baseUrl,
          auth,
          notes,
          requiresProfileName,
          profileLabel,
          profileName: null,
          stage: requiresProfileName ? "profile" : "key",
        });
        appendAssistantMessage(
          [
            `Auto-configured "${name}" from tool name and docs scraping.`,
            baseUrl ? `Base URL: ${baseUrl}` : null,
            `Auth: ${auth}`,
            requiresProfileName
              ? `Send your ${profileLabel} as your next message.`
              : `Send the API key as your next message.`,
          ]
            .filter(Boolean)
            .join("\n")
        );
      } catch {
        appendAssistantMessage(
          `Could not auto-configure "${command.integrationName}" due to a network error.`
        );
      } finally {
        setCommandBusy(false);
      }
      editorRef.current?.clear();
      return;
    }

    if (command.type === "scrape-start") {
      appendUserMessage(text);
      const parsed = parseScrapeContext(command.query ?? "");
      if (!parsed.site) {
        setPendingScrapeSetup({
          stage: "site",
          site: null,
          username: parsed.username,
          details: null,
          preview: null,
        });
        appendAssistantMessage(
          "What site/tool should I scrape? Example: hevy, strava, github."
        );
      } else {
        if (isExplicitUrl(parsed.site)) {
          setPendingScrapeSetup({
            stage: "confirm",
            site: parsed.site,
            username: null,
            details: null,
            preview: null,
          });
          await previewAndAskScrapeConfirmation(parsed.site, null, null);
          editorRef.current?.clear();
          return;
        }
        setPendingScrapeSetup({
          stage: "username",
          site: parsed.site,
          username: parsed.username,
          details: null,
          preview: null,
        });
        appendAssistantMessage(
          `Got it: "${parsed.site}". What profile username/handle should I use? Reply with username, or type "skip".`
        );
      }
      editorRef.current?.clear();
      return;
    }

    await sendMessage({ text });
    editorRef.current?.clear();
  }, [
    anchorNodeId,
    appendAssistantMessage,
    appendUserMessage,
    busy,
    commandBusy,
    pendingApiSetup,
    pendingScrapeSetup,
    previewAndAskScrapeConfirmation,
    buildScrapeTarget,
    googlePhotosAccessToken,
    refreshNodeIntegrations,
    refreshScrapedSites,
    sendMessage,
  ]);

  const canOpenDeleteModal =
    Boolean(anchorNodeId) &&
    messages.length > 0 &&
    !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* Actions first so they are never clipped under the fold (pane uses overflow-hidden). */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <ChatRecycleBinPanel
            ownerId={sessionUserId ?? ""}
            sessionReady={sessionUserId !== null}
            anchorNodeId={anchorNodeId}
            currentMessagesCount={messages.length}
            onRestoreMessages={(restored) => {
              setMessages(restored);
              clearError?.();
            }}
          />
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!canOpenDeleteModal}
            onClick={() => setConfirmMoveToBinOpen(true)}
          >
            Delete chat…
          </Button>
          {busy ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => stop()}
            >
              Stop
            </Button>
          ) : commandBusy ? (
            <Button type="button" size="sm" variant="outline" disabled>
              Processing…
            </Button>
          ) : null}
          {pendingApiSetup || pendingScrapeSetup ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPendingApiSetup(null);
                setPendingScrapeSetup(null);
                setCommandBusy(false);
                appendAssistantMessage("Pending action canceled.");
              }}
            >
              Cancel pending
            </Button>
          ) : null}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Streams from <code className="text-foreground">/api/chat</code> with your
          Supabase graph block. Recycle bin saves in this browser until you erase
          archived rows.
        </p>
        {pendingApiSetup ? (
          <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-400">
            {pendingApiSetup.stage === "profile" ? (
              <>
                Waiting for <strong>{pendingApiSetup.profileLabel}</strong> for{" "}
                <strong>{pendingApiSetup.integrationName}</strong>.
              </>
            ) : (
              <>
                Waiting for API key for <strong>{pendingApiSetup.integrationName}</strong>. Your next
                message will be saved as a credential.
              </>
            )}
          </p>
        ) : null}
        {pendingScrapeSetup ? (
          <p className="text-[10px] leading-snug text-sky-700 dark:text-sky-400">
            {pendingScrapeSetup.stage === "site" ? (
              <>Waiting for scrape target site/tool.</>
            ) : pendingScrapeSetup.stage === "username" ? (
              <>Waiting for scrape username/handle (or skip).</>
            ) : pendingScrapeSetup.stage === "details" ? (
              <>Waiting for extra disambiguation details.</>
            ) : (
              <>Waiting for scrape confirmation (yes/no).</>
            )}
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-muted/10">
        <div className="min-h-[10rem] flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {!anchorNodeId
                ? "Select a graph node — the assistant anchors context to it alongside @mentions."
                : busy
                  ? "Streaming…"
                  : "Compose below and Send. Type @ to reference other rows you own."}
            </p>
          ) : (
            <div className="flex flex-col gap-3 pb-2">
              {messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
            </div>
          )}
          <div ref={bottomRef} aria-hidden />
        </div>
        <div className="border-t border-border/70 bg-background/40">
          <AskEditor
            ref={editorRef}
            disabled={!anchorNodeId || busy || commandBusy}
            onSubmit={handleSubmit}
            submitDisabled={busy || commandBusy}
            embedded
          />
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm">{error.message}</p>
      ) : null}

      <ChatConfirmModal
        open={confirmMoveToBinOpen}
        onClose={() => setConfirmMoveToBinOpen(false)}
        title="Move this conversation to the recycle bin?"
        description="It will disappear from this pane. You can restore it from Recycle bin while you are on the same node, or erase it forever from there."
        confirmLabel="Move to recycle bin"
        destructive
        confirmDisabled={!canOpenDeleteModal}
        onConfirm={async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;

          archiveConversation({
            chatKey: chatKeyFromAnchor(anchorNodeId),
            anchorNodeId,
            nodeTitleAtDelete: nodeTitle,
            ownerId: user.id,
            messages,
          });
          setMessages([]);
          if (historyStorageKey) {
            try {
              window.localStorage.removeItem(historyStorageKey);
            } catch {
              /* ignore */
            }
          }
          clearError?.();
        }}
      />

    </div>
  );
}
