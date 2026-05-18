"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ChatModalShell } from "@/components/chat/chat-modal-shell";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ChatConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  confirmDisabled,
  onConfirm,
}: Props) {
  const headingId = useId();
  const descId = useId();
  const busyRef = useRef(false);

  useEffect(() => {
    if (open) busyRef.current = false;
  }, [open]);

  const [busy, setBusy] = useState(false);

  return (
    <ChatModalShell
      open={open}
      onClose={() => {
        if (!busyRef.current) onClose();
      }}
      tier="confirm"
      labelledBy={headingId}
      describedBy={descId}
      backdropClosable={!busy}
    >
      <div className="flex max-h-[min(80vh,460px)] min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h3 id={headingId} className="text-base font-semibold">
            {title}
          </h3>
          <p
            id={descId}
            className="mt-1 text-sm leading-relaxed text-muted-foreground"
          >
            {description}
          </p>
        </div>
        <div className="flex shrink-0 justify-end gap-2 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy || (confirmDisabled ?? false)}
            onClick={async () => {
              if (busyRef.current) return;
              busyRef.current = true;
              setBusy(true);
              try {
                await Promise.resolve(onConfirm());
                onClose();
              } finally {
                busyRef.current = false;
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ChatModalShell>
  );
}
