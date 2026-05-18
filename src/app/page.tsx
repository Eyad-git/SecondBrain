import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Second Brain
            </p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Welcome to SecondBrain
            </h1>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              Your AI workspace for context, questions, and chat—anchored to the
              graph of nodes you care about.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "min-w-[10rem] sm:min-w-[11rem]"
              )}
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "min-w-[10rem] sm:min-w-[11rem]"
              )}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
