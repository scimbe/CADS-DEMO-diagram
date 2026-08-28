# fixtures/broken-flow — the acceptance-bar proof run

This is the demo's required acceptance-bar artifact: a real, LLM-driven, non-simulated
run of the render-validate-retry loop where the first attempt genuinely fails a real
Mermaid parse and a later attempt genuinely recovers, using the exact renderer error fed
back to the LLM (see `src/engine/retryLoop.js` / `src/llm/diagramPrompt.js`).

- `description.txt` — the input description. Its own text contains a literal `|` and a
  literal `{...}` clause (both real Mermaid syntax delimiters), on the theory that an LLM
  copying this text into a node/edge label verbatim is likely to reproduce a genuine parse
  error the same way a hand-written broken diagram does. This is "likely," not guaranteed —
  the LLM is real and nondeterministic, so it sometimes escapes the text correctly on the
  first try. See `runBrokenFlow.js` for how that's handled honestly (rerun until a real
  failure-then-recovery is observed — never simulated, never stitched from separate runs).
- `output.png` — COMMITTED. The final rendered image from the one run whose transcript is
  below.
- `attempts.log.json` — COMMITTED. The full transcript of that same run: every attempt's
  exact prompt, exact LLM output, and exact renderer verdict (including the real renderer
  error text on the failed attempt(s)). Both files come from the same execution.

Reproduce with:

```
node fixtures/runBrokenFlow.js
```
