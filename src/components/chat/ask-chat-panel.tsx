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
import { useSelectedNodeTitle } from "@/lib/store/use-node-store";
import { cn } from "@/lib/utils";
import { extractMentionedNodeIds } from "@/lib/chat/mention-extract";

type Props = {
  anchorNodeId: string | null;
};

type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "mermaid"; value: string };

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

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [confirmMoveToBinOpen, setConfirmMoveToBinOpen] = useState(false);

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
            },
          };
        },
      }),
    [anchorNodeId]
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

  const handleSubmit = useCallback(async () => {
    if (!anchorNodeId || busy) return;
    const text = editorRef.current?.serializeWireText().trim() ?? "";
    if (!text) return;
    await sendMessage({ text });
    editorRef.current?.clear();
  }, [anchorNodeId, busy, sendMessage]);

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
          ) : null}
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Streams from <code className="text-foreground">/api/chat</code> with your
          Supabase graph block. Recycle bin saves in this browser until you erase
          archived rows.
        </p>
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
            disabled={!anchorNodeId || busy}
            onSubmit={handleSubmit}
            submitDisabled={busy}
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
          clearError?.();
        }}
      />

    </div>
  );
}
