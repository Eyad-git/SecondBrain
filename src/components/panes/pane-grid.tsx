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
    <div className="flex min-h-0 flex-1 flex-col gap-y-4 px-7 py-5">
      <div className="grid shrink-0 grid-cols-2 items-start gap-5">
        <div className="min-h-0 min-w-0">
          <ContextPane sync={activeNodeSync} />
        </div>
        <div className="min-h-0 min-w-0">
          <QuestionsPane />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-5 [grid-template-rows:minmax(0,1fr)]">
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
