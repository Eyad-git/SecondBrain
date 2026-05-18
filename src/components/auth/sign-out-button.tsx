"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut({ scope: "local" });
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
