import type { UIMessage } from "ai";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { randomId } from "@/lib/random-id";

export type ChatSession = {
  id: string;
  anchorNodeId: string;
  ownerId: string;
  title: string;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;
};

function cloneUiMessages(messages: UIMessage[]): UIMessage[] {
  return JSON.parse(JSON.stringify(messages)) as UIMessage[];
}

function activeKey(ownerId: string, anchorNodeId: string): string {
  return `${ownerId}:${anchorNodeId}`;
}

type ChatSessionsStore = {
  sessions: ChatSession[];
  activeSessionByKey: Record<string, string>;
  listForNode: (ownerId: string, anchorNodeId: string) => ChatSession[];
  getActiveSessionId: (
    ownerId: string,
    anchorNodeId: string
  ) => string | null;
  getSession: (id: string) => ChatSession | undefined;
  ensureActiveSession: (payload: {
    ownerId: string;
    anchorNodeId: string;
    initialMessages?: UIMessage[];
  }) => string;
  setActiveSession: (
    ownerId: string,
    anchorNodeId: string,
    sessionId: string
  ) => void;
  updateSessionMessages: (sessionId: string, messages: UIMessage[]) => void;
  renameSession: (sessionId: string, title: string) => void;
  /** Finalize a session (title + messages) and start a fresh active session. */
  archiveAndStartNew: (payload: {
    ownerId: string;
    anchorNodeId: string;
    sessionId: string;
    title: string;
    messages: UIMessage[];
  }) => string;
  removeSession: (sessionId: string) => void;
};

export const useChatSessionsStore = create<ChatSessionsStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionByKey: {},

      listForNode: (ownerId, anchorNodeId) =>
        get()
          .sessions.filter(
            (s) => s.ownerId === ownerId && s.anchorNodeId === anchorNodeId
          )
          .sort((a, b) => b.updatedAt - a.updatedAt),

      getActiveSessionId: (ownerId, anchorNodeId) => {
        const key = activeKey(ownerId, anchorNodeId);
        return get().activeSessionByKey[key] ?? null;
      },

      getSession: (id) => get().sessions.find((s) => s.id === id),

      ensureActiveSession: ({
        ownerId,
        anchorNodeId,
        initialMessages = [],
      }) => {
        const key = activeKey(ownerId, anchorNodeId);
        const existingId = get().activeSessionByKey[key];
        if (existingId) {
          const found = get().sessions.find((s) => s.id === existingId);
          if (
            found &&
            found.ownerId === ownerId &&
            found.anchorNodeId === anchorNodeId
          ) {
            return existingId;
          }
        }

        const id = randomId();
        const now = Date.now();
        const session: ChatSession = {
          id,
          anchorNodeId,
          ownerId,
          title: "New chat",
          messages: cloneUiMessages(initialMessages),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionByKey: { ...s.activeSessionByKey, [key]: id },
        }));
        return id;
      },

      setActiveSession: (ownerId, anchorNodeId, sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (
          !session ||
          session.ownerId !== ownerId ||
          session.anchorNodeId !== anchorNodeId
        ) {
          return;
        }
        const key = activeKey(ownerId, anchorNodeId);
        set((s) => ({
          activeSessionByKey: { ...s.activeSessionByKey, [key]: sessionId },
        }));
      },

      updateSessionMessages: (sessionId, messages) => {
        const cloned = cloneUiMessages(messages);
        const now = Date.now();
        set((s) => ({
          sessions: s.sessions.map((row) =>
            row.id === sessionId
              ? { ...row, messages: cloned, updatedAt: now }
              : row
          ),
        }));
      },

      renameSession: (sessionId, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        set((s) => ({
          sessions: s.sessions.map((row) =>
            row.id === sessionId
              ? { ...row, title: trimmed, updatedAt: Date.now() }
              : row
          ),
        }));
      },

      archiveAndStartNew: ({
        ownerId,
        anchorNodeId,
        sessionId,
        title,
        messages,
      }) => {
        const cloned = cloneUiMessages(messages);
        const now = Date.now();
        const newId = randomId();
        const key = activeKey(ownerId, anchorNodeId);

        set((s) => {
          const hasSession = s.sessions.some((row) => row.id === sessionId);
          const sessions = hasSession
            ? s.sessions.map((row) =>
                row.id === sessionId
                  ? {
                      ...row,
                      title: title.trim() || row.title,
                      messages: cloned,
                      updatedAt: now,
                    }
                  : row
              )
            : [
                {
                  id: sessionId,
                  anchorNodeId,
                  ownerId,
                  title: title.trim() || "Chat",
                  messages: cloned,
                  createdAt: now,
                  updatedAt: now,
                },
                ...s.sessions,
              ];

          const fresh: ChatSession = {
            id: newId,
            anchorNodeId,
            ownerId,
            title: "New chat",
            messages: [],
            createdAt: now,
            updatedAt: now,
          };

          return {
            sessions: [fresh, ...sessions],
            activeSessionByKey: { ...s.activeSessionByKey, [key]: newId },
          };
        });

        return newId;
      },

      removeSession: (sessionId) => {
        set((s) => {
          const removed = s.sessions.find((row) => row.id === sessionId);
          const sessions = s.sessions.filter((row) => row.id !== sessionId);
          const activeSessionByKey = { ...s.activeSessionByKey };

          if (removed) {
            const key = activeKey(removed.ownerId, removed.anchorNodeId);
            if (activeSessionByKey[key] === sessionId) {
              delete activeSessionByKey[key];
            }
          }

          return { sessions, activeSessionByKey };
        });
      },
    }),
    {
      name: "secondbrain-chat-sessions-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sessions: s.sessions,
        activeSessionByKey: s.activeSessionByKey,
      }),
    }
  )
);

export function chatSessionKey(
  anchorNodeId: string,
  sessionId: string
): string {
  return `ask-${anchorNodeId}-${sessionId}`;
}
