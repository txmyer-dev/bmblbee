import { openRightDock } from "@/features/right-dock/rightDockStore";

// The bench distinguishes markdown/HTML (raw content) from images (URL) — see
// the store's payload contract. Callers with a *URL* to a text document have
// to fetch it themselves and pass the string in; the bench does not fetch
// arbitrary paths, both to keep the security surface small and to avoid a
// hidden dependency on filesystem access from inside a React tree.
export type BenchArtifactKind = "markdown" | "image" | "html";

type Extension = string;

const KIND_BY_EXT: ReadonlyMap<Extension, BenchArtifactKind> = new Map([
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["mdx", "markdown"],
  ["txt", "markdown"],
  ["html", "html"],
  ["htm", "html"],
  ["png", "image"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["gif", "image"],
  ["webp", "image"],
  ["svg", "image"],
  ["avif", "image"],
]);

/**
 * Return the bench kind implied by a URL/path's extension, or null when the
 * source is not something the bench renders. Query strings and hashes are
 * ignored so `foo.md?token=…` still resolves to markdown.
 */
export function classifyBenchArtifact(
  sourceUrlOrPath: string,
): BenchArtifactKind | null {
  const withoutHash = sourceUrlOrPath.split("#", 1)[0] ?? "";
  const withoutQuery = withoutHash.split("?", 1)[0] ?? "";
  const dot = withoutQuery.lastIndexOf(".");
  if (dot === -1 || dot === withoutQuery.length - 1) return null;
  const ext = withoutQuery.slice(dot + 1).toLowerCase();
  return KIND_BY_EXT.get(ext) ?? null;
}

/**
 * Open an image URL in the bench. Caller decides the URL scheme — a Tauri
 * asset URL, a data:, or an http(s) URL that the app's CSP already permits
 * for images. Nothing is fetched here.
 */
export function openImageInBench(source: string, label?: string | null): void {
  openRightDock({
    kind: "bench",
    payload: { kind: "image", source, label: label ?? null },
  });
}

/**
 * Open pre-fetched markdown content in the bench. Callers with a URL should
 * fetch it themselves (respecting the app's own auth) and hand the string in.
 */
export function openMarkdownInBench(
  source: string,
  label?: string | null,
): void {
  openRightDock({
    kind: "bench",
    payload: { kind: "markdown", source, label: label ?? null },
  });
}

/**
 * Open a pre-fetched HTML document in the bench. The viewer sandboxes the
 * document without same-origin so agent-authored HTML cannot reach app
 * cookies, storage, or the Nostr key material — but callers should still
 * treat the source as untrusted and never pass in privileged HTML.
 */
export function openHtmlInBench(source: string, label?: string | null): void {
  openRightDock({
    kind: "bench",
    payload: { kind: "html", source, label: label ?? null },
  });
}

/**
 * Convenience: open an image URL, or refuse to open non-image sources here
 * because the bench cannot fetch text documents on the caller's behalf.
 * Returns whether the bench was opened, so a caller intercepting a click can
 * fall through to the OS opener when this returns false.
 */
export function openArtifactUrlInBench(
  sourceUrl: string,
  label?: string | null,
): boolean {
  const kind = classifyBenchArtifact(sourceUrl);
  if (kind !== "image") return false;
  openImageInBench(sourceUrl, label);
  return true;
}
