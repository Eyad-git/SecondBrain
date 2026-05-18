"use client";

import { Mention } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";
import type { Instance as TippyInstance } from "tippy.js";

import type { NodeMentionListProps } from "@/components/editor/node-mention-list";
import {
  NodeMentionList,
  type NodeMentionListHandle,
} from "@/components/editor/node-mention-list";
import { fetchNodesForMentions } from "@/lib/supabase/fetch-nodes-for-mentions";
import type { MentionNodeItem } from "@/types/mention";

const mentionBadgeClasses =
  "mention-node-tag inline-flex max-w-[min(22ch,100%)] shrink-0 items-center truncate rounded-full border border-primary/35 bg-secondary px-2 py-px text-[0.72rem] font-semibold tracking-tight text-secondary-foreground shadow-xs";

/** TipTap Mention + @ trigger; items load from Supabase `nodes` (RLS-aware). */
export function createNodeMentionExtension() {
  return Mention.configure({
    deleteTriggerWithBackspace: false,
    HTMLAttributes: {
      class: mentionBadgeClasses,
    },
    suggestion: {
      char: "@",
      items: async ({ query }: { query: string }) =>
        fetchNodesForMentions(query),
      render: () => {
        let component:
          | ReactRenderer<NodeMentionListHandle, NodeMentionListProps>
          | undefined;
        let popup: TippyInstance | undefined;

        return {
          onStart: (props) => {
            component = new ReactRenderer(NodeMentionList, {
              editor: props.editor,
              props: {
                items: props.items,
                command: (item: MentionNodeItem) => {
                  props.command({
                    id: item.id,
                    label: item.label,
                  });
                },
              },
            });

            if (!props.clientRect) {
              component.destroy();
              component = undefined;
              return;
            }

            const fallbackRect = () => new DOMRect(0, 0, 0, 0);

            popup = tippy(document.body, {
              appendTo: () => document.body,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
              arrow: false,
              maxWidth: 320,
              getReferenceClientRect: () =>
                props.clientRect?.() ?? fallbackRect(),
              content: component.element,
            });

            popup.show();
          },

          onUpdate(props) {
            component?.updateProps({
              items: props.items,
              command: (item: MentionNodeItem) => {
                props.command({
                  id: item.id,
                  label: item.label,
                });
              },
            });
            popup?.setProps({
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
            });
          },

          onKeyDown(props) {
            if (props.event.key === "Escape") {
              props.event.preventDefault();
              popup?.destroy();
              component?.destroy();
              popup = undefined;
              component = undefined;
              return true;
            }
            return !!component?.ref?.onKeyDown(props.event);
          },

          onExit() {
            popup?.destroy();
            component?.destroy();
            popup = undefined;
            component = undefined;
          },
        };
      },
    },
  });
}
