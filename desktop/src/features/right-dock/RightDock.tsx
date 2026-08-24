import type * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import {
  closeRightDock,
  useRightDock,
  type RightDockPayload,
} from "@/features/right-dock/rightDockStore";

// The Phase-2 Activity panel is intentionally a bare frame — it exists so the
// dock has a real tenant to render while the shared layout region ships, and
// Phase 3 replaces the placeholder with the bench viewers. This is the entire
// visible surface until then; keep it small on purpose.
function ActivityPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        Agent activity, artifact previews, and the embedded browser will land
        here as they come online. This panel is the shared surface for all of
        them, so nothing has to open in another window.
      </p>
    </div>
  );
}

function BenchPanel(_: {
  payload: Extract<RightDockPayload, { kind: "bench" }>["payload"];
}) {
  // Phase 3 wires the actual markdown/image/html viewers into this branch.
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
      Bench viewer arrives in the next phase.
    </div>
  );
}

function BrowserPanel(_: {
  payload: Extract<RightDockPayload, { kind: "browser" }>["payload"];
}) {
  // Phase 4 replaces this with a Tauri WebviewWindow child.
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
      Embedded browser arrives in a later phase.
    </div>
  );
}

function panelTitle(active: RightDockPayload): string {
  if (active.kind === "activity") return "Activity";
  if (active.kind === "bench") return active.payload.label ?? "Bench";
  return active.payload.label ?? "Browser";
}

function panelBody(active: RightDockPayload): React.ReactNode {
  if (active.kind === "activity") return <ActivityPanel />;
  if (active.kind === "bench") return <BenchPanel payload={active.payload} />;
  return <BrowserPanel payload={active.payload} />;
}

export function RightDock() {
  const { open, active, widthPx } = useRightDock();

  if (!open || active === null) return null;

  return (
    <aside
      aria-label="Right dock"
      className={cn(
        "flex min-h-0 shrink-0 flex-col border-l border-border/60 bg-background",
      )}
      // Width is driven by the store snapshot so a future resize handle can
      // update it without touching this component's markup.
      style={{ width: widthPx }}
      data-buzz-right-dock
    >
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <span className="min-w-0 truncate px-1 text-xs font-medium text-muted-foreground">
          {panelTitle(active)}
        </span>
        <Button
          aria-label="Close right dock"
          className="h-7 w-7"
          onClick={closeRightDock}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {panelBody(active)}
      </div>
    </aside>
  );
}
