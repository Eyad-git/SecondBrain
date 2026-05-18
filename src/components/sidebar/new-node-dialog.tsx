"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useNodeStore } from "@/lib/store/use-node-store";
import type { NodeLevel } from "@/types/nodes";

const LEVELS: NodeLevel[] = ["account", "domain", "project", "task"];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Reload flat rows from DB and merge into workspace store. */
  onSuccess: () => Promise<void>;
  /** When set and “child of current” is checked, inserts under this row. */
  suggestedParentId: string | null;
};

export function NewNodeDialog({
  open,
  onClose,
  onSuccess,
  suggestedParentId,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<NodeLevel>("project");
  const [asChildOfCurrent, setAsChildOfCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const setSelectedNodeId = useNodeStore((s) => s.setSelectedNodeId);
  const updateNodePatch = useNodeStore((s) => s.updateNodePatch);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      setLocalError(null);
      setTitle("");
      setLevel("project");
      setAsChildOfCurrent(Boolean(suggestedParentId));
      d.showModal();
    } else {
      d.close();
    }
  }, [open, suggestedParentId]);

  async function submit() {
    setLocalError(null);
    const t = title.trim();
    if (t.length < 1) {
      setLocalError("Title is required.");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLocalError("You must be signed in.");
      return;
    }

    const parent_id =
      asChildOfCurrent && suggestedParentId ? suggestedParentId : null;

    setBusy(true);
    try {
      const { data: row, error: insErr } = await supabase
        .from("nodes")
        .insert({
          user_id: user.id,
          title: t,
          node_level: level,
          parent_id,
          status: "onboarding",
        })
        .select(
          "id,title,node_level,parent_id,core_summary,system_prompt,status,onboarding_questions,onboarding_answers,archived_at"
        )
        .single();

      if (insErr) throw insErr;
      if (!row) throw new Error("Insert returned no row");

      const newId = row.id as string;

      setSelectedNodeId(newId);

      const architectRes = await fetch("/api/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: newId }),
      });

      if (!architectRes.ok) {
        const errJson = await architectRes.json().catch(() => ({}));
        const msg =
          (errJson && typeof errJson.error === "string"
            ? errJson.error
            : null) ?? `HTTP ${architectRes.status}`;
        await onSuccess();
        setLocalError(
          `Node created, but Architect did not finish (${msg}). You can reload or try again later.`
        );
        return;
      }

      const architect = (await architectRes.json()) as {
        system_prompt: string;
        onboarding_questions: string[];
      };

      const questions = architect.onboarding_questions;
      const onboardingSlice =
        Array.isArray(questions) && questions.length > 0
          ? questions.slice(0, 3).filter((q) => typeof q === "string" && q.trim())
          : [];

      const { error: upErr } = await supabase
        .from("nodes")
        .update({
          system_prompt: architect.system_prompt,
          onboarding_questions: onboardingSlice.length > 0 ? onboardingSlice : null,
        })
        .eq("id", newId);

      if (upErr) {
        console.error(
          "[NewNodeDialog] Failed to persist architect outputs:",
          upErr.message
        );
      } else {
        updateNodePatch(newId, {
          system_prompt: architect.system_prompt,
          onboarding_questions:
            onboardingSlice.length > 0 ? onboardingSlice : null,
        });
      }

      await onSuccess();
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not create node");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="backdrop:bg-black/45 fixed top-1/2 left-1/2 z-50 w-[min(100vw-24px,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-0 text-foreground shadow-lg"
      onClose={onClose}
    >
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold">New node</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Inserts under your user in Supabase and runs Architect for onboarding.
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="space-y-1">
          <label htmlFor="nn-title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="nn-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
            placeholder="e.g. LinkedIn presence"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="nn-level" className="text-sm font-medium">
            Level
          </label>
          <select
            id="nn-level"
            value={level}
            onChange={(e) => setLevel(e.target.value as NodeLevel)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>
        </div>
        {suggestedParentId ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={asChildOfCurrent}
              onChange={(e) => setAsChildOfCurrent(e.target.checked)}
            />
            Child of currently selected node
          </label>
        ) : null}
        {localError ? (
          <p className="text-sm text-destructive">{localError}</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            ref.current?.close();
            onClose();
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create & run Architect"}
        </Button>
      </div>
    </dialog>
  );
}
