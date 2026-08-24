import * as React from "react";

// The right dock is a shared layout region hosted by ContentSurface. Content
// panels register a `kind` and payload here; a single <RightDock /> reads the
// snapshot and swaps in the matching viewer. Terminal placement is *not* owned
// by this store — the terminal keeps its own store (features/terminal/
// terminalPanelStore) so the two regions can compose independently once the
// terminal grows a "docked-right" mode.
export type RightDockKind = "activity" | "bench" | "browser";

export type RightDockBenchPayload = {
  kind: "markdown" | "image" | "html";
  /**
   * For markdown/html: the raw text to render.
   * For image: an absolute source URL, data URI, or Tauri file URL.
   */
  source: string;
  /** Human-readable label shown in the dock header. */
  label?: string | null;
};

export type RightDockBrowserPayload = {
  url: string;
  label?: string | null;
};

// Union kept intentionally narrow: adding new kinds means adding a new payload
// shape here and a new branch in <RightDock />. This is the whole contract.
export type RightDockPayload =
  | { kind: "activity" }
  | ({ kind: "bench" } & { payload: RightDockBenchPayload })
  | ({ kind: "browser" } & { payload: RightDockBrowserPayload });

type Snapshot = {
  open: boolean;
  active: RightDockPayload | null;
  /**
   * Persisted width in px. The dock uses this as its resting width when open;
   * a resize handle can update it in a later phase without needing to touch
   * the store contract.
   */
  widthPx: number;
};

const DEFAULT_WIDTH_PX = 380;
const MIN_WIDTH_PX = 260;
const MAX_WIDTH_PX = 720;

let snapshot: Snapshot = {
  open: false,
  active: null,
  widthPx: DEFAULT_WIDTH_PX,
};
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function openRightDock(next: RightDockPayload) {
  publish({ ...snapshot, open: true, active: next });
}

export function closeRightDock() {
  if (!snapshot.open && snapshot.active === null) return;
  publish({ ...snapshot, open: false });
}

export function toggleRightDock(next?: RightDockPayload) {
  if (snapshot.open) {
    closeRightDock();
    return;
  }
  openRightDock(next ?? { kind: "activity" });
}

export function setRightDockWidth(px: number) {
  const clamped = Math.min(
    MAX_WIDTH_PX,
    Math.max(MIN_WIDTH_PX, Math.round(px)),
  );
  if (clamped === snapshot.widthPx) return;
  publish({ ...snapshot, widthPx: clamped });
}

export function useRightDock() {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}

export function resetRightDockForTests() {
  snapshot = { open: false, active: null, widthPx: DEFAULT_WIDTH_PX };
}

export function getRightDockSnapshotForTests() {
  return snapshot;
}

export const RIGHT_DOCK_WIDTH_BOUNDS = {
  min: MIN_WIDTH_PX,
  max: MAX_WIDTH_PX,
  default: DEFAULT_WIDTH_PX,
} as const;
