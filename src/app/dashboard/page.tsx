import Link from "next/link";

import { PaneGrid } from "@/components/panes/pane-grid";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Workspace
          </p>
          <p className="text-sm font-medium text-foreground">
            Dashboard
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SignOutButton />
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Home
          </Link>
        </div>
      </header>
      <PaneGrid />
    </div>
  );
}
