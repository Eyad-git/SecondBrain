"use client";

import { History, MessageSquarePlus, Trash2 } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { ChatConfirmModal } from "@/components/chat/chat-confirm-modal";
import { ChatModalShell } from "@/components/chat/chat-modal-shell";
import type { ChatSession } from "@/lib/store/use-chat-sessions-store";
import { useChatSessionsStore } from "@/lib/store/use-chat-sessions-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatWhen(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(ts);
}

type Props = {
  ownerId: string;
  sessionReady?: boolean;
  anchorNodeId: string | null;
  activeSessionId: string | null;
  currentMessagesCount: number;
  busy?: boolean;
  namingInProgress?: boolean;
  onNewChat: () => void | Promise<void>;
  onSelectSession: (session: ChatSession) => void | Promise<void>;
};

export function ChatHistoryPanel({
  ownerId,
  sessionReady = true,
  anchorNodeId,
  activeSessionId,
  currentMessagesCount,
  busy = false,
  namingInProgress = false,
  onNewChat,
  onSelectSession,
}: Props) {
  const sessionsAll = useChatSessionsStore((s) => s.sessions);
  const removeSession = useChatSessionsStore((s) => s.removeSession);

  const sessions = useMemo(() => {
    if (!ownerId || !anchorNodeId) return [];
    return sessionsAll
      .filter(
        (s) => s.ownerId === ownerId && s.anchorNodeId === anchorNodeId
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessionsAll, ownerId, anchorNodeId]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const stashHistoryRef = useRef(false);
  const titleId = useId();

  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [switchTarget, setSwitchTarget] = useState<ChatSession | null>(null);

  function suspendHistoryForInnerModal() {
    stashHistoryRef.current = historyOpen;
    if (historyOpen) setHistoryOpen(false);
  }

  function resumeHistoryAfterInnerModalClosed() {
    if (stashHistoryRef.current) {
      setHistoryOpen(true);
      stashHistoryRef.current = false;
    }
  }

  const canInteract =
    Boolean(anchorNodeId) && Boolean(ownerId) && sessionReady && !busy;

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="default"
        className="shrink-0 gap-1"
        disabled={!canInteract || namingInProgress}
        onClick={() => void onNewChat()}
      >
        <MessageSquarePlus className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {namingInProgress ? "Naming…" : "New chat"}
        </span>
      </Button>

      <Button
        type="button"
        size="xs"
        variant="outline"
        className="shrink-0 gap-1"
        disabled={!canInteract}
        onClick={() => setHistoryOpen(true)}
      >
        <History className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">History</span>
        <span className="text-muted-foreground tabular-nums">
          ({sessions.length})
        </span>
      </Button>

      <ChatModalShell
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        labelledBy={titleId}
      >
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-4">
            <h3 id={titleId} className="text-base font-semibold">
              Chat history
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Past chats for this node are saved in your browser. Starting a new
              chat names the previous thread automatically.
            </p>
          </div>
          <div className="max-h-[min(360px,50vh)] min-h-[7rem] flex-1 overflow-y-auto px-3 py-3">
            {!sessionReady ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Loading session…
              </p>
            ) : !anchorNodeId ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                Select a graph node to view chat history.
              </p>
            ) : sessions.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                No saved chats yet. Send a message or start a new chat.
              </p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => {
                  const isActive = s.id === activeSessionId;
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "rounded-lg border px-3 py-2",
                        isActive
                          ? "border-primary/40 bg-primary/8"
                          : "border-border bg-muted/25"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          disabled={isActive || busy}
                          onClick={() => {
                            if (isActive) return;
                            if (currentMessagesCount > 0) {
                              suspendHistoryForInnerModal();
                              setSwitchTarget(s);
                            } else {
                              void onSelectSession(s);
                              setHistoryOpen(false);
                            }
                          }}
                        >
                          <p className="truncate text-sm font-medium text-foreground">
                            {s.title}
                          </p>
                          <p className="text-[0.72rem] text-muted-foreground">
                            {formatWhen(s.updatedAt)} · {s.messages.length}{" "}
                            messages
                            {isActive ? (
                              <span className="text-primary"> · active</span>
                            ) : null}
                          </p>
                        </button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          aria-label={`Delete ${s.title}`}
                          onClick={() => {
                            suspendHistoryForInnerModal();
                            setDeleteTarget(s);
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
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
              onClick={() => setHistoryOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              size="xs"
              variant="default"
              disabled={!canInteract || namingInProgress}
              onClick={() => {
                setHistoryOpen(false);
                void onNewChat();
              }}
            >
              New chat
            </Button>
          </div>
        </div>
      </ChatModalShell>

      <ChatConfirmModal
        open={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null);
          resumeHistoryAfterInnerModalClosed();
        }}
        title="Delete this chat?"
        description={`“${deleteTarget?.title ?? ""}” will be removed from history on this device.`}
        confirmLabel="Delete"
        destructive
        confirmDisabled={!deleteTarget}
        onConfirm={() => {
          if (deleteTarget) removeSession(deleteTarget.id);
        }}
      />

      <ChatConfirmModal
        open={switchTarget !== null}
        onClose={() => {
          setSwitchTarget(null);
          resumeHistoryAfterInnerModalClosed();
        }}
        title="Switch chat?"
        description={`Your current thread has ${currentMessagesCount} message(s). Switching to “${switchTarget?.title ?? ""}” will replace what you see in the pane.`}
        confirmLabel="Switch"
        confirmDisabled={!switchTarget}
        onConfirm={() => {
          if (switchTarget) {
            stashHistoryRef.current = false;
            void onSelectSession(switchTarget);
            setHistoryOpen(false);
          }
        }}
      />
    </>
  );
}
