"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";

import { AskChatPanel } from "@/components/chat/ask-chat-panel";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import { Button } from "@/components/ui/button";
import type { ActiveNodeSyncState, LinkedInfluence } from "@/hooks/use-active-node-sync";
import { cn } from "@/lib/utils";
import {
  useNodeStore,
  useSelectedNodeTitle,
} from "@/lib/store/use-node-store";
import type {
  NodeApiIntegration,
  NodeGooglePhotosItem,
  NodeScrapedSite,
  NodeStatus,
} from "@/types/nodes";

const PANE_COLLAPSE_PREFIX = "sb.dashboard.pane.";
const CONTEXT_SECTION_COLLAPSE_PREFIX = "sb.dashboard.context.section.";

function usePersistedCollapse(storageKey: string, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCollapsed(true);
      } else if (raw === "0") {
        setCollapsed(false);
      }
    } catch {
      /* ignore */
    }
  }, [defaultCollapsed, storageKey]);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  return { collapsed, toggle };
}

function usePersistedPaneCollapsed(paneId: string) {
  return usePersistedCollapse(PANE_COLLAPSE_PREFIX + paneId);
}

function usePersistedContextSectionCollapsed(
  sectionId: string,
  defaultCollapsed = false
) {
  return usePersistedCollapse(
    CONTEXT_SECTION_COLLAPSE_PREFIX + sectionId,
    defaultCollapsed
  );
}

function PaneCard({
  title,
  eyebrow,
  contentClassName,
  className,
  paneId,
  /** When true, collapsing removes flex growth (bottom-row Ask / Plan). */
  collapseShrinksHeight,
  children,
}: {
  title: string;
  eyebrow: string;
  contentClassName?: string;
  /** Stable id for collapse persistence (`context`, `questions`, `ask`, `plan`). */
  paneId: string;
  collapseShrinksHeight?: boolean;
  /** Section root (e.g. `flex-1 min-h-0` when pane should fill a flex/grid cell). */
  className?: string;
  children: ReactNode;
}) {
  const { collapsed, toggle } = usePersistedPaneCollapsed(paneId);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10",
        collapsed &&
          (collapseShrinksHeight
            ? "!max-h-none shrink-0 !flex-none"
            : "shrink-0"),
        className
      )}
    >
      <header
        className={cn(
          "flex shrink-0 items-start justify-between gap-2 px-5 py-3.5",
          collapsed ? "border-0" : "border-b border-border"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "mt-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          )}
          aria-expanded={!collapsed}
          aria-controls={`${paneId}-pane-content`}
          title={collapsed ? "Expand panel" : "Collapse panel"}
        >
          <ChevronDown
            className={cn(
              "size-5 transition-transform duration-200",
              collapsed && "-rotate-90"
            )}
            aria-hidden
          />
        </button>
      </header>
      <div
        id={`${paneId}-pane-content`}
        className={cn(
          contentClassName ??
            "min-h-0 overflow-y-auto px-5 py-4 text-[0.95rem] leading-relaxed text-muted-foreground",
          collapsed && "hidden"
        )}
      >
        {children}
      </div>
    </section>
  );
}

function InfluenceRow({ link }: { link: LinkedInfluence }) {
  return (
    <li className="rounded-lg border border-dashed border-border/80 bg-muted/40 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">{link.peerTitle}</p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {link.direction === "outbound" ? "→ Out" : "← In"} · priority{" "}
          {link.priority_weight}/10
        </span>
      </div>
      {link.relationship_context ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {link.relationship_context}
        </p>
      ) : null}
    </li>
  );
}

function ContextSection({
  sectionId,
  title,
  collapsed,
  onToggle,
  action,
  children,
}: {
  sectionId: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 rounded-sm text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-expanded={!collapsed}
          aria-controls={`context-section-${sectionId}`}
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")}
            aria-hidden
          />
          <span>{title}</span>
        </button>
        {action}
      </div>
      <div id={`context-section-${sectionId}`} className={cn(collapsed && "hidden")}>
        {children}
      </div>
    </div>
  );
}

function parseStructuredScrape(
  excerpt: string
): {
  source: string | null;
  title: string | null;
  integration: string | null;
  confidence: "High" | "Medium" | "Low" | null;
  summary: string;
  keyPoints: string[];
  targetRelevance: string[];
  confidenceRationale: string[];
} {
  const lines = excerpt.split(/\r?\n/).map((line) => line.trim());
  const source =
    lines.find((line) => line.toLowerCase().startsWith("source:"))?.slice(7).trim() ??
    null;
  const title =
    lines.find((line) => line.toLowerCase().startsWith("title:"))?.slice(6).trim() ??
    null;
  const integration =
    lines
      .find((line) => line.toLowerCase().startsWith("integration:"))
      ?.slice(12)
      .trim() ?? null;
  const confidenceRaw =
    lines
      .find((line) => line.toLowerCase().startsWith("confidence:"))
      ?.slice(11)
      .trim() ?? null;
  const confidence =
    confidenceRaw === "High" || confidenceRaw === "Medium" || confidenceRaw === "Low"
      ? confidenceRaw
      : null;

  const summaryStart = lines.findIndex(
    (line) => line.toLowerCase() === "summary:"
  );
  const keyStart = lines.findIndex(
    (line) => line.toLowerCase() === "key points:"
  );
  const targetStart = lines.findIndex(
    (line) => line.toLowerCase() === "target relevance:"
  );
  const confidenceRationaleStart = lines.findIndex(
    (line) => line.toLowerCase() === "confidence rationale:"
  );

  const summaryLines =
    summaryStart >= 0
      ? lines
          .slice(summaryStart + 1, keyStart > summaryStart ? keyStart : lines.length)
          .filter((line) => line.length > 0)
      : [];
  const keyLines =
    keyStart >= 0
      ? lines
          .slice(
            keyStart + 1,
            targetStart > keyStart
              ? targetStart
              : confidenceRationaleStart > keyStart
                ? confidenceRationaleStart
                : lines.length
          )
          .filter((line) => line.startsWith("- "))
          .map((line) => line.slice(2))
      : [];
  const targetLines =
    targetStart >= 0
      ? lines
          .slice(
            targetStart + 1,
            confidenceRationaleStart > targetStart
              ? confidenceRationaleStart
              : lines.length
          )
          .filter((line) => line.startsWith("- "))
          .map((line) => line.slice(2))
      : [];
  const confidenceRationale =
    confidenceRationaleStart >= 0
      ? lines
          .slice(confidenceRationaleStart + 1)
          .filter((line) => line.startsWith("- "))
          .map((line) => line.slice(2))
      : [];

  return {
    source,
    title,
    integration,
    confidence,
    summary: summaryLines.join(" ").trim(),
    keyPoints: keyLines,
    targetRelevance: targetLines,
    confidenceRationale,
  };
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: () => void;
          }) => { requestAccessToken: (options?: { prompt?: string }) => void };
        };
      };
    };
  }
}

function parseDurationSeconds(duration: unknown, fallbackSeconds: number): number {
  if (typeof duration !== "string") return fallbackSeconds;
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)s$/i);
  if (!match) return fallbackSeconds;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return fallbackSeconds;
  return value;
}

function ScrapedSiteCard({ site }: { site: NodeScrapedSite }) {
  const parsed = parseStructuredScrape(site.contentExcerpt);
  const heading = parsed.title?.trim() || site.title?.trim() || site.url;
  const confidenceTone =
    parsed.confidence === "High"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : parsed.confidence === "Medium"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : parsed.confidence === "Low"
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
          : "bg-muted text-muted-foreground";

  return (
    <details className="group rounded-lg border border-border/70 bg-muted/15 px-3 py-2 open:bg-muted/25">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{heading}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {parsed.source || site.fetchedUrl || site.url}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {parsed.confidence ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                confidenceTone
              )}
            >
              {parsed.confidence}
            </span>
          ) : null}
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs">
        {parsed.integration ? (
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">Integration:</span>{" "}
            {parsed.integration}
          </p>
        ) : null}
        {parsed.summary ? (
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Summary
            </p>
            <p className="mt-1 text-foreground">{parsed.summary}</p>
          </div>
        ) : null}
        {parsed.keyPoints.length > 0 ? (
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Key points
            </p>
            <ul className="mt-1 space-y-1 text-foreground">
              {parsed.keyPoints.map((point) => (
                <li key={point}>- {point}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {parsed.targetRelevance.length > 0 ? (
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Target relevance
            </p>
            <ul className="mt-1 space-y-1 text-foreground">
              {parsed.targetRelevance.map((point) => (
                <li key={point}>- {point}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {parsed.confidenceRationale.length > 0 ? (
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Confidence rationale
            </p>
            <ul className="mt-1 space-y-1 text-foreground">
              {parsed.confidenceRationale.map((point) => (
                <li key={point}>- {point}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function ContextPane({ sync }: { sync: ActiveNodeSyncState }) {
  const nodeId = useNodeStore((s) => s.selectedNodeId);
  const snapshot = useNodeStore((s) =>
    nodeId ? s.nodesById[nodeId] : undefined
  );
  const nodeTitle = useSelectedNodeTitle();
  const nodeIntegrations = useNodeStore((s) =>
    nodeId
      ? (s.integrationsByNodeId[nodeId] ?? EMPTY_NODE_INTEGRATIONS)
      : EMPTY_NODE_INTEGRATIONS
  );
  const nodeScrapedSites = useNodeStore((s) =>
    nodeId ? (s.scrapedSitesByNodeId[nodeId] ?? EMPTY_NODE_SCRAPED_SITES) : EMPTY_NODE_SCRAPED_SITES
  );
  const nodeGooglePhotos = useNodeStore((s) =>
    nodeId
      ? (s.googlePhotosByNodeId[nodeId] ?? EMPTY_NODE_GOOGLE_PHOTOS_ITEMS)
      : EMPTY_NODE_GOOGLE_PHOTOS_ITEMS
  );
  const setNodeIntegrations = useNodeStore((s) => s.setNodeIntegrations);
  const setNodeScrapedSites = useNodeStore((s) => s.setNodeScrapedSites);
  const setNodeGooglePhotos = useNodeStore((s) => s.setNodeGooglePhotos);
  const [integrationName, setIntegrationName] = useState("");
  const [integrationBaseUrl, setIntegrationBaseUrl] = useState("");
  const [integrationAuth, setIntegrationAuth] = useState<
    NodeApiIntegration["auth"]
  >("unknown");
  const [integrationNotes, setIntegrationNotes] = useState("");
  const [integrationCredential, setIntegrationCredential] = useState("");
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [integrationNotice, setIntegrationNotice] = useState<string | null>(null);
  const [scrapedSitesLoading, setScrapedSitesLoading] = useState(false);
  const [scrapedSitesError, setScrapedSitesError] = useState<string | null>(null);
  const [scrapedSitesNotice, setScrapedSitesNotice] = useState<string | null>(null);
  const [googlePhotosLoading, setGooglePhotosLoading] = useState(false);
  const [googlePhotosError, setGooglePhotosError] = useState<string | null>(null);
  const [googlePhotosNotice, setGooglePhotosNotice] = useState<string | null>(null);
  const [googlePhotosToken, setGooglePhotosToken] = useState<string | null>(null);
  const [googleOAuthConfig, setGoogleOAuthConfig] = useState<{
    clientId: string;
    scope: string;
  } | null>(null);
  const [googleIdentityReady, setGoogleIdentityReady] = useState(false);
  const [scrapedConfidenceFilter, setScrapedConfidenceFilter] = useState<
    "all" | "medium_plus" | "high"
  >("all");
  const [toolLookupName, setToolLookupName] = useState("");
  const [toolLookupLoading, setToolLookupLoading] = useState(false);
  const [docsLookupUrl, setDocsLookupUrl] = useState("");
  const [docsLookupLoading, setDocsLookupLoading] = useState(false);
  const [rotateDraftById, setRotateDraftById] = useState<Record<string, string>>(
    {}
  );
  useEffect(() => {
    if (!nodeId) return;
    const controller = new AbortController();

    void (async () => {
      setIntegrationLoading(true);
      setIntegrationError(null);
      setIntegrationNotice(null);
      try {
        const res = await fetch(
          `/api/node-integrations?nodeId=${encodeURIComponent(nodeId)}`,
          {
            signal: controller.signal,
          }
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
          setIntegrationError(msg);
          return;
        }
        const list =
          json &&
          typeof json === "object" &&
          "integrations" in json &&
          Array.isArray((json as { integrations?: unknown }).integrations)
            ? ((json as { integrations: NodeApiIntegration[] }).integrations ?? [])
            : [];
        const setupMessage =
          json &&
          typeof json === "object" &&
          "setupMessage" in json &&
          typeof (json as { setupMessage?: unknown }).setupMessage === "string"
            ? (json as { setupMessage: string }).setupMessage
            : null;
        setIntegrationNotice(setupMessage);
        setNodeIntegrations(nodeId, list);
      } catch {
        if (controller.signal.aborted) return;
        setIntegrationError("Could not load node integrations.");
      } finally {
        if (!controller.signal.aborted) setIntegrationLoading(false);
      }
    })();

    return () => controller.abort();
  }, [nodeId, setNodeIntegrations]);

  useEffect(() => {
    if (!nodeId) return;
    const controller = new AbortController();

    void (async () => {
      setScrapedSitesLoading(true);
      setScrapedSitesError(null);
      setScrapedSitesNotice(null);
      try {
        const res = await fetch(
          `/api/node-scraped-sites?nodeId=${encodeURIComponent(nodeId)}`,
          { signal: controller.signal }
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
          setScrapedSitesError(msg);
          return;
        }

        const list =
          json &&
          typeof json === "object" &&
          "scrapedSites" in json &&
          Array.isArray((json as { scrapedSites?: unknown }).scrapedSites)
            ? ((json as { scrapedSites: typeof EMPTY_NODE_SCRAPED_SITES }).scrapedSites ?? [])
            : [];
        const setupMessage =
          json &&
          typeof json === "object" &&
          "setupMessage" in json &&
          typeof (json as { setupMessage?: unknown }).setupMessage === "string"
            ? (json as { setupMessage: string }).setupMessage
            : null;

        setScrapedSitesNotice(setupMessage);
        setNodeScrapedSites(nodeId, list);
      } catch {
        if (controller.signal.aborted) return;
        setScrapedSitesError("Could not load scraped sites.");
      } finally {
        if (!controller.signal.aborted) setScrapedSitesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [nodeId, setNodeScrapedSites]);

  useEffect(() => {
    if (!nodeId) return;
    const controller = new AbortController();

    void (async () => {
      setGooglePhotosLoading(true);
      setGooglePhotosError(null);
      setGooglePhotosNotice(null);
      try {
        const res = await fetch(
          `/api/node-google-photos?nodeId=${encodeURIComponent(nodeId)}`,
          { signal: controller.signal }
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
          setGooglePhotosError(msg);
          return;
        }

        const list =
          json &&
          typeof json === "object" &&
          "items" in json &&
          Array.isArray((json as { items?: unknown }).items)
            ? ((json as { items: NodeGooglePhotosItem[] }).items ?? [])
            : [];
        const setupMessage =
          json &&
          typeof json === "object" &&
          "setupMessage" in json &&
          typeof (json as { setupMessage?: unknown }).setupMessage === "string"
            ? (json as { setupMessage: string }).setupMessage
            : null;
        setGooglePhotosNotice(setupMessage);
        setNodeGooglePhotos(nodeId, list);
      } catch {
        if (controller.signal.aborted) return;
        setGooglePhotosError("Could not load Google Photos context.");
      } finally {
        if (!controller.signal.aborted) setGooglePhotosLoading(false);
      }
    })();

    return () => controller.abort();
  }, [nodeId, setNodeGooglePhotos]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToolLookupName("");
    setDocsLookupUrl("");
    setRotateDraftById({});
    setGooglePhotosToken(null);
  }, [nodeId]);

  const addIntegration = useCallback(() => {
    if (!nodeId) return Promise.resolve();
    const trimmedName = integrationName.trim();
    if (trimmedName.length === 0) return Promise.resolve();

    return (async () => {
      setIntegrationLoading(true);
      setIntegrationError(null);
      try {
        const res = await fetch("/api/node-integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId,
            name: trimmedName,
            baseUrl: integrationBaseUrl.trim(),
            auth: integrationAuth,
            notes: integrationNotes.trim(),
            credential: integrationCredential.trim(),
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
          setIntegrationError(msg);
          return;
        }
        const integration =
          json &&
          typeof json === "object" &&
          "integration" in json &&
          (json as { integration?: unknown }).integration &&
          typeof (json as { integration?: unknown }).integration === "object"
            ? ((json as { integration: NodeApiIntegration }).integration as NodeApiIntegration)
            : null;
        if (!integration) return;
        setNodeIntegrations(nodeId, [...nodeIntegrations, integration]);
        setIntegrationName("");
        setIntegrationBaseUrl("");
        setIntegrationAuth("unknown");
        setIntegrationNotes("");
        setIntegrationCredential("");
      } catch {
        setIntegrationError("Could not create integration.");
      } finally {
        setIntegrationLoading(false);
      }
    })();
  }, [
    integrationAuth,
    integrationBaseUrl,
    integrationCredential,
    integrationName,
    integrationNotes,
    nodeId,
    nodeIntegrations,
    setNodeIntegrations,
  ]);

  const autofillIntegration = useCallback(() => {
    const query = toolLookupName.trim();
    if (!query) return Promise.resolve();

    return (async () => {
      setToolLookupLoading(true);
      setIntegrationError(null);
      try {
        const res = await fetch("/api/integrations/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: query }),
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
          setIntegrationError(msg);
          return;
        }

        const integration =
          json &&
          typeof json === "object" &&
          "integration" in json &&
          (json as { integration?: unknown }).integration &&
          typeof (json as { integration?: unknown }).integration === "object"
            ? ((json as {
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
        if (!integration) return;

        if (typeof integration.name === "string") setIntegrationName(integration.name);
        if (typeof integration.baseUrl === "string")
          setIntegrationBaseUrl(integration.baseUrl);
        if (
          integration.auth === "api_key" ||
          integration.auth === "oauth" ||
          integration.auth === "unknown"
        ) {
          setIntegrationAuth(integration.auth);
        }
        if (typeof integration.notes === "string") setIntegrationNotes(integration.notes);
      } catch {
        setIntegrationError("Could not autofill integration details.");
      } finally {
        setToolLookupLoading(false);
      }
    })();
  }, [toolLookupName]);

  const rotateIntegrationSecret = useCallback(
    (integrationId: string) => {
      if (!nodeId) return Promise.resolve();
      const draft = (rotateDraftById[integrationId] ?? "").trim();
      if (!draft) return Promise.resolve();

      return (async () => {
        setIntegrationLoading(true);
        setIntegrationError(null);
        try {
          const res = await fetch(`/api/node-integrations/${integrationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: draft }),
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
            setIntegrationError(msg);
            return;
          }

          const updated =
            json &&
            typeof json === "object" &&
            "integration" in json &&
            (json as { integration?: unknown }).integration &&
            typeof (json as { integration?: unknown }).integration === "object"
              ? ((json as { integration: NodeApiIntegration }).integration as NodeApiIntegration)
              : null;
          if (!updated) return;

          setNodeIntegrations(
            nodeId,
            nodeIntegrations.map((row) =>
              row.id === integrationId ? { ...row, ...updated } : row
            )
          );
          setRotateDraftById((prev) => ({ ...prev, [integrationId]: "" }));
        } catch {
          setIntegrationError("Could not rotate secret.");
        } finally {
          setIntegrationLoading(false);
        }
      })();
    },
    [nodeId, nodeIntegrations, rotateDraftById, setNodeIntegrations]
  );

  const autofillFromDocsUrl = useCallback(() => {
    const input = docsLookupUrl.trim();
    if (!input) return Promise.resolve();

    return (async () => {
      setDocsLookupLoading(true);
      setIntegrationError(null);
      try {
        const res = await fetch("/api/integrations/autofill-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: input }),
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
          setIntegrationError(msg);
          return;
        }

        const integration =
          json &&
          typeof json === "object" &&
          "integration" in json &&
          (json as { integration?: unknown }).integration &&
          typeof (json as { integration?: unknown }).integration === "object"
            ? ((json as {
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
        if (!integration) return;

        if (typeof integration.name === "string") setIntegrationName(integration.name);
        if (typeof integration.baseUrl === "string")
          setIntegrationBaseUrl(integration.baseUrl);
        if (
          integration.auth === "api_key" ||
          integration.auth === "oauth" ||
          integration.auth === "unknown"
        ) {
          setIntegrationAuth(integration.auth);
        }
        if (typeof integration.notes === "string") setIntegrationNotes(integration.notes);
      } catch {
        setIntegrationError("Could not auto-fill from docs URL.");
      } finally {
        setDocsLookupLoading(false);
      }
    })();
  }, [docsLookupUrl]);

  const removeIntegration = useCallback(
    (integrationId: string) => {
      if (!nodeId) return;
      void (async () => {
        setIntegrationLoading(true);
        setIntegrationError(null);
        try {
          const res = await fetch(`/api/node-integrations/${integrationId}`, {
            method: "DELETE",
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
            setIntegrationError(msg);
            return;
          }
          setNodeIntegrations(
            nodeId,
            nodeIntegrations.filter((x) => x.id !== integrationId)
          );
        } catch {
          setIntegrationError("Could not delete integration.");
        } finally {
          setIntegrationLoading(false);
        }
      })();
    },
    [nodeId, nodeIntegrations, setNodeIntegrations]
  );

  const loadGoogleIdentityScript = useCallback(async () => {
    if (typeof window === "undefined") {
      throw new Error("Google auth is available only in the browser.");
    }
    if (window.google?.accounts?.oauth2) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-google-identity="true"]'
      );
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Google auth script.")), {
          once: true,
        });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google auth script."));
      document.head.appendChild(script);
    });
    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google auth script loaded but OAuth client is unavailable.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const configRes = await fetch("/api/google-photos/config", { method: "GET" });
        const configJson: unknown = await configRes.json().catch(() => ({}));
        if (!configRes.ok) return;
        const clientId =
          configJson &&
          typeof configJson === "object" &&
          "clientId" in configJson &&
          typeof (configJson as { clientId?: unknown }).clientId === "string"
            ? (configJson as { clientId: string }).clientId
            : "";
        const scope =
          configJson &&
          typeof configJson === "object" &&
          "scope" in configJson &&
          typeof (configJson as { scope?: unknown }).scope === "string"
            ? (configJson as { scope: string }).scope
            : "";
        if (!clientId || !scope || !active) return;
        setGoogleOAuthConfig({ clientId, scope });
        await loadGoogleIdentityScript();
        if (!active) return;
        setGoogleIdentityReady(true);
      } catch {
        if (!active) return;
        setGoogleIdentityReady(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadGoogleIdentityScript]);

  const connectGooglePhotos = useCallback(async () => {
    setGooglePhotosError(null);
    setGooglePhotosNotice(null);
    if (!googleOAuthConfig || !googleIdentityReady || !window.google?.accounts?.oauth2) {
      setGooglePhotosError(
        "Google auth is still loading. Wait 1-2 seconds and try again."
      );
      return;
    }
    setGooglePhotosLoading(true);
    try {
      const token = await new Promise<string>((resolve, reject) => {
        const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
          client_id: googleOAuthConfig.clientId,
          scope: googleOAuthConfig.scope,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error || "Google authorization failed."));
              return;
            }
            resolve(response.access_token);
          },
          error_callback: () => {
            reject(new Error("Google authorization popup was blocked or closed."));
          },
        });
        if (!tokenClient) {
          reject(new Error("Could not initialize Google OAuth token client."));
          return;
        }
        tokenClient.requestAccessToken({ prompt: "consent" });
      });
      setGooglePhotosToken(token);
      setGooglePhotosNotice("Connected to Google Photos. You can now select items.");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Could not connect to Google Photos.";
      setGooglePhotosError(msg);
    } finally {
      setGooglePhotosLoading(false);
    }
  }, [googleIdentityReady, googleOAuthConfig]);

  const selectGooglePhotos = useCallback(async () => {
    if (!nodeId) return;
    if (!googlePhotosToken) {
      setGooglePhotosError("Connect Google Photos first.");
      return;
    }
    setGooglePhotosError(null);
    setGooglePhotosNotice(null);
    setGooglePhotosLoading(true);
    try {
      const requestId = crypto.randomUUID();
      const sessionRes = await fetch("/api/google-photos/picker-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: googlePhotosToken, requestId }),
      });
      const sessionJson: unknown = await sessionRes.json().catch(() => ({}));
      if (!sessionRes.ok) {
        const msg =
          sessionJson &&
          typeof sessionJson === "object" &&
          "error" in sessionJson &&
          typeof (sessionJson as { error: unknown }).error === "string"
            ? (sessionJson as { error: string }).error
            : `HTTP ${sessionRes.status}`;
        throw new Error(msg);
      }

      const session =
        sessionJson &&
        typeof sessionJson === "object" &&
        "session" in sessionJson &&
        (sessionJson as { session?: unknown }).session &&
        typeof (sessionJson as { session?: unknown }).session === "object"
          ? ((sessionJson as { session: Record<string, unknown> }).session ?? {})
          : {};
      const sessionId = typeof session.id === "string" ? session.id : "";
      const pickerUri = typeof session.pickerUri === "string" ? session.pickerUri : "";
      if (!sessionId || !pickerUri) {
        throw new Error("Could not initialize Google Photos picker session.");
      }

      window.open(`${pickerUri.replace(/\/+$/, "")}/autoclose`, "_blank", "noopener,noreferrer");

      const pollingConfig =
        session.pollingConfig && typeof session.pollingConfig === "object"
          ? (session.pollingConfig as Record<string, unknown>)
          : {};
      const pollSeconds = parseDurationSeconds(pollingConfig.pollInterval, 3);
      const timeoutSeconds = parseDurationSeconds(pollingConfig.timeoutIn, 300);
      const started = Date.now();
      let mediaItemsSet = Boolean(session.mediaItemsSet);
      while (!mediaItemsSet) {
        if (Date.now() - started > timeoutSeconds * 1000) {
          throw new Error("Timed out waiting for Google Photos selection.");
        }
        await new Promise((resolve) => window.setTimeout(resolve, pollSeconds * 1000));
        const statusRes = await fetch(
          `/api/google-photos/picker-session/${encodeURIComponent(sessionId)}?accessToken=${encodeURIComponent(googlePhotosToken)}`,
          { method: "GET" }
        );
        const statusJson: unknown = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          const msg =
            statusJson &&
            typeof statusJson === "object" &&
            "error" in statusJson &&
            typeof (statusJson as { error: unknown }).error === "string"
              ? (statusJson as { error: string }).error
              : `HTTP ${statusRes.status}`;
          throw new Error(msg);
        }
        const polled =
          statusJson &&
          typeof statusJson === "object" &&
          "session" in statusJson &&
          (statusJson as { session?: unknown }).session &&
          typeof (statusJson as { session?: unknown }).session === "object"
            ? (statusJson as { session: Record<string, unknown> }).session
            : null;
        mediaItemsSet = Boolean(polled?.mediaItemsSet);
      }

      let pageToken: string | null = null;
      const selected: Record<string, unknown>[] = [];
      do {
        const mediaRes = await fetch(
          `/api/google-photos/picker-session/${encodeURIComponent(sessionId)}/media-items?accessToken=${encodeURIComponent(googlePhotosToken)}&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
          { method: "GET" }
        );
        const mediaJson: unknown = await mediaRes.json().catch(() => ({}));
        if (!mediaRes.ok) {
          const msg =
            mediaJson &&
            typeof mediaJson === "object" &&
            "error" in mediaJson &&
            typeof (mediaJson as { error: unknown }).error === "string"
              ? (mediaJson as { error: string }).error
              : `HTTP ${mediaRes.status}`;
          throw new Error(msg);
        }
        const result =
          mediaJson &&
          typeof mediaJson === "object" &&
          "result" in mediaJson &&
          (mediaJson as { result?: unknown }).result &&
          typeof (mediaJson as { result?: unknown }).result === "object"
            ? ((mediaJson as { result: Record<string, unknown> }).result ?? {})
            : {};
        const pageItems = Array.isArray(result.mediaItems)
          ? (result.mediaItems as Record<string, unknown>[])
          : [];
        selected.push(...pageItems);
        pageToken = typeof result.nextPageToken === "string" ? result.nextPageToken : null;
      } while (pageToken);

      if (selected.length === 0) {
        setGooglePhotosNotice("No media items were selected.");
        return;
      }

      const toSave = selected.map((item) => {
        const mediaFile =
          item.mediaFile && typeof item.mediaFile === "object"
            ? (item.mediaFile as Record<string, unknown>)
            : {};
        const metadata =
          mediaFile.mediaFileMetadata && typeof mediaFile.mediaFileMetadata === "object"
            ? (mediaFile.mediaFileMetadata as Record<string, unknown>)
            : {};
        const photoMeta =
          metadata.photo && typeof metadata.photo === "object"
            ? (metadata.photo as Record<string, unknown>)
            : {};
        const id = typeof item.id === "string" ? item.id : crypto.randomUUID();
        const maybeType =
          typeof item.itemType === "string"
            ? item.itemType.toLowerCase()
            : typeof item.type === "string"
              ? item.type.toLowerCase()
              : "photo";
        return {
          itemType: maybeType === "album" ? "album" : "photo",
          googleItemId: id,
          title:
            typeof mediaFile.filename === "string"
              ? mediaFile.filename
              : typeof item.id === "string"
                ? item.id
                : null,
          mediaUrl: typeof mediaFile.baseUrl === "string" ? mediaFile.baseUrl : null,
          thumbnailUrl:
            typeof mediaFile.baseUrl === "string"
              ? `${mediaFile.baseUrl}=w512-h512`
              : null,
          productUrl: typeof item.pickerUri === "string" ? item.pickerUri : null,
          mimeType: typeof mediaFile.mimeType === "string" ? mediaFile.mimeType : null,
          createdTime:
            typeof metadata.createTime === "string" ? metadata.createTime : null,
          cameraMake:
            typeof photoMeta.cameraMake === "string" ? photoMeta.cameraMake : null,
          cameraModel:
            typeof photoMeta.cameraModel === "string" ? photoMeta.cameraModel : null,
          payloadJson: item,
        };
      });

      const saveRes = await fetch("/api/node-google-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, items: toSave }),
      });
      const saveJson: unknown = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        const msg =
          saveJson &&
          typeof saveJson === "object" &&
          "error" in saveJson &&
          typeof (saveJson as { error: unknown }).error === "string"
            ? (saveJson as { error: string }).error
            : `HTTP ${saveRes.status}`;
        throw new Error(msg);
      }
      const savedItems =
        saveJson &&
        typeof saveJson === "object" &&
        "items" in saveJson &&
        Array.isArray((saveJson as { items?: unknown }).items)
          ? ((saveJson as { items: NodeGooglePhotosItem[] }).items ?? [])
          : [];
      const mergedById = new Map(
        [...nodeGooglePhotos, ...savedItems].map((x) => [x.id, x])
      );
      setNodeGooglePhotos(nodeId, [...mergedById.values()]);
      setGooglePhotosNotice(`Imported ${savedItems.length} Google Photos item(s).`);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Could not import Google Photos items.";
      setGooglePhotosError(msg);
    } finally {
      setGooglePhotosLoading(false);
    }
  }, [googlePhotosToken, nodeGooglePhotos, nodeId, setNodeGooglePhotos]);

  const removeGooglePhotoItem = useCallback(
    (itemId: string) => {
      if (!nodeId) return;
      void (async () => {
        setGooglePhotosError(null);
        setGooglePhotosLoading(true);
        try {
          const res = await fetch(`/api/node-google-photos/${itemId}`, {
            method: "DELETE",
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
            setGooglePhotosError(msg);
            return;
          }
          setNodeGooglePhotos(
            nodeId,
            nodeGooglePhotos.filter((x) => x.id !== itemId)
          );
        } catch {
          setGooglePhotosError("Could not remove Google Photos item.");
        } finally {
          setGooglePhotosLoading(false);
        }
      })();
    },
    [nodeGooglePhotos, nodeId, setNodeGooglePhotos]
  );

  const core = snapshot?.core_summary?.trim();
  const systemPrompt = snapshot?.system_prompt?.trim();
  const filteredScrapedSites = nodeScrapedSites.filter((site) => {
    if (scrapedConfidenceFilter === "all") return true;
    const parsed = parseStructuredScrape(site.contentExcerpt);
    if (scrapedConfidenceFilter === "high") return parsed.confidence === "High";
    return parsed.confidence === "High" || parsed.confidence === "Medium";
  });
  const summarySection = usePersistedContextSectionCollapsed("summary");
  const promptSection = usePersistedContextSectionCollapsed("system-prompt");
  const linksSection = usePersistedContextSectionCollapsed("linked-nodes");
  const apiSection = usePersistedContextSectionCollapsed("node-apis", true);
  const googlePhotosSection = usePersistedContextSectionCollapsed("google-photos", true);
  const scrapedSection = usePersistedContextSectionCollapsed("scraped-sites", true);

  return (
    <PaneCard
      paneId="context"
      title="Context"
      eyebrow={`Node · ${nodeTitle}`}
      className="h-full"
    >
      {sync.loading ? (
        <p className="text-muted-foreground">Loading node context…</p>
      ) : null}
      {sync.error ? (
        <p className="text-destructive text-sm">{sync.error}</p>
      ) : null}
      {!nodeId ? (
        <p className="text-muted-foreground">
          Select a node in the graph to load its saved summary and links.
        </p>
      ) : (
        <>
          <ContextSection
            sectionId="summary"
            title="Core summary"
            collapsed={summarySection.collapsed}
            onToggle={summarySection.toggle}
          >
            <p className="text-foreground whitespace-pre-wrap">
              {core && core.length > 0 ? (
                core
              ) : (
                <span className="text-muted-foreground italic">
                  No core summary yet for this node—answer onboarding questions or
                  chat to fill it in later.
                </span>
              )}
            </p>
          </ContextSection>

          <ContextSection
            sectionId="system-prompt"
            title="System prompt"
            collapsed={promptSection.collapsed}
            onToggle={promptSection.toggle}
          >
            {systemPrompt && systemPrompt.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border/80 bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                {systemPrompt}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs italic">
                No system prompt yet—Architect fills this when you create a node
                or when onboarding runs.
              </p>
            )}
          </ContextSection>

          <ContextSection
            sectionId="linked-nodes"
            title="Linked nodes"
            collapsed={linksSection.collapsed}
            onToggle={linksSection.toggle}
          >
            {sync.linksError ? (
              <p className="text-xs text-destructive">{sync.linksError}</p>
            ) : null}
            {sync.influences.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {sync.linksError
                  ? "No linked nodes shown because link loading failed."
                  : (
                    <>
                      No cross-links in{" "}
                      <code className="text-foreground">node_links</code> yet for
                      this selection.
                    </>
                  )}
              </p>
            ) : (
              <ul className="space-y-3">
                {sync.influences.map((link) => (
                  <InfluenceRow key={link.linkId} link={link} />
                ))}
              </ul>
            )}
          </ContextSection>

          <ContextSection
            sectionId="node-apis"
            title="Node APIs"
            collapsed={apiSection.collapsed}
            onToggle={apiSection.toggle}
            action={
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={apiSection.toggle}
              >
                {apiSection.collapsed ? "Show APIs" : "Hide APIs"}
              </Button>
            }
          >
            <div className="space-y-3">
              {integrationLoading ? (
                <p className="text-xs text-muted-foreground">Syncing integrations…</p>
              ) : null}
              {integrationError ? (
                <p className="text-xs text-destructive">{integrationError}</p>
              ) : null}
              {integrationNotice ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {integrationNotice}
                </p>
              ) : null}
              {nodeIntegrations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No API integrations attached to this node yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {nodeIntegrations.map((integration) => (
                    <li
                      key={integration.id}
                      className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">
                            {integration.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            auth: {integration.auth}
                            {integration.baseUrl
                              ? ` · ${integration.baseUrl}`
                              : ""}
                            {integration.hasSecret
                              ? ` · secret ${integration.secretHint ?? "set"}`
                              : " · no secret"}
                            {integration.inherited
                              ? ` · inherited from ${integration.sourceNodeTitle ?? integration.sourceNodeId ?? "parent"}`
                              : ""}
                          </p>
                        </div>
                        {integration.inherited ? null : (
                          <button
                            type="button"
                            onClick={() => removeIntegration(integration.id)}
                            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {integration.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {integration.notes}
                        </p>
                      ) : null}
                      {integration.inherited ? null : (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="password"
                            value={rotateDraftById[integration.id] ?? ""}
                            onChange={(e) =>
                              setRotateDraftById((prev) => ({
                                ...prev,
                                [integration.id]: e.target.value.slice(0, 4000),
                              }))
                            }
                            placeholder="New secret / API key"
                            className="min-w-[14rem] flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void rotateIntegrationSecret(integration.id)}
                            disabled={
                              integrationLoading ||
                              (rotateDraftById[integration.id] ?? "").trim().length === 0
                            }
                          >
                            Rotate secret
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-3">
                <p className="text-xs font-medium text-foreground">Add API to node</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={toolLookupName}
                    onChange={(e) => setToolLookupName(e.target.value.slice(0, 120))}
                    placeholder="Quick fill by tool name (e.g. Hevy)"
                    className="min-w-[14rem] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void autofillIntegration()}
                    disabled={toolLookupLoading || toolLookupName.trim().length === 0}
                  >
                    {toolLookupLoading ? "Looking up…" : "Auto-fill"}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={docsLookupUrl}
                    onChange={(e) => setDocsLookupUrl(e.target.value.slice(0, 700))}
                    placeholder="Or paste API docs URL (best-effort auto-fill)"
                    className="min-w-[14rem] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void autofillFromDocsUrl()}
                    disabled={docsLookupLoading || docsLookupUrl.trim().length === 0}
                  >
                    {docsLookupLoading ? "Reading docs…" : "Fill from URL"}
                  </Button>
                </div>
                <input
                  value={integrationName}
                  onChange={(e) => setIntegrationName(e.target.value.slice(0, 120))}
                  placeholder="Integration name (e.g. Hevy)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <input
                  value={integrationBaseUrl}
                  onChange={(e) => setIntegrationBaseUrl(e.target.value.slice(0, 400))}
                  placeholder="Base URL or docs URL"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <select
                  value={integrationAuth}
                  onChange={(e) =>
                    setIntegrationAuth(
                      e.target.value as NodeApiIntegration["auth"]
                    )
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="unknown">Auth type: unknown</option>
                  <option value="api_key">Auth type: API key</option>
                  <option value="oauth">Auth type: OAuth</option>
                </select>
                <textarea
                  value={integrationNotes}
                  onChange={(e) => setIntegrationNotes(e.target.value.slice(0, 500))}
                  placeholder="Notes for this API (what data to pull, how to use it)"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <input
                  type="password"
                  value={integrationCredential}
                  onChange={(e) =>
                    setIntegrationCredential(e.target.value.slice(0, 4000))
                  }
                  placeholder="Credential / API key (stored encrypted server-side)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <p className="text-[0.72rem] leading-snug text-muted-foreground">
                  Secrets are sent to server routes and encrypted before storage. They are never shown back in full.
                </p>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void addIntegration()}
                    disabled={
                      !nodeId ||
                      integrationLoading ||
                      integrationName.trim().length === 0
                    }
                  >
                    Add API
                  </Button>
                </div>
              </div>
            </div>
          </ContextSection>

          <ContextSection
            sectionId="google-photos"
            title="Google Photos"
            collapsed={googlePhotosSection.collapsed}
            onToggle={googlePhotosSection.toggle}
            action={
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={googlePhotosSection.toggle}
              >
                {googlePhotosSection.collapsed ? "Google Photos" : "Hide Photos"}
              </Button>
            }
          >
            <div className="space-y-2">
              {googlePhotosLoading ? (
                <p className="text-xs text-muted-foreground">Syncing Google Photos context…</p>
              ) : null}
              {googlePhotosError ? (
                <p className="text-xs text-destructive">{googlePhotosError}</p>
              ) : null}
              {googlePhotosNotice ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {googlePhotosNotice}
                </p>
              ) : null}
              <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Setup checklist</p>
                <p>
                  1) Supabase table setup is complete (
                  <code className="text-foreground">node_google_photos_items</code> is applied).
                </p>
                <p>
                  2) Set{" "}
                  <code className="text-foreground">
                    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
                  </code>
                  .
                </p>
                <p>
                  3) Enable Google Photos Picker API + OAuth consent for scope{" "}
                  <code className="text-foreground">
                    photospicker.mediaitems.readonly
                  </code>
                  .
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void connectGooglePhotos()}
                  disabled={googlePhotosLoading || !googleIdentityReady || !googleOAuthConfig}
                >
                  {googlePhotosToken ? "Reconnect Google" : "Connect Google Photos"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void selectGooglePhotos()}
                  disabled={googlePhotosLoading || !googlePhotosToken}
                >
                  Select albums/photos
                </Button>
              </div>

              {nodeGooglePhotos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Google Photos selected for this node yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {nodeGooglePhotos.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.title || item.googleItemId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.itemType}
                            {item.createdTime ? ` · ${item.createdTime}` : ""}
                            {item.mimeType ? ` · ${item.mimeType}` : ""}
                          </p>
                          {(item.cameraMake || item.cameraModel) ? (
                            <p className="text-xs text-muted-foreground">
                              Camera: {[item.cameraMake, item.cameraModel]
                                .filter(Boolean)
                                .join(" ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {item.productUrl ? (
                            <a
                              href={item.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Open
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeGooglePhotoItem(item.id)}
                            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ContextSection>

          <ContextSection
            sectionId="scraped-sites"
            title="Scraped Sites"
            collapsed={scrapedSection.collapsed}
            onToggle={scrapedSection.toggle}
            action={
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={scrapedSection.toggle}
              >
                {scrapedSection.collapsed ? "Scraped Sites" : "Hide Scraped"}
              </Button>
            }
          >
            <div className="space-y-2">
              {scrapedSitesLoading ? (
                <p className="text-xs text-muted-foreground">Loading scraped pages…</p>
              ) : null}
              {scrapedSitesError ? (
                <p className="text-xs text-destructive">{scrapedSitesError}</p>
              ) : null}
              {scrapedSitesNotice ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {scrapedSitesNotice}
                </p>
              ) : null}
              {nodeScrapedSites.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No scraped sites yet. Use <code className="text-foreground">/scrape</code> in Ask chat and follow the guided steps.
                </p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant={scrapedConfidenceFilter === "high" ? "default" : "outline"}
                      onClick={() => setScrapedConfidenceFilter("high")}
                    >
                      High only
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={
                        scrapedConfidenceFilter === "medium_plus" ? "default" : "outline"
                      }
                      onClick={() => setScrapedConfidenceFilter("medium_plus")}
                    >
                      Medium+
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={scrapedConfidenceFilter === "all" ? "default" : "outline"}
                      onClick={() => setScrapedConfidenceFilter("all")}
                    >
                      All
                    </Button>
                  </div>
                  {filteredScrapedSites.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No scraped entries match this confidence filter.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {filteredScrapedSites.map((site) => (
                        <li key={site.id}>
                          <ScrapedSiteCard site={site} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </ContextSection>
        </>
      )}
    </PaneCard>
  );
}

export function AskPane() {
  const nodeId = useNodeStore((s) => s.selectedNodeId);
  const nodeTitle = useSelectedNodeTitle();

  return (
    <PaneCard
      paneId="ask"
      title="Ask"
      eyebrow={`Chat · ${nodeTitle}`}
      className="min-h-0 flex-1"
      collapseShrinksHeight
      contentClassName="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-5 py-4"
    >
      <AskChatPanel anchorNodeId={nodeId} />
    </PaneCard>
  );
}

const QUESTIONS_WINDOW_SIZE = 3;

type SyncDone = {
  done: true;
  core_summary: string | null;
  onboarding_questions: string[] | null;
  onboarding_answers: string[] | null;
  status: string;
};

type SyncSkipped =
  | { skipped: true; reason: string; coach_message?: string };

type PlanDraft = {
  title: string;
  summary: string;
  milestones_markdown: string;
  next_actions_markdown: string;
  risks_markdown: string;
};
const EMPTY_NODE_INTEGRATIONS: NodeApiIntegration[] = [];
const EMPTY_NODE_SCRAPED_SITES: NodeScrapedSite[] = [];
const EMPTY_NODE_GOOGLE_PHOTOS_ITEMS: NodeGooglePhotosItem[] = [];

export function QuestionsPane() {
  const nodeId = useNodeStore((s) => s.selectedNodeId);
  const snapshot = useNodeStore((s) =>
    nodeId ? s.nodesById[nodeId] : undefined
  );
  const updateNodePatch = useNodeStore((s) => s.updateNodePatch);
  const nodeTitle = useSelectedNodeTitle();

  const queue = useMemo(
    () => snapshot?.onboarding_questions ?? [],
    [snapshot?.onboarding_questions]
  );
  const visibleQuestions = queue.slice(0, QUESTIONS_WINDOW_SIZE);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const safeActiveQuestionIndex = Math.min(
    activeQuestionIndex,
    Math.max(visibleQuestions.length - 1, 0)
  );
  const currentQuestion = visibleQuestions[safeActiveQuestionIndex] ?? "";
  const questionSig = useMemo(
    () => JSON.stringify(queue),
    [queue]
  );
  const answerSig = useMemo(
    () => JSON.stringify(snapshot?.onboarding_answers ?? null),
    [snapshot?.onboarding_answers]
  );

  const tokenRef = useRef(0);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [advanceFlash, setAdvanceFlash] = useState(false);

  useEffect(() => {
    tokenRef.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftAnswer("");
    setCoachMessage(null);
    setSyncError(null);
    setAdvanceFlash(false);
    setActiveQuestionIndex(0);
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId || !currentQuestion.trim()) return;
    const persistedDraft =
      snapshot?.onboarding_answers?.[safeActiveQuestionIndex] ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftAnswer(persistedDraft);
  }, [
    currentQuestion,
    nodeId,
    questionSig,
    answerSig,
    safeActiveQuestionIndex,
    snapshot?.onboarding_answers,
  ]);

  const submitAnswer = useCallback(async () => {
    if (!nodeId || !currentQuestion.trim() || syncing) return;

    tokenRef.current += 1;
    setSyncing(true);
    setSyncError(null);
    const sendToken = tokenRef.current;

    try {
      const res = await fetch("/api/onboarding/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          question: currentQuestion,
          answer: draftAnswer,
        }),
      });

      const json: unknown = await res.json().catch(() => ({}));

      if (sendToken !== tokenRef.current) return;

      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `HTTP ${res.status}`;
        setSyncError(msg);
        return;
      }

      if (
        json &&
        typeof json === "object" &&
        "skipped" in json &&
        (json as SyncSkipped).skipped
      ) {
        const sk = json as SyncSkipped;
        if (sk.coach_message) setCoachMessage(sk.coach_message);
        return;
      }

      if (
        json &&
        typeof json === "object" &&
        "done" in json &&
        (json as SyncDone).done
      ) {
        const done = json as SyncDone;
        updateNodePatch(nodeId, {
          core_summary: done.core_summary ?? null,
          onboarding_questions: done.onboarding_questions,
          onboarding_answers: done.onboarding_answers,
          status: done.status as NodeStatus,
        });
        setDraftAnswer("");
        setCoachMessage(null);
        return;
      }

      const body = json as {
        core_summary?: unknown;
        answer_sufficient?: unknown;
        coach_message?: unknown;
        onboarding_questions?: unknown;
        onboarding_answers?: unknown;
        status?: unknown;
      };

      if (typeof body.core_summary !== "string") return;

      const sufficient =
        typeof body.answer_sufficient === "boolean"
          ? body.answer_sufficient
          : undefined;
      if (sufficient !== true && sufficient !== false) return;

      if (sufficient) {
        setCoachMessage(null);
        setDraftAnswer("");
        setAdvanceFlash(true);
        window.setTimeout(() => setAdvanceFlash(false), 1600);

        updateNodePatch(nodeId, {
          core_summary: body.core_summary,
          onboarding_questions: Array.isArray(body.onboarding_questions)
            ? (body.onboarding_questions as string[])
            : null,
          onboarding_answers: Array.isArray(body.onboarding_answers)
            ? (body.onboarding_answers as string[])
            : null,
          ...(typeof body.status === "string"
            ? { status: body.status as NodeStatus }
            : {}),
        });
      } else {
        updateNodePatch(nodeId, {
          core_summary: body.core_summary,
        });
        const cm =
          typeof body.coach_message === "string"
            ? body.coach_message.trim()
            : "";
        setCoachMessage(cm.length > 0 ? cm : null);
      }
    } catch {
      if (sendToken !== tokenRef.current) return;
      setSyncError("Network error while syncing.");
    } finally {
      if (sendToken === tokenRef.current) setSyncing(false);
    }
  }, [
    currentQuestion,
    draftAnswer,
    nodeId,
    syncing,
    updateNodePatch,
  ]);

  const goToPreviousQuestion = useCallback(() => {
    setActiveQuestionIndex((idx) =>
      visibleQuestions.length === 0
        ? 0
        : (idx - 1 + visibleQuestions.length) % visibleQuestions.length
    );
  }, [visibleQuestions.length]);

  const goToNextQuestion = useCallback(() => {
    setActiveQuestionIndex((idx) =>
      visibleQuestions.length === 0 ? 0 : (idx + 1) % visibleQuestions.length
    );
  }, [visibleQuestions.length]);

  const statusLine =
    syncError ??
    (syncing
      ? "Updating Context…"
      : advanceFlash
        ? "Question answered — here's the next prompt if any."
        : coachMessage ??
          (draftAnswer.trim().length > 0 &&
          draftAnswer.trim().length < 6
            ? "Keep typing—a little more text unlocks Context updates."
            : draftAnswer.trim().length >= 6
              ? "Press Enter to submit this answer."
              : null));

  return (
    <PaneCard
      paneId="questions"
      title="Questions"
      eyebrow={`Onboarding · ${nodeTitle}`}
      className="h-full"
      contentClassName="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4 text-[0.95rem]"
    >
      {!nodeId ? (
          <p className="text-muted-foreground">
            Select a node to view its architect-generated onboarding prompts.
          </p>
        ) : queue.length === 0 ? (
          <p className="text-muted-foreground">
            {snapshot?.status === "onboarding"
              ? "No onboarding queue for this node. Create a fresh node or run Architect."
              : "You're up to date—no onboarding questions in the queue."}
          </p>
        ) : (
          <>
            {statusLine ? (
              <p
                className={
                  syncError
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {statusLine}
              </p>
            ) : null}
            <div className="space-y-3">
              {visibleQuestions.length > 1 ? (
                <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/40 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={goToPreviousQuestion}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label="Show previous question"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <p className="text-xs font-medium text-muted-foreground">
                    Question {safeActiveQuestionIndex + 1} of {visibleQuestions.length}
                  </p>
                  <button
                    type="button"
                    onClick={goToNextQuestion}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label="Show next question"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
              ) : null}
              <div className="flex gap-2">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                <p className="font-medium leading-snug text-foreground">
                  {currentQuestion}
                </p>
              </div>
              <label
                htmlFor={`onboarding-answer-${nodeId}`}
                className="sr-only"
              >
                Your answer
              </label>
              <textarea
                id={`onboarding-answer-${nodeId}`}
                value={draftAnswer}
                placeholder="Type your answer, then press Enter to submit. Use Shift+Enter for a new line."
                rows={6}
                spellCheck={true}
                onChange={(e) => {
                  const v = e.target.value.slice(0, 16000);
                  setCoachMessage(null);
                  setDraftAnswer(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitAnswer();
                  }
                }}
                className={
                  "min-h-[6.5rem] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 " +
                  "text-foreground outline-none placeholder:text-muted-foreground " +
                  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 "
                }
              />
            </div>
          </>
        )}
    </PaneCard>
  );
}

export function PlanPane() {
  const nodeId = useNodeStore((s) => s.selectedNodeId);
  const snapshot = useNodeStore((s) =>
    nodeId ? s.nodesById[nodeId] : undefined
  );
  const nodeTitle = useSelectedNodeTitle();
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagram, setDiagram] = useState<{ title: string; mermaid: string } | null>(
    null
  );
  const [diagramLoading, setDiagramLoading] = useState(false);
  const autoSigRef = useRef<string>("");
  const contextSignature = useMemo(
    () =>
      JSON.stringify({
        id: nodeId,
        title: snapshot?.title ?? "",
        summary: snapshot?.core_summary ?? "",
        prompt: snapshot?.system_prompt ?? "",
        status: snapshot?.status ?? "",
        qlen: snapshot?.onboarding_questions?.length ?? 0,
      }),
    [
      nodeId,
      snapshot?.core_summary,
      snapshot?.onboarding_questions,
      snapshot?.status,
      snapshot?.system_prompt,
      snapshot?.title,
    ]
  );

  const generatePlan = useCallback(
    async (reason: string) => {
      if (!nodeId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId, reason }),
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
          setError(msg);
          return;
        }
        const body = json as {
          generated_at?: unknown;
          plan?: unknown;
        };
        if (!body.plan || typeof body.plan !== "object") return;
        const candidate = body.plan as Record<string, unknown>;
        if (
          typeof candidate.title !== "string" ||
          typeof candidate.summary !== "string" ||
          typeof candidate.milestones_markdown !== "string" ||
          typeof candidate.next_actions_markdown !== "string" ||
          typeof candidate.risks_markdown !== "string"
        ) {
          return;
        }
        setPlanDraft({
          title: candidate.title,
          summary: candidate.summary,
          milestones_markdown: candidate.milestones_markdown,
          next_actions_markdown: candidate.next_actions_markdown,
          risks_markdown: candidate.risks_markdown,
        });
        setGeneratedAt(
          typeof body.generated_at === "string" ? body.generated_at : new Date().toISOString()
        );
      } catch {
        setError("Could not generate plan.");
      } finally {
        setLoading(false);
      }
    },
    [nodeId]
  );

  const generateDiagram = useCallback(async () => {
    if (!planDraft) return;
    setDiagramLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTitle: planDraft.title,
          planSummary: planDraft.summary,
          milestonesMarkdown: planDraft.milestones_markdown,
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
        setError(msg);
        return;
      }
      const body = json as { title?: unknown; mermaid?: unknown };
      if (typeof body.title === "string" && typeof body.mermaid === "string") {
        setDiagram({ title: body.title, mermaid: body.mermaid });
      }
    } catch {
      setError("Could not generate diagram.");
    } finally {
      setDiagramLoading(false);
    }
  }, [planDraft]);

  useEffect(() => {
    autoSigRef.current = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlanDraft(null);
    setGeneratedAt(null);
    setDiagram(null);
    setError(null);
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId || !snapshot) return;
    if (autoSigRef.current === contextSignature) return;
    autoSigRef.current = contextSignature;

    const timeout = window.setTimeout(() => {
      void generatePlan("Auto-refresh after context change.");
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [contextSignature, generatePlan, nodeId, snapshot]);

  return (
    <PaneCard
      paneId="plan"
      title="Plan"
      eyebrow={`Living doc · ${nodeTitle}`}
      className="min-h-0 flex-1"
      collapseShrinksHeight
      contentClassName="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4 text-[0.95rem]"
    >
      {!nodeId ? (
        <p className="text-muted-foreground">
          Select a node to anchor planning to this workspace.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void generatePlan("Manual regenerate clicked by user.")}
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Regenerate plan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void generateDiagram()}
              disabled={!planDraft || diagramLoading}
            >
              {diagramLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Create diagram
            </Button>
            {generatedAt ? (
              <p className="text-xs text-muted-foreground">
                Updated {new Date(generatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!planDraft ? (
            <p className="text-muted-foreground">
              Building a draft from your latest context. You can regenerate any time.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Plan title
                </p>
                <p className="text-foreground font-medium">{planDraft.title}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Summary
                </p>
                <p className="text-foreground whitespace-pre-wrap">{planDraft.summary}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Milestones
                </p>
                <pre className="mt-1 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {planDraft.milestones_markdown}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Next actions
                </p>
                <pre className="mt-1 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {planDraft.next_actions_markdown}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Risks
                </p>
                <pre className="mt-1 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {planDraft.risks_markdown}
                </pre>
              </div>
            </div>
          )}

          {diagram ? (
            <div className="space-y-2 rounded-lg border border-border/80 bg-background/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {diagram.title}
              </p>
              <MermaidDiagram chart={diagram.mermaid} className="overflow-x-auto" />
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Show Mermaid source
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md border border-border/70 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                  {diagram.mermaid}
                </pre>
              </details>
            </div>
          ) : null}
        </>
      )}
    </PaneCard>
  );
}
