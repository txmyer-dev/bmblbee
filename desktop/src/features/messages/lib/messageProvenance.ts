/**
 * Provenance a client stamped on an event, read straight from its tags.
 *
 * Waggle (a WebMCP client on the same relay) never lets the agent post: the agent
 * proposes, the human edits and signs. The signed event carries
 * `["proposed-by", "webmcp", "<proposalId>"]` so anyone reading the relay — not
 * just Waggle's own UI — can tell an agent-drafted message from a hand-typed one.
 * This is that reader. It is deliberately tag-only: the pubkey is the human's, so
 * the usual "is this an agent" checks say no, and they are right.
 */
export type MessageProvenance = {
  /** An agent drafted the text; a human signed it. */
  agentDrafted: boolean;
  /** Which agent surface drafted it, e.g. "webmcp". */
  draftedVia: string | null;
  /** The client's own reference for the proposal, when it gave one. */
  proposalId: string | null;
};

const NONE: MessageProvenance = {
  agentDrafted: false,
  draftedVia: null,
  proposalId: null,
};

export function messageProvenance(
  tags: ReadonlyArray<ReadonlyArray<string>> | null | undefined,
): MessageProvenance {
  if (!tags) return NONE;
  for (const tag of tags) {
    if (tag[0] !== "proposed-by") continue;
    const via = typeof tag[1] === "string" && tag[1] !== "" ? tag[1] : null;
    if (!via) continue;
    return {
      agentDrafted: true,
      draftedVia: via,
      proposalId: typeof tag[2] === "string" && tag[2] !== "" ? tag[2] : null,
    };
  }
  return NONE;
}

export function agentDraftedTitle(author: string | null | undefined): string {
  return author
    ? `Drafted by an agent, signed by ${author}`
    : "Drafted by an agent, signed by the author";
}
