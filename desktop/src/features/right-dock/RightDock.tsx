import type * as React from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { MESSAGE_MARKDOWN_CLASS } from "@/shared/ui/mentionChip";
import {
  closeRightDock,
  useRightDock,
  type RightDockBenchPayload,
  type RightDockBrowserPayload,
  type RightDockPayload,
} from "@/features/right-dock/rightDockStore";

// The Activity panel stays a bare frame in Phase 2 territory — it exists so the
// dock has a real tenant while nothing else is open. Phase 3 fills the bench
// tenant with real viewers; the browser tenant gets its Tauri WebviewWindow in
// a later phase.
function ActivityPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        Agent activity and the embedded browser will land here as they come
        online. Open a markdown, HTML, or image artifact to see the bench view.
      </p>
    </div>
  );
}

// The remark stack matches the message-timeline defaults so a document opened
// here reads the same as one embedded in chat: GFM tables/tasklists plus
// line-break preservation. React-markdown 10 already escapes raw HTML by
// default (skipHtml behavior for anything outside the allowed schema), so
// arbitrary agent-authored markdown cannot inject <script>.
const BENCH_REMARK_PLUGINS = [remarkGfm, remarkBreaks];

function MarkdownBenchPanel({ source }: { source: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
      <div className={cn(MESSAGE_MARKDOWN_CLASS, "max-w-none")}>
        <ReactMarkdown remarkPlugins={BENCH_REMARK_PLUGINS}>
          {source}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ImageBenchPanel({
  source,
  label,
}: {
  source: string;
  label?: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/40 p-4">
      <img
        alt={label ?? "Artifact preview"}
        className="max-h-full max-w-full object-contain"
        src={source}
      />
    </div>
  );
}

// HTML preview is rendered inside a sandbox that DENIES same-origin so scripts
// in the artifact cannot reach cookies, localStorage, or the parent app; it
// also forbids top-level navigation and popup escape hatches. This is the
// single strongest defense against agent-authored HTML — if you weaken these
// flags, expect a Nostr-key exfil path to open up.
const HTML_SANDBOX = "allow-scripts";

function HtmlBenchPanel({
  source,
  label,
}: {
  source: string;
  label?: string | null;
}) {
  return (
    <iframe
      className="min-h-0 flex-1 border-0 bg-background"
      referrerPolicy="no-referrer"
      sandbox={HTML_SANDBOX}
      srcDoc={source}
      title={label ?? "Artifact preview"}
    />
  );
}

function BenchPanel({ payload }: { payload: RightDockBenchPayload }) {
  if (payload.kind === "markdown") {
    return <MarkdownBenchPanel source={payload.source} />;
  }
  if (payload.kind === "image") {
    return <ImageBenchPanel label={payload.label} source={payload.source} />;
  }
  return <HtmlBenchPanel label={payload.label} source={payload.source} />;
}

function BrowserPanel(_: { payload: RightDockBrowserPayload }) {
  // Phase 4 replaces this with a Tauri WebviewWindow child so localhost dev
  // servers and external sites do not have to widen the app-shell CSP.
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
      data-buzz-right-dock
      style={{ width: widthPx }}
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
