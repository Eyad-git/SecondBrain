import type { UIMessage } from "ai";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ArchivedChatEntry = {
  id: string;
  /** Matches `useChat` id (`ask-{nodeId}` or `ask-none`). */
  chatKey: string;
  anchorNodeId: string | null;
  nodeTitleAtDelete: string;
  /** Isolate trash per logged-in Supabase user. */
  ownerId: string;
  deletedAt: number;
  messages: UIMessage[];
};

function cloneUiMessages(messages: UIMessage[]): UIMessage[] {
  return JSON.parse(JSON.stringify(messages)) as UIMessage[];
}

type ChatTrashStore = {
  entries: ArchivedChatEntry[];
  /** Saves a frozen copy into the recycle bin. Returns archived row id. */
  archiveConversation: (payload: {
    chatKey: string;
    anchorNodeId: string | null;
    nodeTitleAtDelete: string;
    ownerId: string;
    messages: UIMessage[];
  }) => string;
  removeEntry: (id: string) => void;
  /** Permanently remove every archived chat for one account. */
  purgeAllForOwner: (ownerId: string) => void;
};

export const useChatTrashStore = create<ChatTrashStore>()(
  persist(
    (set) => ({
      entries: [],

      archiveConversation: ({
        chatKey,
        anchorNodeId,
        nodeTitleAtDelete,
        ownerId,
        messages,
      }) => {
        const id = crypto.randomUUID();
        const archived: ArchivedChatEntry = {
          id,
          chatKey,
          anchorNodeId,
          nodeTitleAtDelete,
          ownerId,
          deletedAt: Date.now(),
          messages: cloneUiMessages(messages),
        };
        set((s) => ({ entries: [archived, ...s.entries] }));
        return id;
      },

      removeEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      purgeAllForOwner: (ownerId) =>
        set((s) => ({
          entries: s.entries.filter((e) => e.ownerId !== ownerId),
        })),
    }),
    {
      name: "secondbrain-chat-recycle-bin-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ entries: s.entries }),
    }
  )
);

export function chatKeyFromAnchor(nodeId: string | null): string {
  return nodeId ? `ask-${nodeId}` : "ask-none";
}
