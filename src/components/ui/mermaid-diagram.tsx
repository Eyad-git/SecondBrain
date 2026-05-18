"use client";

import { useEffect, useId, useMemo, useState } from "react";

type MermaidDiagramProps = {
  chart: string;
  className?: string;
};

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const reactId = useId();
  const safeId = useMemo(() => `mermaid-${reactId.replace(/[:]/g, "-")}`, [reactId]);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: "default",
        });
        const result = await mermaid.render(`${safeId}-svg`, chart);
        if (!active) return;
        setSvg(result.svg);
        setError(null);
      } catch (e) {
        if (!active) return;
        setSvg(null);
        setError(e instanceof Error ? e.message : "Failed to render Mermaid.");
      }
    })();

    return () => {
      active = false;
    };
  }, [chart, safeId]);

  if (error) {
    return (
      <div className={className}>
        <p className="text-xs text-destructive">Diagram render failed: {error}</p>
        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
          {chart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground">Rendering diagram…</p>
      </div>
    );
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

