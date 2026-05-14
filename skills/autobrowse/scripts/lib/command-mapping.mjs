// command-mapping.mjs — walk an autobrowse trace.json into target-agnostic ops.
//
// Each `browse <verb> ...` command in the trace becomes one op. The downstream
// codegen (Stagehand or Playwright) decides how to emit each op kind.
//
// Op kinds:
//   goto, wait_load, wait_timeout, wait_selector,
//   click_sel, click_ref, fill_sel, fill_ref,
//   select_dropdown, type_focused, press, scroll,
//   page_nav, session, perception, unhandled

import { sectionForTurn } from "./parse-task.mjs";

// Shell-aware tokenizer. Single-quoted strings are literal; double-quoted
// strings honor backslash escapes.
export function tokenize(cmd) {
  const out = [];
  let cur = "",
    q = null,
    esc = false,
    started = false;
  for (const ch of cmd.trim()) {
    if (esc) {
      cur += ch;
      esc = false;
      started = true;
      continue;
    }
    if (q) {
      if (ch === q) q = null;
      else if (q === '"' && ch === "\\") esc = true;
      else cur += ch;
      started = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      q = ch;
      started = true;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(cur);
        cur = "";
        started = false;
      }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

export const REF_RE = /^\[?\d+-\d+\]?$/;
const XPATH_RE = /^(\.?\/\/|\/)/;
const CSS_RE = /^[#.\[]|^[a-zA-Z][\w-]*[#.\[:]|^\*/;

export function classifySelector(s) {
  if (!s) return "none";
  if (REF_RE.test(s)) return "ref";
  if (XPATH_RE.test(s)) return "xpath";
  if (CSS_RE.test(s) || /^[a-zA-Z][\w-]*$/.test(s)) return "css";
  return "unknown";
}

// Strip brackets if present and normalize to "X-Y".
export function normalizeRef(s) {
  return s.replace(/^\[/, "").replace(/\]$/, "");
}

// Skip flags between `browse` and the verb. Flags that consume a value
// (--connect <id>, --session <name>, --ws <url>) take two tokens.
const FLAGS_WITH_VALUE = new Set(["--connect", "--session", "--ws", "--region", "--session-timeout"]);
function findVerbIndex(tokens) {
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith("--")) {
    i += FLAGS_WITH_VALUE.has(tokens[i]) ? 2 : 1;
  }
  return i;
}

// Walk trace.json into ops[]. Pairs each tool_use with its tool_result and
// only emits ops for successful results. Each op carries turn/intent/section
// so codegen can attach an explanatory comment.
export function walkTrace(trace, sections = []) {
  const ops = [];
  const traceByTurn = {};
  for (const e of trace) {
    if (!traceByTurn[e.turn]) traceByTurn[e.turn] = [];
    traceByTurn[e.turn].push(e);
  }
  const turns = Object.keys(traceByTurn).map(Number).sort((a, b) => a - b);

  for (const turn of turns) {
    const entries = traceByTurn[turn];
    const reasoningEntry = entries.find((e) => e.role === "assistant" && e.reasoning);
    const turnReasoning = reasoningEntry?.reasoning?.split("\n")[0]?.trim() ?? "";
    const section = sectionForTurn(sections, turn);
    const intent = (turnReasoning || section?.heading || `turn ${turn}`).slice(0, 160);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.role !== "assistant" || !e.tool_input) continue;
      const next = entries[i + 1];
      const success = next && next.role === "tool_result" && next.error === false;
      if (!success) continue;

      const tokens = tokenize(e.tool_input.command);
      if (tokens.length < 2 || tokens[0] !== "browse") continue;
      const vi = findVerbIndex(tokens);
      if (vi >= tokens.length) continue;
      const verb = tokens[vi];
      const args = tokens.slice(vi + 1);

      const base = {
        turn,
        intent,
        section: section?.heading ?? null,
        command: e.tool_input.command,
        result: next.output ?? "",
      };

      switch (verb) {
        case "stop":
        case "status":
        case "pages":
        case "env":
        case "start":
          ops.push({ kind: "session", verb, args, ...base });
          break;
        case "open":
        case "newpage":
        case "goto":
          ops.push({ kind: "goto", url: args[0], ...base });
          break;
        case "wait": {
          const sub = args[0];
          if (sub === "load") ops.push({ kind: "wait_load", ...base });
          else if (sub === "timeout")
            ops.push({ kind: "wait_timeout", ms: parseInt(args[1] || "1000", 10), ...base });
          else if (sub === "selector") ops.push({ kind: "wait_selector", selector: args[1], ...base });
          break;
        }
        case "snapshot":
        case "screenshot":
        case "get":
          ops.push({ kind: "perception", verb, args, ...base });
          break;
        case "click": {
          const target = args[0];
          const klass = classifySelector(target);
          if (klass === "xpath" || klass === "css") {
            ops.push({ kind: "click_sel", selector: target, ...base });
          } else if (klass === "ref") {
            ops.push({ kind: "click_ref", ref: normalizeRef(target), ...base });
          }
          break;
        }
        case "fill": {
          const selector = args[0];
          const positional = args.slice(1).filter((a) => !a.startsWith("--"));
          const value = positional.join(" ");
          const klass = classifySelector(selector);
          if (klass === "xpath" || klass === "css") {
            ops.push({ kind: "fill_sel", selector, value, ...base });
          } else if (klass === "ref") {
            ops.push({ kind: "fill_ref", ref: normalizeRef(selector), value, ...base });
          } else {
            ops.push({ kind: "fill_sel", selector, value, ...base });
          }
          break;
        }
        case "select": {
          const target = args[0];
          const value = args.slice(1).join(" ");
          const klass = classifySelector(target);
          if (klass === "ref") {
            ops.push({ kind: "select_ref", ref: normalizeRef(target), value, ...base });
          } else {
            ops.push({ kind: "select_dropdown", selector: target, value, ...base });
          }
          break;
        }
        case "eval":
          ops.push({ kind: "eval", expression: args.join(" "), ...base });
          break;
        case "type":
          ops.push({ kind: "type_focused", text: args.join(" "), ...base });
          break;
        case "press":
          ops.push({ kind: "press", key: args[0], ...base });
          break;
        case "scroll":
          ops.push({ kind: "scroll", coords: args.map(Number), ...base });
          break;
        case "back":
        case "forward":
        case "reload":
          ops.push({ kind: "page_nav", verb, ...base });
          break;
        default:
          ops.push({ kind: "unhandled", verb, args, ...base });
      }
    }
  }
  return ops;
}
