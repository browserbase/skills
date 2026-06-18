// Central pricing table — single source of truth for the whole harness.
// USD per 1M tokens [input, output]. Do not trust per-script tables elsewhere
// (evaluate.mjs has its own stale copy; we recompute from raw token counts).
const PRICING = [
  ["claude-fable-5", [10, 50]],
  ["claude-opus-4-8", [5, 25]],
  ["claude-opus-4-7", [5, 25]],
  ["claude-opus-4-6", [5, 25]],
  ["claude-opus-4-5", [5, 25]],
  ["claude-sonnet-4-6", [3, 15]],
  ["claude-sonnet-4-5", [3, 15]],
  ["claude-haiku-4-5", [1, 5]],
];

export function costUsd(model, tokensIn, tokensOut) {
  const entry = PRICING.find(([prefix]) => model?.startsWith(prefix));
  const [inRate, outRate] = entry ? entry[1] : [3, 15];
  return (tokensIn * inRate + tokensOut * outRate) / 1_000_000;
}
