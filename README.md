# diagram-cli — Diagram-from-Description

Part of the bunsenbrenner.org demo portfolio. Tracking issue:
[CADS-agent-marketplace#25](https://github.com/scimbe/CADS-agent-marketplace/issues/25).

Describe a system or process in plain language; an LLM (`local-devstral-small2` via the
shared litellm-proxy) writes Mermaid (or Graphviz DOT) diagram source; a real, deterministic
renderer (`mmdc` / `dot`) actually draws the image. **The core feature is the
validate-and-retry loop**: the renderer's output is checked for real — a genuine syntax
error, not a guess — and if it fails, the exact renderer error is fed back to the LLM,
which is asked to fix its own source. This repeats up to a small attempt cap (default 3,
counting the first attempt).

This is a CLI-only proof of the loop (see `#25` for scope reasoning) — no web UI, no
tunnel/hostname exposure. That's a possible later phase once this core is proven.

## Marketplace status

This demo is published to the live **bunsenbrenner.org** registry
(`registry.bunsenbrenner.org`) as a signed manifest. Verified present on 2026-08-29:

- name `diagram`, latest version `0.1.1`, `installer_kind: binary`
- publisher pubkey `1292c0cc…ce69b` (shared across the whole demo portfolio)
- manifest id `984f5bce…14d5`

Reproduce the check yourself:

```bash
curl -s https://registry.bunsenbrenner.org/manifests | grep '"name":"diagram"'
```

**Measured vs. claimed:** what is *measured* here is that the manifest — signed metadata
plus a publisher-signed bundle reference — is listed on the registry. The registry's own
guardrail verdict for a binary-kind manifest explicitly notes it is **not** a static bundle
scan; trust rests on the publisher-pubkey allowlist checked at activation time. It is **not**
a claim that an always-on hosted `*.bunsenbrenner.org` service exists — this is a CLI-only
proof of the loop, and the web-UI/tunnel phase noted above remains future work.

## What's real here

- The LLM call is a real HTTP request to the shared litellm-proxy
  (`src/llm/llmClient.js`), no mocking.
- The Mermaid render is a real, offline, deterministic subprocess
  (`node_modules/.bin/mmdc`, from the `@mermaid-js/mermaid-cli` npm package) —
  `src/render/mermaidRenderer.js`. It writes an actual PNG file and reports the renderer's
  actual stderr on failure (with the JS stack trace trimmed off — see
  `extractMermaidError` and its test for the exact, live-captured format this was written
  against).
- The retry loop (`src/engine/retryLoop.js`) really does feed the literal previous DSL
  source and the literal renderer error back into the next prompt
  (`src/llm/diagramPrompt.js#buildCorrectionPrompt`) — no summarizing/paraphrasing in
  between. `tests/retryLoop.test.js` asserts on the literal string, not just "some error was
  mentioned."
- `fixtures/broken-flow/` is a **live, LLM-driven acceptance run**, not a scripted/mocked
  demo — see below.

## Known limitation: Graphviz is implemented but unverified

`src/render/graphvizRenderer.js` exists and follows the same adapter contract as the
Mermaid renderer, but graphviz's `dot` binary is **not installed** on the host this was
built on (installing it needs `sudo apt-get install -y graphviz`, and this session has no
passwordless sudo). Because of that:

- `graphvizRenderer.js`'s error-extraction logic is written against graphviz's
  *documented* error format, not a live capture the way Mermaid's was — see the
  `KNOWN LIMITATION` comment at the top of that file.
- `tests/graphvizRenderer.test.js` calls `isAvailable()` first and skips itself
  (`t.skip(...)`) when `dot` isn't on PATH, rather than faking a pass. Run
  `sudo apt-get install -y graphviz` and rerun `npm test` to actually exercise it.
- `diagram-cli generate --engine graphviz` will print a clear "renderer ... is not
  available on this host" message and exit 2 rather than silently doing nothing.

**The acceptance bar (the real fail-then-recover retry loop) is fully met on the Mermaid
path**, which is what the brief requires ("Mermaid *or* Graphviz").

## Setup

```bash
npm install         # pulls @mermaid-js/mermaid-cli, which pulls its own bundled Chromium
                     # via puppeteer's postinstall — no system Chrome needed
cp .env.example .env
# edit .env: LITELLM_BASE_URL / LITELLM_API_KEY / LITELLM_DEFAULT_MODEL
```

`.env` is gitignored — never commit it.

## Usage

```bash
node bin/diagram.js generate \
  --description "A flowchart: user logs in, then sees the dashboard." \
  --engine mermaid \
  --out diagram.png \
  --max-attempts 3 \
  --attempts-log attempts.json
```

Or `--description-file <path>` instead of `--description` for a longer prompt.

Prints a per-attempt summary (including the real renderer error on any failed attempt) and
writes the final image plus, if `--attempts-log` is given, the full JSON transcript of
every attempt (exact prompt, exact LLM output, exact renderer verdict).

## Tests

```bash
npm test
```

`node --test` (Node's built-in runner, no extra dependency). Deterministic and offline —
no network call, no LLM. Covers:

- `mermaidRenderer.test.js` — the real `mmdc` binary against a known-broken and a
  known-valid Mermaid source string; asserts exit-code-based detection, the trimmed error
  text, and a real PNG with correct magic bytes on success.
- `graphvizRenderer.test.js` — same shape for `dot`, self-skipping when `dot` isn't
  installed (see Known limitation above).
- `retryLoop.test.js` — the **real** Mermaid renderer plus a scripted fake LLM client
  (`chat()` returns broken DSL on call 1, valid DSL on call 2). Asserts: exactly 2 attempts,
  attempt 1 fails / attempt 2 succeeds, a real PNG exists after, and — the load-bearing
  assertion — the prompt sent to the LLM on call 2 contains the *literal* error string and
  *literal* DSL source from attempt 1. Also covers the "LLM never fixes it" exhausted-retries
  path and the "first attempt already valid" one-attempt path.

## The acceptance-bar proof: `fixtures/broken-flow/`

The brief requires demonstrating "an actual observed retry-and-recover in your test
output (not simulated)" starting from a description likely to trigger a real first-pass
syntax error, with the rendered image committed as proof.

`fixtures/broken-flow/description.txt` describes an authorization flowchart whose own
label text contains a literal `|` and a literal `{...}` clause — both real Mermaid syntax
delimiters — on the theory that a model copying that text verbatim into a label without
escaping it reproduces a genuine parse error.

Run it with:

```bash
node fixtures/runBrokenFlow.js
```

This calls the real LLM and the real renderer, writes `fixtures/broken-flow/output.png`
and `fixtures/broken-flow/attempts.log.json`, then checks and prints plainly whether that
particular run actually demonstrated a failure followed by a recovery. Because the LLM is
real and nondeterministic, it sometimes escapes the text correctly on the very first try —
if so, the script says so explicitly ("first attempt already succeeded — no retry
observed, rerun") and exits nonzero; that is the honest thing to do rather than treating a
lucky first-pass success as the required proof. Both committed files always come from the
same single execution.

### What actually happened, for real, on the run whose artifacts are committed

The committed run took **3 attempts** and demonstrates two distinct genuine parse-error
recoveries, not just one:

1. **Attempt 1 (initial)** — the LLM copied `'trusted zone | 2FA verified | mTLS pinned CA
   valid?'` straight into a Mermaid decision-node label (`{...}`). `mmdc` really failed to
   parse it:
   ```
   Error: Parse error on line 3:
   ... --> C{trusted zone | 2FA verified | mTL
   -----------------------^
   Expecting 'DIAMOND_STOP', 'TAGEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'PIPE'
   ```
2. **Attempt 2 (correction)** — fed that exact error plus the exact broken source, the LLM
   fixed the `|` by switching to `<br>` line breaks in the decision label, but its
   downstream node still contained a literal `{zone, 2FA, mTLS}` — Mermaid's flowchart
   parser treats `{` specially even inside a `[...]` node label, so this genuinely failed
   too, with a *different* real error:
   ```
   Error: Parse error on line 6:
   ...son: one or more of {zone, 2FA, mTLS} fa
   -----------------------^
   Expecting 'SQE', 'DOUBLECIRCLEEND', ... got 'DIAMOND_START'
   ```
3. **Attempt 3 (correction)** — fed *that* exact error, the LLM dropped the curly braces
   entirely and the render succeeded. `output.png` is that render.

This is a stronger demonstration of the loop than a single retry: it shows the exact-error
feedback mechanism correctly driving the LLM through two different real failure modes to a
real success, using nothing but the renderer's own error text each time — see
`attempts.log.json` for the full transcript (every prompt, every LLM response, every
renderer verdict, verbatim).

## Repo layout

```
bin/diagram.js              CLI entrypoint
src/cli/                    arg parsing + command wiring
src/llm/                    litellm-proxy client, prompt builders, DSL-fence stripping
src/render/                 renderer adapters (mermaid real+verified, graphviz real+unverified)
src/engine/retryLoop.js     the core render-validate-retry algorithm
src/util/                   exec() subprocess wrapper, PNG magic-byte check
fixtures/broken-flow/       the committed acceptance-bar proof run
tests/                      node --test, deterministic, offline
```

## Environment / model notes

Model is `local-devstral-small2` (`ollama_chat/devstral-small-2-agentic:24b` behind the
shared litellm-proxy) — plain chat-completions only, `supports_reasoning: false`, so no
`thinking`/`reasoning_effort` params are sent. Unlike the `CADS-DEMO-codereview` precedent
this client's `chat()` deliberately does **not** send
`response_format: { type: "json_object" }` — this demo's LLM output is diagram DSL source
text, not JSON, and forcing JSON mode would fight that goal (see the docstring in
`src/llm/llmClient.js`).
