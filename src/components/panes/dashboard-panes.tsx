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
import type { NodeStatus } from "@/types/nodes";

const PANE_COLLAPSE_PREFIX = "sb.dashboard.pane.";

function usePersistedPaneCollapsed(paneId: string) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(PANE_COLLAPSE_PREFIX + paneId) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, [paneId]);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(PANE_COLLAPSE_PREFIX + paneId, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [paneId]);

  return { collapsed, toggle };
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

export function ContextPane({ sync }: { sync: ActiveNodeSyncState }) {
  const nodeId = useNodeStore((s) => s.selectedNodeId);
  const snapshot = useNodeStore((s) =>
    nodeId ? s.nodesById[nodeId] : undefined
  );
  const nodeTitle = useSelectedNodeTitle();

  const core = snapshot?.core_summary?.trim();
  const systemPrompt = snapshot?.system_prompt?.trim();

  return (
    <PaneCard paneId="context" title="Context" eyebrow={`Node · ${nodeTitle}`}>
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
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              System prompt
            </p>
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
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Linked nodes
            </p>
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
          </div>
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
