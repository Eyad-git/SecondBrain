"use client";

import {
  useMemo,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useEffect,
} from "react";

import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";

import "tippy.js/dist/tippy.css";

import { createNodeMentionExtension } from "@/components/editor/node-mention-extension";
import { serializeAskDocument } from "@/lib/editor/serialize-ask-document";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const editorShell =
  "ask-editor-shell min-h-[7rem] max-h-[38vh] w-full rounded-lg border border-border bg-muted/20 px-1";

export type AskEditorHandle = {
  clear: () => void;
  serializeWireText: () => string;
};

export type AskEditorProps = {
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onSubmit?: () => void | Promise<void>;
  submitDisabled?: boolean;
};

export const AskEditor = forwardRef<AskEditorHandle, AskEditorProps>(
  (
    {
      placeholder,
      className,
      disabled,
      onSubmit,
      submitDisabled,
    }: AskEditorProps,
    ref
  ) => {
    const extensions = useMemo(
      () => [
        StarterKit.configure({}),
        Placeholder.configure({
          placeholder:
            placeholder ??
            "Compose an ask… Type @ to fetch nodes from Supabase.",
        }),
        createNodeMentionExtension(),
      ],
      [placeholder]
    );

    const editor = useEditor(
      {
        extensions,
        editable: true,
        immediatelyRender: false,
        editorProps: {
          attributes: {
            class:
              "min-h-[6.75rem] max-h-[calc(38vh-2.75rem)] w-full overflow-y-auto px-3 py-2 text-[0.9rem] leading-relaxed text-foreground [&_p]:my-0",
          },
          handleKeyDown(_view, ev) {
            if (disabled || submitDisabled) return false;
            if (ev.key === "Enter" && !ev.shiftKey && (ev.ctrlKey || ev.metaKey)) {
              ev.preventDefault();
              void onSubmit?.();
              return true;
            }
            return false;
          },
        },
        content: "",
      },
      [extensions, disabled, submitDisabled, onSubmit]
    );

    useEffect(() => {
      editor?.setEditable(!disabled);
    }, [editor, disabled]);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => editor?.commands.clearContent(true),
        serializeWireText: () => serializeAskDocument(editor),
      }),
      [editor]
    );

    const handleSubmit = useCallback(async () => {
      if (!onSubmit || disabled || submitDisabled) return;
      await onSubmit();
    }, [disabled, onSubmit, submitDisabled]);

    return (
      <div className={cn(editorShell, className)}>
        <EditorContent editor={editor} className="[&_.ProseMirror]:outline-none" />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 px-3 py-2">
          <p className="text-muted-foreground text-[11px]">
            Mention menu pulls your <code className="text-foreground">nodes</code>{" "}
            through RLS.{" "}
            <span className="text-muted-foreground/90">
              Send: Ctrl/Cmd + Enter.
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            disabled={disabled || submitDisabled || !editor}
            onClick={handleSubmit}
          >
            Send
          </Button>
        </div>
      </div>
    );
  }
);

AskEditor.displayName = "AskEditor";
