"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/lib/utils";
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
const MOBILE_PANES = ["context", "ask", "questions", "plan"] as const;

type MobilePaneId = (typeof MOBILE_PANES)[number];

function clampRowSplit(value: number): number {
  return Math.min(MAX_TOP_PERCENT, Math.max(MIN_TOP_PERCENT, value));
}

export function PaneGrid() {
  const activeNodeSync = useActiveNodeSync();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [topPercent, setTopPercent] = useState(50);
  const [mobilePane, setMobilePane] = useState<MobilePaneId>("context");
  const [isDesktop, setIsDesktop] = useState(false);

  const mobileTabs = useMemo(
    () => [
      { id: "context" as const, label: "Context" },
      { id: "ask" as const, label: "Ask" },
      { id: "questions" as const, label: "Questions" },
      { id: "plan" as const, label: "Plan" },
    ],
    []
  );

  useEffect(() => {
    try {
      const raw = Number(window.localStorage.getItem(ROW_SPLIT_KEY));
      if (!Number.isFinite(raw)) return;
      const next = clampRowSplit(raw);
      setTopPercent(next);
    } catch {}
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const hoverNoneQuery = window.matchMedia("(hover: none)");
    const sync = () => {
      const forceMobile = coarseQuery.matches && hoverNoneQuery.matches;
      setIsDesktop(query.matches && !forceMobile);
    };
    sync();
    query.addEventListener("change", sync);
    coarseQuery.addEventListener("change", sync);
    hoverNoneQuery.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
      coarseQuery.removeEventListener("change", sync);
      hoverNoneQuery.removeEventListener("change", sync);
    };
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
      className={cn(
        "grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 py-4",
        isDesktop ? "grid-cols-2 gap-5 px-7 py-5 pb-5" : "pb-24"
      )}
      style={
        isDesktop
          ? {
              gridTemplateRows: `minmax(14rem, ${topPercent}%) 0.75rem minmax(14rem, ${100 - topPercent}%)`,
            }
          : undefined
      }
    >
      <div
        className={cn(
          "min-h-0 min-w-0",
          !isDesktop && mobilePane !== "context" && "hidden",
          mobilePane === "context" && "flex-1"
        )}
      >
        <ContextPane sync={activeNodeSync} />
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0",
          !isDesktop && mobilePane !== "questions" && "hidden",
          mobilePane === "questions" && "flex-1"
        )}
      >
        <QuestionsPane />
      </div>
      <div className={cn("col-span-2 -mx-1 items-center gap-2", isDesktop ? "flex" : "hidden")}>
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
      <div
        className={cn(
          "min-h-0 min-w-0",
          !isDesktop && mobilePane !== "ask" && "hidden",
          mobilePane === "ask" && "flex-1"
        )}
      >
        <AskPane />
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0",
          !isDesktop && mobilePane !== "plan" && "hidden",
          mobilePane === "plan" && "flex-1"
        )}
      >
        <PlanPane />
      </div>
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-2 backdrop-blur",
          isDesktop && "hidden"
        )}
      >
        <ul className="grid grid-cols-4 gap-1">
          {mobileTabs.map((tab) => {
            const active = mobilePane === tab.id;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setMobilePane(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "w-full rounded-md px-2 py-2 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
