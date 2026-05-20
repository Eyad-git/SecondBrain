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
  "ask-editor-shell min-h-[8.5rem] w-full rounded-lg border border-border/80 bg-background/70 px-1";

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
  embedded?: boolean;
};

export const AskEditor = forwardRef<AskEditorHandle, AskEditorProps>(
  (
    {
      placeholder,
      className,
      disabled,
      onSubmit,
      submitDisabled,
      embedded,
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
              "min-h-[7.25rem] max-h-[19rem] w-full overflow-y-auto px-4 py-3 text-[0.97rem] leading-relaxed text-foreground [&_p]:my-0",
          },
          handleKeyDown(_view, ev) {
            if (disabled || submitDisabled) return false;
            if (ev.key === "Enter" && !ev.shiftKey) {
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
      <div
        className={cn(
          editorShell,
          embedded &&
            "min-h-[7.5rem] rounded-none border-0 bg-transparent px-0 shadow-none",
          className
        )}
      >
        <EditorContent editor={editor} className="[&_.ProseMirror]:outline-none" />
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 border-t border-border/80 px-3 py-2.5",
            embedded && "px-4"
          )}
        >
          <p className="text-muted-foreground text-xs">
            Mention menu pulls your <code className="text-foreground">nodes</code>{" "}
            through RLS.{" "}
            <span className="text-muted-foreground/90">
              Send: Enter (Shift+Enter for new line).
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
