#!/usr/bin/env node
import { runArcClickE2E } from "./e2e-arc-click-harness.mjs";

await runArcClickE2E({
  titleBase: "arc-serialized-click-test",
  labels: ["arc-serialized-a", "arc-serialized-b"],
  values: ["arc-serialized-alpha", "arc-serialized-beta"],
  sessionPrefix: "bs-arcser",
  requireFreshExtension: false,
  clickMode: "sequential",
});
