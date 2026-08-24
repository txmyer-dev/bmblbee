import assert from "node:assert/strict";
import test from "node:test";

import { classifyBenchArtifact } from "./openArtifactInBench.ts";

test("classifies common markdown extensions", () => {
  assert.equal(classifyBenchArtifact("notes.md"), "markdown");
  assert.equal(classifyBenchArtifact("README.MARKDOWN"), "markdown");
  assert.equal(classifyBenchArtifact("story.mdx"), "markdown");
  assert.equal(classifyBenchArtifact("plain.txt"), "markdown");
});

test("classifies html and images", () => {
  assert.equal(classifyBenchArtifact("index.html"), "html");
  assert.equal(classifyBenchArtifact("shot.PNG"), "image");
  assert.equal(classifyBenchArtifact("logo.svg"), "image");
});

test("ignores query strings and hashes when finding the extension", () => {
  assert.equal(
    classifyBenchArtifact("https://x.dev/paper.md?token=abc"),
    "markdown",
  );
  assert.equal(classifyBenchArtifact("https://x.dev/img.png#anchor"), "image");
});

test("returns null for unknown or extensionless sources", () => {
  assert.equal(classifyBenchArtifact("Makefile"), null);
  assert.equal(classifyBenchArtifact("archive.tar.gz"), null);
  assert.equal(classifyBenchArtifact("trailing.dot."), null);
  assert.equal(classifyBenchArtifact(""), null);
});
