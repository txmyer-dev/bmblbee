import assert from "node:assert/strict";
import test from "node:test";

import { agentDraftedTitle, messageProvenance } from "./messageProvenance.ts";

test("a proposed-by tag marks the message as agent-drafted", () => {
  assert.deepEqual(
    messageProvenance([
      ["h", "chan"],
      ["client", "waggle"],
      ["proposed-by", "webmcp", "7"],
    ]),
    { agentDrafted: true, draftedVia: "webmcp", proposalId: "7" },
  );
});

test("a client tag alone is not provenance", () => {
  assert.deepEqual(messageProvenance([["client", "waggle"]]), {
    agentDrafted: false,
    draftedVia: null,
    proposalId: null,
  });
});

test("missing, empty, or malformed tags are handled", () => {
  assert.equal(messageProvenance(undefined).agentDrafted, false);
  assert.equal(messageProvenance(null).agentDrafted, false);
  assert.equal(messageProvenance([]).agentDrafted, false);
  assert.equal(messageProvenance([["proposed-by"]]).agentDrafted, false);
  assert.equal(messageProvenance([["proposed-by", ""]]).agentDrafted, false);
  assert.equal(messageProvenance([["proposed-by", "webmcp"]]).proposalId, null);
});

test("the title names the human who signed", () => {
  assert.equal(
    agentDraftedTitle("Tony"),
    "Drafted by an agent, signed by Tony",
  );
  assert.equal(
    agentDraftedTitle(null),
    "Drafted by an agent, signed by the author",
  );
});
