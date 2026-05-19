"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useActiveNodeSync } from "@/hooks/use-active-node-sync";

import {
  AskPane,
  ContextPane,
  PlanPane,
  QuestionsPane,
} from "@/components/panes/dashboard-panes";

const ROW_SPLIT_KEY = "sb.dashboard.rowSplit";
const MIN_TOP_PERCENT = 28;
const MAX_TOP_PERCENT = 72;

function clampRowSplit(value: number): number {
  return Math.min(MAX_TOP_PERCENT, Math.max(MIN_TOP_PERCENT, value));
}

export function PaneGrid() {
  const activeNodeSync = useActiveNodeSync();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [topPercent, setTopPercent] = useState(50);

  useEffect(() => {
    try {
      const raw = Number(window.localStorage.getItem(ROW_SPLIT_KEY));
      if (!Number.isFinite(raw)) return;
      const next = clampRowSplit(raw);
      setTopPercent(next);
    } catch {}
  }, []);

  const persistSplit = useCallback((value: number) => {
    try {
      window.localStorage.setItem(ROW_SPLIT_KEY, String(value));
    } catch {
      /* ignore */
    }
  }, []);

  const updateFromClientY = useCallback(
    (clientY: number) => {
      const host = containerRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const next = ((clientY - rect.top) / rect.height) * 100;
      const clamped = clampRowSplit(next);
      setTopPercent(clamped);
      persistSplit(clamped);
    },
    [persistSplit]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current) return;
      updateFromClientY(event.clientY);
    },
    [updateFromClientY]
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    window.removeEventListener("pointermove", onPointerMove);
  }, [onPointerMove]);

  const onDividerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [onPointerMove, onPointerUp]
  );

  const resetSplit = useCallback(() => {
    const baseline = 50;
    setTopPercent(baseline);
    persistSplit(baseline);
  }, [persistSplit]);

  const onDividerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key.toLowerCase() !== "r") return;
      event.preventDefault();
      resetSplit();
    },
    [resetSplit]
  );

  return (
    <div
      ref={containerRef}
      className="grid min-h-0 flex-1 grid-cols-2 gap-5 px-7 py-5"
      style={{
        gridTemplateRows: `minmax(14rem, ${topPercent}%) 0.75rem minmax(14rem, ${100 - topPercent}%)`,
      }}
    >
      <div className="min-h-0 min-w-0">
        <ContextPane sync={activeNodeSync} />
      </div>
      <div className="min-h-0 min-w-0">
        <QuestionsPane />
      </div>
      <div className="col-span-2 -mx-1 flex items-center gap-2">
        <button
          type="button"
          aria-label="Resize top and bottom panes. Press R to reset layout."
          onPointerDown={onDividerPointerDown}
          onKeyDown={onDividerKeyDown}
          className="flex flex-1 cursor-row-resize items-center justify-center rounded-md py-0.5 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="h-1.5 w-18 rounded-full bg-border" />
        </button>
        <button
          type="button"
          onClick={resetSplit}
          className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Reset layout
        </button>
      </div>
      <div className="min-h-0 min-w-0">
        <AskPane />
      </div>
      <div className="min-h-0 min-w-0">
        <PlanPane />
      </div>
    </div>
  );
}
