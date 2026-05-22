"use client";

import type { UIMessage } from "ai";
import { Archive, Trash2 } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { ChatConfirmModal } from "@/components/chat/chat-confirm-modal";
import { ChatModalShell } from "@/components/chat/chat-modal-shell";
import type { ArchivedChatEntry } from "@/lib/store/use-chat-trash-store";
import { useChatTrashStore } from "@/lib/store/use-chat-trash-store";
import { Button } from "@/components/ui/button";

function previewSnippet(entry: ArchivedChatEntry): string {
  const firstUser = entry.messages.find((m) => m.role === "user");
  if (!firstUser?.parts?.length) return "(No user messages)";
  for (const part of firstUser.parts) {
    if (
      part.type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      const t = (part as { text: string }).text.trim();
      if (t) return t.length > 100 ? `${t.slice(0, 100)}…` : t;
    }
  }
  return "(No text)";
}

function formatDeleted(isoTs: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(isoTs);
}

type Props = {
  ownerId: string;
  sessionReady?: boolean;
  anchorNodeId: string | null;
  /** Current `useChat` session key (includes active chat id when set). */
  activeChatKey: string;
  currentMessagesCount: number;
  onRestoreMessages: (messages: UIMessage[]) => void;
};

export function ChatRecycleBinPanel({
  ownerId,
  sessionReady = true,
  anchorNodeId,
  activeChatKey,
  currentMessagesCount,
  onRestoreMessages,
}: Props) {
  const entriesAll = useChatTrashStore((s) => s.entries);
  const removeEntry = useChatTrashStore((s) => s.removeEntry);
  const purgeAllForOwner = useChatTrashStore((s) => s.purgeAllForOwner);

  const entries = useMemo(
    () => entriesAll.filter((e) => e.ownerId === ownerId),
    [entriesAll, ownerId]
  );

  const [binOpen, setBinOpen] = useState(false);
  const stashRecycleRef = useRef(false);

  /** Hide recycle chrome while nested confirm dialogs are modal (avoids ESC closing both). */
  function suspendRecycleForInnerModal() {
    stashRecycleRef.current = binOpen;
    if (binOpen) setBinOpen(false);
  }

  function resumeRecycleAfterInnerModalClosed() {
    if (stashRecycleRef.current) {
      setBinOpen(true);
      stashRecycleRef.current = false;
    }
  }

  const titleId = useId();

  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [eraseTarget, setEraseTarget] = useState<ArchivedChatEntry | null>(
    null
  );
  const [restoreTarget, setRestoreTarget] =
    useState<ArchivedChatEntry | null>(null);

  function applyRestore(entry: ArchivedChatEntry) {
    onRestoreMessages(
      JSON.parse(JSON.stringify(entry.messages)) as UIMessage[]
    );
    removeEntry(entry.id);
  }

  const canPurge = ownerId.length > 0 && sessionReady;

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="shrink-0 gap-1"
        onClick={() => setBinOpen(true)}
      >
        <Archive className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">Recycle bin</span>
        <span className="text-muted-foreground tabular-nums">
          ({entries.length})
        </span>
      </Button>

      <ChatModalShell open={binOpen} onClose={() => setBinOpen(false)} labelledBy={titleId}>
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-4">
            <h3 id={titleId} className="text-base font-semibold">
              Recycle bin
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Archived chats stay here until you restore or erase them permanently.
              Click the dimmed backdrop, press Escape, or use Close below. Restore only
              works while the same node tab is selected.
            </p>
          </div>
          <div className="max-h-[min(360px,50vh)] min-h-[7rem] flex-1 overflow-y-auto px-3 py-3">
            {!sessionReady ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Loading session…
              </p>
            ) : entries.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                Nothing in the recycle bin.
              </p>
            ) : (
              <ul className="space-y-3">
                {entries.map((e) => {
                  const canRestore = e.chatKey === activeChatKey;
                  return (
                    <li
                      key={e.id}
                      className="rounded-lg border border-border bg-muted/25 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {e.nodeTitleAtDelete}
                          </p>
                          <p className="text-[0.72rem] text-muted-foreground">
                            {formatDeleted(e.deletedAt)} ·{" "}
                            {e.messages.length} messages ·{" "}
                            <span className="tabular-nums">
                              {canRestore ? (
                                <span className="text-green-700 dark:text-green-400">
                                  ready to restore
                                </span>
                              ) : (
                                <span>open this node first</span>
                              )}
                            </span>
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        “{previewSnippet(e)}”
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          disabled={!canRestore}
                          onClick={() => {
                            if (currentMessagesCount > 0) {
                              suspendRecycleForInnerModal();
                              setRestoreTarget(e);
                            } else {
                              applyRestore(e);
                              setBinOpen(false);
                            }
                          }}
                        >
                          Restore
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => {
                            suspendRecycleForInnerModal();
                            setEraseTarget(e);
                          }}
                        >
                          <Trash2 className="size-3" aria-hidden />
                          Erase
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 justify-between gap-2 border-t border-border px-5 py-3">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => setBinOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              disabled={entries.length === 0 || !canPurge}
              onClick={() => {
                suspendRecycleForInnerModal();
                setPurgeAllOpen(true);
              }}
            >
              Empty recycle bin…
            </Button>
          </div>
        </div>
      </ChatModalShell>

      <ChatConfirmModal
        open={purgeAllOpen}
        onClose={() => {
          setPurgeAllOpen(false);
          resumeRecycleAfterInnerModalClosed();
        }}
        title="Erase every archived chat?"
        description="This clears your recycle bin for this account permanently. Confirm only if that is intentional."
        confirmLabel="Yes, erase all"
        destructive
        onConfirm={() => {
          if (canPurge) purgeAllForOwner(ownerId);
        }}
      />

      <ChatConfirmModal
        open={eraseTarget !== null}
        onClose={() => {
          setEraseTarget(null);
          resumeRecycleAfterInnerModalClosed();
        }}
        title="Erase archived chat permanently?"
        description={`You will not be able to recover “${eraseTarget?.nodeTitleAtDelete ?? ""}”. This only affects the archived copy.`}
        confirmLabel="Erase permanently"
        destructive
        confirmDisabled={!eraseTarget}
        onConfirm={() => {
          if (eraseTarget) removeEntry(eraseTarget.id);
        }}
      />

      <ChatConfirmModal
        open={restoreTarget !== null}
        onClose={() => {
          setRestoreTarget(null);
          resumeRecycleAfterInnerModalClosed();
        }}
        title="Restore and replace active chat?"
        description={`Your current pane has ${currentMessagesCount} message(s). Restoring archived “${restoreTarget?.nodeTitleAtDelete ?? ""}” will replace that conversation.`}
        confirmLabel="Restore anyway"
        destructive
        confirmDisabled={!restoreTarget}
        onConfirm={() => {
          if (restoreTarget) {
            stashRecycleRef.current = false;
            applyRestore(restoreTarget);
            setBinOpen(false);
          }
        }}
      />
    </>
  );
}
