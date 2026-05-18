"use client";

import type { ReactNode } from "react";

import { createPortal } from "react-dom";

import { useEffect } from "react";

import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  tier?: "main" | "confirm";
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  backdropClosable?: boolean;
  children: ReactNode;
};

/** Portal to `document.body` — avoids pane `overflow:hidden` clipping plus native `<dialog>` stacking bugs. */
export function ChatModalShell({
  open,
  onClose,
  tier = "main",
  className,
  labelledBy,
  describedBy,
  backdropClosable = true,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEscape);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEscape);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const z = tier === "confirm" ? "z-[220]" : "z-[200]";

  return createPortal(
    <div className={cn("fixed inset-0 isolate", z)} role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        tabIndex={-1}
        className={cn(
          "fixed inset-0 bg-black/50",
          backdropClosable ? "cursor-default" : "pointer-events-none"
        )}
        onClick={backdropClosable ? onClose : undefined}
      />
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className={cn(
            "pointer-events-auto flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg outline-none",
            className
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
