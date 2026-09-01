import type * as React from "react";

import {
  agentDraftedTitle,
  messageProvenance,
} from "@/features/messages/lib/messageProvenance";

/**
 * A header segment for messages an agent drafted and a human signed.
 *
 * Returns `null` — not an empty element — when the tags carry no provenance, so
 * `MessageMetaSegments` skips the slot and ordinary messages gain neither a
 * divider nor a pixel of width. Same type scale and muted tone as
 * `MessageAgentOwner`, so it reads as one more fact in the header rather than a
 * decoration.
 */
export function provenanceSegmentNode(
  tags: ReadonlyArray<ReadonlyArray<string>> | null | undefined,
  author: string | null | undefined,
): React.ReactNode {
  const provenance = messageProvenance(tags);
  if (!provenance.agentDrafted) return null;
  const title = agentDraftedTitle(author);
  return (
    <span
      aria-label={title}
      className="inline-flex shrink-0 items-baseline text-xs leading-4 text-muted-foreground/65"
      data-testid="message-provenance"
      role="img"
      title={title}
    >
      🐝
    </span>
  );
}
