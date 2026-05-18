"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import type { MentionNodeItem } from "@/types/mention";

export interface NodeMentionListProps {
  items: MentionNodeItem[];
  command: (item: MentionNodeItem) => void;
}

export type NodeMentionListHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const NodeMentionList = forwardRef<NodeMentionListHandle, NodeMentionListProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [command, items]
    );

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelected((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelected((i) =>
            items.length === 0 ? 0 : (i + items.length - 1) % items.length
          );
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          selectItem(selected);
          return true;
        }
        return false;
      },
    }));

    const emptyHint =
      items.length === 0
        ? "No nodes — sign in or add rows in nodes (RLS may hide results)."
        : null;

    return (
      <div
        role="listbox"
        aria-label="Mention nodes"
        className="min-w-[12rem] max-w-[20rem] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-md"
      >
        {emptyHint ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">{emptyHint}</p>
        ) : (
          items.map((item, index) => (
            <button
              key={`${item.id}-${item.label}`}
              type="button"
              role="option"
              aria-selected={selected === index}
              className={cn(
                "flex w-full cursor-default flex-col items-start rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors",
                selected === index
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/80"
              )}
              onClick={() => selectItem(index)}
            >
              <span className="font-medium leading-tight">{item.label}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                id {item.id.slice(0, 8)}…
              </span>
            </button>
          ))
        )}
      </div>
    );
  }
);

NodeMentionList.displayName = "NodeMentionList";
