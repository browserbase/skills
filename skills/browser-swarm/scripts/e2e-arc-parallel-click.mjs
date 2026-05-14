#!/usr/bin/env node
import { runArcClickE2E } from "./e2e-arc-click-harness.mjs";

await runArcClickE2E({
  titleBase: "arc-parallel-click-test",
  labels: ["arc-parallel-a", "arc-parallel-b"],
  values: ["arc-parallel-alpha", "arc-parallel-beta"],
  sessionPrefix: "bs-arcpar",
  requireFreshExtension: true,
  clickMode: "parallel",
});
