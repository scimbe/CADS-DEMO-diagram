#!/usr/bin/env node
"use strict";

/**
 * The demo's acceptance-bar runner (plan §8B): a manual, human-witnessed run against the
 * REAL LLM and the REAL Mermaid renderer — not part of `npm test`, not CI-safe, not
 * simulated. Runs generateAndRender() for real against fixtures/broken-flow/description.txt,
 * writes every attempt to attempts.log.json and the final image (if any) to output.png, then
 * checks and plainly reports whether this run actually demonstrates a failure-then-recovery.
 *
 * Because the LLM is real and nondeterministic, sometimes it gets the escaping right on the
 * very first attempt — no retry to observe. That is reported honestly and the script exits
 * nonzero asking for a rerun; it does not pretend a lucky first-attempt success is the
 * required proof, and it never stitches artifacts from two different runs.
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { createLlmClient } = require("../src/llm/llmClient");
const mermaidRenderer = require("../src/render/mermaidRenderer");
const { generateAndRender } = require("../src/engine/retryLoop");
const { isValidPng } = require("../src/util/pngCheck");

const FIXTURE_DIR = __dirname + "/broken-flow";
const DESCRIPTION_PATH = path.join(FIXTURE_DIR, "description.txt");
const OUTPUT_PNG = path.join(FIXTURE_DIR, "output.png");
const ATTEMPTS_LOG = path.join(FIXTURE_DIR, "attempts.log.json");

async function main() {
  const description = await fs.promises.readFile(DESCRIPTION_PATH, "utf8");
  const llmClient = createLlmClient(process.env);

  console.log("Running generateAndRender() against the real LLM + real mmdc renderer...");
  const result = await generateAndRender({
    description,
    engine: "mermaid",
    llmClient,
    renderer: mermaidRenderer,
    outImagePath: OUTPUT_PNG,
    maxAttempts: 3,
  });

  await fs.promises.writeFile(ATTEMPTS_LOG, JSON.stringify(result, null, 2), "utf8");
  console.log(`Wrote ${result.attempts.length} attempt(s) to ${ATTEMPTS_LOG}`);

  const checks = [];
  const check = (name, pass) => {
    checks.push({ name, pass });
    console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}`);
  };

  check("at least 2 attempts were made", result.attempts.length >= 2);
  check(
    "attempt 1 failed with a non-empty renderer error",
    result.attempts[0] &&
      result.attempts[0].renderer.ok === false &&
      Boolean(result.attempts[0].renderer.error)
  );
  const last = result.attempts[result.attempts.length - 1];
  check("the last attempt succeeded", Boolean(last && last.renderer.ok === true));
  check(`${OUTPUT_PNG} is a valid, non-empty PNG`, isValidPng(OUTPUT_PNG));

  const allPass = checks.every((c) => c.pass);

  if (!allPass) {
    if (result.attempts.length === 1 && result.attempts[0].renderer.ok === true) {
      console.log(
        "\nfirst attempt already succeeded — no retry observed, rerun " +
          "(this is expected sometimes: the LLM is real and nondeterministic)"
      );
    } else {
      console.log("\nRun did not satisfy the acceptance checks above — see failures.");
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nACCEPTANCE CHECK PASSED: attempt 1 failed with a real renderer error, ` +
      `a later attempt recovered using that exact error, and a real PNG was produced.`
  );
  console.log(`Commit ${OUTPUT_PNG} and ${ATTEMPTS_LOG} as proof.`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
