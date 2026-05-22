import { create } from "zustand";

import { pickDefaultSelectedId } from "@/lib/nodes/tree";
import type {
  NodeApiIntegration,
  NodeGooglePhotosItem,
  NodeRowSnapshot,
  NodeScrapedSite,
} from "@/types/nodes";

export type WorkspaceNodeStore = {
  selectedNodeId: string | null;
  googlePhotosAccessToken: string | null;
  setSelectedNodeId: (id: string | null) => void;
  setGooglePhotosAccessToken: (token: string | null) => void;
  nodesById: Record<string, NodeRowSnapshot>;
  integrationsByNodeId: Record<string, NodeApiIntegration[]>;
  scrapedSitesByNodeId: Record<string, NodeScrapedSite[]>;
  googlePhotosByNodeId: Record<string, NodeGooglePhotosItem[]>;
  setNodeIntegrations: (nodeId: string, integrations: NodeApiIntegration[]) => void;
  setNodeScrapedSites: (nodeId: string, sites: NodeScrapedSite[]) => void;
  setNodeGooglePhotos: (nodeId: string, items: NodeGooglePhotosItem[]) => void;
  syncNodesFromRows: (rows: NodeRowSnapshot[]) => void;
  /** Replace merged snapshot after a targeted fetch (fresh `core_summary`, onboarding, etc.). */
  mergeNodeSnapshot: (row: NodeRowSnapshot) => void;
  updateNodePatch: (
    nodeId: string,
    patch: Partial<
      Pick<
        NodeRowSnapshot,
        | "title"
        | "core_summary"
        | "system_prompt"
        | "status"
        | "onboarding_questions"
        | "onboarding_answers"
      >
    >
  ) => void;
  resetWorkspace: () => void;
};

export const useNodeStore = create<WorkspaceNodeStore>((set) => ({
  selectedNodeId: null,
  googlePhotosAccessToken: null,
  nodesById: {},
  integrationsByNodeId: {},
  scrapedSitesByNodeId: {},
  googlePhotosByNodeId: {},
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setGooglePhotosAccessToken: (token) => set({ googlePhotosAccessToken: token }),

  setNodeIntegrations: (nodeId, integrations) =>
    set((state) => ({
      integrationsByNodeId: {
        ...state.integrationsByNodeId,
        [nodeId]: integrations,
      },
    })),

  setNodeScrapedSites: (nodeId, sites) =>
    set((state) => ({
      scrapedSitesByNodeId: {
        ...state.scrapedSitesByNodeId,
        [nodeId]: sites,
      },
    })),

  setNodeGooglePhotos: (nodeId, items) =>
    set((state) => ({
      googlePhotosByNodeId: {
        ...state.googlePhotosByNodeId,
        [nodeId]: items,
      },
    })),

  mergeNodeSnapshot: (row) =>
    set((state) => ({
      nodesById: {
        ...state.nodesById,
        [row.id]: row,
      },
    })),

  syncNodesFromRows: (rows) =>
    set((state) => {
      const nodesById = Object.fromEntries(
        rows.map((r) => [r.id, r])
      ) as Record<string, NodeRowSnapshot>;

      let selected = state.selectedNodeId;
      if (!selected || !nodesById[selected]) {
        selected = pickDefaultSelectedId(rows);
      }

      return { nodesById, selectedNodeId: selected };
    }),

  updateNodePatch: (nodeId, patch) =>
    set((state) => {
      const prev = state.nodesById[nodeId];
      if (!prev) return state;
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: { ...prev, ...patch },
        },
      };
    }),

  resetWorkspace: () =>
    set({
      selectedNodeId: null,
      googlePhotosAccessToken: null,
      nodesById: {},
      integrationsByNodeId: {},
      scrapedSitesByNodeId: {},
      googlePhotosByNodeId: {},
    }),
}));

export function useSelectedNodeTitle(): string {
  const id = useNodeStore((s) => s.selectedNodeId);
  const title = useNodeStore((s) =>
    id ? s.nodesById[id]?.title : undefined
  );
  return title ?? (id ? "Untitled node" : "Select a node");
}
