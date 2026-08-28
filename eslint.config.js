"use strict";

/**
 * Minimal ESLint v9+ flat config for this repo (copied from CADS-DEMO-codereview's
 * convention). Just enough to catch dead code in a small CLI.
 */
module.exports = [
  {
    rules: {
      "no-unused-vars": "error",
    },
  },
];
