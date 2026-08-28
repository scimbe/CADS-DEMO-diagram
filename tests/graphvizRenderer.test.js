"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const graphvizRenderer = require("../src/render/graphvizRenderer");

// graphviz (`dot`) is NOT installed on this build host (no passwordless sudo available to
// this session — see graphvizRenderer.js's KNOWN LIMITATION note and the README). These
// tests skip themselves gracefully when `dot` isn't on PATH rather than failing CI on
// hosts that never installed it; they run for real wherever `dot` is present.

test("graphviz renderer", async (t) => {
  const available = await graphvizRenderer.isAvailable();
  if (!available) {
    t.skip("graphviz `dot` binary not found on PATH — install with `apt-get install graphviz`");
    return;
  }

  await t.test("render() on valid dot source: ok:true, a real PNG is written", async (t2) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-test-dot-"));
    const outPath = path.join(tmpDir, "out.png");
    t2.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await graphvizRenderer.render("digraph G { A -> B; }", outPath);

    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(outPath), true);
  });

  await t.test("render() on broken dot source: ok:false with a non-empty error", async (t2) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-test-dot-"));
    const outPath = path.join(tmpDir, "out.png");
    t2.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await graphvizRenderer.render("digraph G { A -> ; this is not valid", outPath);

    assert.equal(result.ok, false);
    assert.ok(result.error && result.error.length > 0);
  });
});
