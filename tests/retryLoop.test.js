"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateAndRender } = require("../src/engine/retryLoop");
const mermaidRenderer = require("../src/render/mermaidRenderer");

const BROKEN_MERMAID = [
  "flowchart TD",
  "  A[Start] --> B{Decision | with pipe",
  "  B -->|Yes| C[Do thing]",
].join("\n");

const VALID_MERMAID = [
  "flowchart TD",
  "  A[Start] --> B{Decision}",
  "  B -->|Yes| C[Do thing]",
].join("\n");

/** A scripted fake llmClient: returns each entry of `responses` in order, one per chat() call. */
function makeScriptedLlmClient(responses) {
  const calls = [];
  return {
    calls,
    async chat(args) {
      calls.push(args);
      if (calls.length > responses.length) {
        throw new Error(`makeScriptedLlmClient: no scripted response for call ${calls.length}`);
      }
      return responses[calls.length - 1];
    },
  };
}

test("generateAndRender: real renderer + scripted LLM — fails then recovers on attempt 2", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-retry-test-"));
  const outPath = path.join(tmpDir, "out.png");
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const llmClient = makeScriptedLlmClient([BROKEN_MERMAID, VALID_MERMAID]);

  const result = await generateAndRender({
    description: "A flowchart with a decision that has a pipe in its label.",
    engine: "mermaid",
    llmClient,
    renderer: mermaidRenderer,
    outImagePath: outPath,
    maxAttempts: 3,
  });

  assert.equal(result.success, true);
  assert.equal(result.attempts.length, 2);

  assert.equal(result.attempts[0].promptKind, "initial");
  assert.equal(result.attempts[0].renderer.ok, false);
  assert.match(result.attempts[0].renderer.error, /Parse error/);

  assert.equal(result.attempts[1].promptKind, "correction");
  assert.equal(result.attempts[1].renderer.ok, true);
  assert.equal(fs.existsSync(outPath), true);

  // Load-bearing assertion: the correction prompt sent to the LLM must contain the LITERAL
  // error text captured from attempt 1 — no paraphrasing allowed between renderer and LLM.
  assert.equal(llmClient.calls.length, 2);
  const correctionPrompt = llmClient.calls[1].user;
  assert.ok(
    correctionPrompt.includes(result.attempts[0].renderer.error),
    "correction prompt must contain the exact renderer error from attempt 1"
  );
  // And it must also contain the literal broken DSL source from attempt 1.
  assert.ok(
    correctionPrompt.includes(result.attempts[0].dslSource),
    "correction prompt must contain the exact DSL source from attempt 1"
  );
});

test("generateAndRender: exhausts maxAttempts when the LLM never fixes it", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-retry-test-"));
  const outPath = path.join(tmpDir, "out.png");
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const llmClient = makeScriptedLlmClient([BROKEN_MERMAID, BROKEN_MERMAID, BROKEN_MERMAID]);

  const result = await generateAndRender({
    description: "A flowchart with a decision that has a pipe in its label.",
    engine: "mermaid",
    llmClient,
    renderer: mermaidRenderer,
    outImagePath: outPath,
    maxAttempts: 3,
  });

  assert.equal(result.success, false);
  assert.equal(result.attempts.length, 3);
  assert.ok(result.attempts.every((a) => a.renderer.ok === false));
  assert.equal(fs.existsSync(outPath), false);
});

test("generateAndRender: first attempt already valid — only one attempt, no correction prompt", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-retry-test-"));
  const outPath = path.join(tmpDir, "out.png");
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const llmClient = makeScriptedLlmClient([VALID_MERMAID]);

  const result = await generateAndRender({
    description: "A simple flowchart with one decision.",
    engine: "mermaid",
    llmClient,
    renderer: mermaidRenderer,
    outImagePath: outPath,
    maxAttempts: 3,
  });

  assert.equal(result.success, true);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].promptKind, "initial");
});
