"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const mermaidRenderer = require("../src/render/mermaidRenderer");

// The broken/valid strings below and the frozen stderr sample are copied verbatim from a
// live `mmdc` run captured on the build host on 2026-08-28 (see the commit that added this
// file / the README for the raw capture). This test is deterministic and offline: it drives
// the real mmdc binary (installed as a dependency), it just doesn't touch the network.

const BROKEN_MERMAID = [
  "flowchart TD",
  "  A[Start] --> B{Decision | with pipe",
  "  B -->|Yes| C[Do thing]",
  "  B -->|No| D[Stop]",
].join("\n");

const VALID_MERMAID = [
  "flowchart TD",
  "  A[Start] --> B{Decision}",
  "  B -->|Yes| C[Do thing]",
  "  B -->|No| D[Stop]",
].join("\n");

// Frozen live capture (see mermaidRenderer.js's STACK_FRAME_RE comment) — the stack-trace
// tail after "Parser.parseError (...:1523:21)" is what extractMermaidError must strip.
const CAPTURED_STDERR = [
  "",
  "Error: Parse error on line 2:",
  "...art] --> B{Decision | with pipe  B -->|",
  "-----------------------^",
  "Expecting 'DIAMOND_STOP', 'TAGEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'PIPE'",
  "Parser.parseError (https://mermaid-cli-intercept.invalid/home/becke/CADS-DEMO-diagram/node_modules/mermaid/dist/chunks/mermaid.esm/chunk-6HLVECFW.mjs:1523:21)",
  "    at #evaluate (file:///home/becke/CADS-DEMO-diagram/node_modules/puppeteer-core/lib/puppeteer/cdp/ExecutionContext.js:402:19)",
  "    at async ExecutionContext.evaluate (file:///home/becke/CADS-DEMO-diagram/node_modules/puppeteer-core/lib/puppeteer/cdp/ExecutionContext.js:288:16)",
  "",
].join("\n");

test("extractMermaidError strips the JS stack trace, keeps the parse error", () => {
  const { extractMermaidError } = mermaidRenderer;
  const error = extractMermaidError(CAPTURED_STDERR);
  assert.match(error, /^Error: Parse error on line 2:/);
  assert.match(error, /Expecting 'DIAMOND_STOP'/);
  assert.match(error, /got 'PIPE'/);
  assert.doesNotMatch(error, /ExecutionContext\.js/);
  assert.doesNotMatch(error, /puppeteer-core/);
});

test("render() on broken mermaid source: ok:false, error mentions Parse error, no file written", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-test-"));
  const outPath = path.join(tmpDir, "out.png");
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const result = await mermaidRenderer.render(BROKEN_MERMAID, outPath);

  assert.equal(result.ok, false);
  assert.match(result.error, /Parse error/);
  assert.equal(fs.existsSync(outPath), false);
});

test("render() on valid mermaid source: ok:true, a real PNG is written", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-test-"));
  const outPath = path.join(tmpDir, "out.png");
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const result = await mermaidRenderer.render(VALID_MERMAID, outPath);

  assert.equal(result.ok, true);
  assert.equal(result.imagePath, outPath);
  assert.equal(fs.existsSync(outPath), true);
  const header = fs.readFileSync(outPath).subarray(0, 8);
  assert.deepEqual(
    [...header],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
});
