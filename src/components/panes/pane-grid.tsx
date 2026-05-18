"use client";

import { useActiveNodeSync } from "@/hooks/use-active-node-sync";

import {
  AskPane,
  ContextPane,
  PlanPane,
  QuestionsPane,
} from "@/components/panes/dashboard-panes";

export function PaneGrid() {
  const activeNodeSync = useActiveNodeSync();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-y-3 px-6 py-4">
      <div className="grid shrink-0 grid-cols-2 gap-x-4 items-start">
        <div className="min-h-0 min-w-0">
          <ContextPane sync={activeNodeSync} />
        </div>
        <div className="min-h-0 min-w-0">
          <QuestionsPane />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-4">
        <div className="flex min-h-0 min-w-0 flex-col">
          <AskPane />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <PlanPane />
        </div>
      </div>
    </div>
  );
}
