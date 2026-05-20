"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { DashboardSidebar } from "@/components/sidebar/graph-tree-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const widthQuery = window.matchMedia("(min-width: 768px)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const hoverNoneQuery = window.matchMedia("(hover: none)");
    const sync = () => {
      const forceMobile = coarseQuery.matches && hoverNoneQuery.matches;
      const nextDesktop = widthQuery.matches && !forceMobile;
      setIsDesktop(nextDesktop);
    };
    sync();
    widthQuery.addEventListener("change", sync);
    coarseQuery.addEventListener("change", sync);
    hoverNoneQuery.addEventListener("change", sync);
    return () => {
      widthQuery.removeEventListener("change", sync);
      coarseQuery.removeEventListener("change", sync);
      hoverNoneQuery.removeEventListener("change", sync);
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      {isDesktop ? (
        <div className="flex shrink-0">
          <DashboardSidebar />
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      {!isDesktop ? (
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open graph sidebar"
          className="fixed top-3 left-3 z-30 rounded-md border border-border bg-background/90 p-2 text-foreground shadow-sm backdrop-blur"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      ) : null}
      {!isDesktop && mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close graph sidebar"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-black/45"
          />
          <div className="absolute inset-y-0 left-0 z-10 w-72 max-w-[88vw]">
            <DashboardSidebar
              className="h-full w-full"
              onNodeSelected={() => setMobileSidebarOpen(false)}
            />
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close graph sidebar panel"
              className="absolute top-3 right-3 rounded-md border border-sidebar-border bg-sidebar p-1.5 text-sidebar-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
