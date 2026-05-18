"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AskChatPanel } from "@/components/chat/ask-chat-panel";
import type { ActiveNodeSyncState, LinkedInfluence } from "@/hooks/use-active-node-sync";
import { cn } from "@/lib/utils";
import {
  useNodeStore,
  useSelectedNodeTitle,
} from "@/lib/store/use-node-store";
import type { NodeStatus } from "@/types/nodes";

function PaneCard({
  title,
  eyebrow,
  contentClassName,
  className,
  children,
}: {
  title: string;
  eyebrow: string;
  contentClassName?: string;
  /** Section root (e.g. `flex-1 min-h-0` when pane should fill a flex/grid cell). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10",
        className
      )}
    >
      <header className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="text-lg font-semibold">{title}</h2>
      </header>
      <div
        className={
          contentClassName ??
          "min-h-0 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-muted-foreground"
        }
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

  return (
    <PaneCard title="Context" eyebrow={`Node · ${nodeTitle}`}>
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
          <p className="text-foreground">
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
              Linked nodes
            </p>
            {sync.influences.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No cross-links in <code className="text-foreground">node_links</code>{" "}
                yet for this selection.
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
      title="Ask"
      eyebrow={`Chat · ${nodeTitle}`}
      className="min-h-0 flex-1"
      contentClassName="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3"
    >
      <AskChatPanel anchorNodeId={nodeId} />
    </PaneCard>
  );
}

const DEBOUNCE_SYNC_MS = 1000;

type SyncDone = {
  done: true;
  core_summary: string | null;
  onboarding_questions: string[] | null;
  onboarding_answers: string[] | null;
  status: string;
};

type SyncSkipped =
  | { skipped: true; reason: string; coach_message?: string };

export function QuestionsPane() {
  const nodeId = useNodeStore((s) => s.selectedNodeId);
  const snapshot = useNodeStore((s) =>
    nodeId ? s.nodesById[nodeId] : undefined
  );
  const updateNodePatch = useNodeStore((s) => s.updateNodePatch);
  const nodeTitle = useSelectedNodeTitle();

  const queue = snapshot?.onboarding_questions ?? [];
  const currentQuestion = queue[0] ?? "";
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
    setDraftAnswer("");
    setCoachMessage(null);
    setSyncError(null);
    setAdvanceFlash(false);
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    const persistedDraft = snapshot?.onboarding_answers?.[0] ?? "";
    setDraftAnswer(persistedDraft);
  }, [nodeId, questionSig, answerSig, snapshot?.onboarding_answers]);

  useEffect(() => {
    if (!nodeId || !currentQuestion.trim()) return;

    const trimmed = draftAnswer.trim();
    if (trimmed.length < 6) {
      return;
    }

    const scheduleToken = ++tokenRef.current;
    const timeoutId = window.setTimeout(() => {
      if (scheduleToken !== tokenRef.current) return;

      void (async () => {
        setSyncing(true);
        setSyncError(null);
        const sendToken = tokenRef.current;

        try {
          const res = await fetch("/api/onboarding/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nodeId,
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
      })();
    }, DEBOUNCE_SYNC_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    draftAnswer,
    nodeId,
    questionSig,
    currentQuestion,
    updateNodePatch,
  ]);

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
              ? "Context updates shortly after you pause typing."
              : null));

  return (
    <PaneCard
      title="Questions"
      eyebrow={`Onboarding · ${nodeTitle}`}
      contentClassName="flex max-h-[min(52vh,28rem)] flex-col gap-3 overflow-y-auto px-4 py-3 text-sm"
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
                placeholder="Type your answer. Context updates after you pause typing; when it's clear enough, we'll move on to the next question."
                rows={6}
                spellCheck={true}
                onChange={(e) => {
                  const v = e.target.value.slice(0, 16000);
                  setCoachMessage(null);
                  setDraftAnswer(v);
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
  const nodeTitle = useSelectedNodeTitle();

  return (
    <PaneCard
      title="Plan"
      eyebrow={`Living doc · ${nodeTitle}`}
      className="min-h-0 w-full self-start"
    >
      {!nodeId ? (
        <p className="text-muted-foreground">
          Select a node to anchor planning to this workspace.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Plan items are not stored yet. They will map to milestones and tasks
          for this node in a later iteration.
        </p>
      )}
    </PaneCard>
  );
}
