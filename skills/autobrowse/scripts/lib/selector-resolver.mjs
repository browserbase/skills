// selector-resolver.mjs — turn an ARIA ref (e.g. "23-2205") from a browse
// snapshot into a ranked list of Playwright locator candidates.
//
// Why this exists: autobrowse traces reference DOM nodes by session-scoped
// `[X-Y]` refs that don't replay outside the original CDP session. To emit
// deterministic Playwright, we have to resolve each ref against the snapshot
// the agent saw at the time, then translate the node's role/name/parent
// context into stable Playwright locators.
//
// Snapshot line format:
//   <indent>[X-Y] <role>(, <role2>)*( : <name|text>)?
// Indent is 2 spaces per nesting level.

// ARIA roles that getByRole supports. Non-ARIA tree types like
// LayoutTable, LayoutTableRow, RootWebArea, IframePresentational,
// StaticText, scrollable, html, body, paragraph are skipped for the
// role-locator candidate but can still be reached via getByText / parent.
const ARIA_ROLES = new Set([
  "alert", "alertdialog", "application", "article", "banner", "blockquote",
  "button", "caption", "cell", "checkbox", "code", "columnheader", "combobox",
  "complementary", "contentinfo", "definition", "deletion", "dialog",
  "directory", "document", "emphasis", "feed", "figure", "form", "generic",
  "grid", "gridcell", "group", "heading", "img", "image", "insertion", "link",
  "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu",
  "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "meter",
  "navigation", "none", "note", "option", "paragraph", "presentation",
  "progressbar", "radio", "radiogroup", "region", "row", "rowgroup",
  "rowheader", "scrollbar", "search", "searchbox", "separator", "slider",
  "spinbutton", "status", "strong", "subscript", "superscript", "switch",
  "tab", "table", "tablist", "tabpanel", "term", "textbox", "time", "timer",
  "toolbar", "tooltip", "tree", "treegrid", "treeitem",
]);

// Parse one snapshot tree (the string under JSON's `tree` field) into a
// flat array of nodes with parent links.
export function parseSnapshotTree(treeText) {
  const lines = (treeText ?? "").split("\n");
  const nodes = [];
  const stack = []; // [{ depth, idx }]
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line.trim()) continue;
    const match = line.match(/^(\s*)\[(\d+-\d+)\]\s+(.+)$/);
    if (!match) continue;
    const indent = match[1].length;
    const depth = Math.floor(indent / 2);
    const ref = match[2];
    const rest = match[3];

    // Split into roles and name. Name comes after the first `: ` that's
    // outside a comma-role list. Format: "role[, role2, ...][:name]"
    // Simplest: split on first ":" — left side is comma-separated roles,
    // right is the name.
    const colonIdx = rest.indexOf(":");
    let rolesStr, name;
    if (colonIdx === -1) {
      rolesStr = rest;
      name = null;
    } else {
      rolesStr = rest.slice(0, colonIdx).trim();
      name = rest.slice(colonIdx + 1).trim();
      if (name === "") name = null;
    }
    const roles = rolesStr.split(",").map((r) => r.trim()).filter(Boolean);

    // Pop stack to current depth
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parentIdx = stack.length ? stack[stack.length - 1].idx : -1;

    const node = {
      ref,
      roles,
      role: roles[0] ?? null,
      name,
      depth,
      parentIdx,
      lineIdx,
      childrenIdx: [],
    };
    const idx = nodes.length;
    nodes.push(node);
    if (parentIdx !== -1) nodes[parentIdx].childrenIdx.push(idx);
    stack.push({ depth, idx });
  }

  const byRef = new Map();
  for (const n of nodes) byRef.set(n.ref, n);
  return { nodes, byRef };
}

// Walk the full trace and collect every successful `browse snapshot` result,
// parsed. Returns [{ turn, tree }] in turn order.
export function collectSnapshots(trace) {
  const snaps = [];
  for (const e of trace) {
    if (e.role !== "tool_result") continue;
    if (e.error) continue;
    if (!e.command || !/\bsnapshot\b/.test(e.command)) continue;
    let payload;
    try {
      payload = JSON.parse(e.output);
    } catch {
      continue;
    }
    if (!payload || typeof payload.tree !== "string") continue;
    snaps.push({ turn: e.turn, tree: parseSnapshotTree(payload.tree) });
  }
  return snaps;
}

// Resolve a ref to its node, looking backwards from `fromTurn` (inclusive).
// Refs are session-scoped and persist until the DOM changes, so we accept
// the most recent prior snapshot that contains the ref.
export function resolveRef(ref, snapshots, fromTurn) {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].turn > fromTurn) continue;
    const node = snapshots[i].tree.byRef.get(ref);
    if (node) return { node, sourceTurn: snapshots[i].turn, tree: snapshots[i].tree };
  }
  return null;
}

// Best ancestor that carries a labeling text. Walks parents looking for a
// nearby StaticText child sibling — common in form rows where a label and
// input are siblings under a wrapper div.
function findNearbyLabel(node, tree) {
  // Try parent's StaticText children first.
  if (node.parentIdx >= 0) {
    const parent = tree.nodes[node.parentIdx];
    for (const ci of parent.childrenIdx) {
      const sib = tree.nodes[ci];
      if (sib === node) continue;
      if ((sib.role === "StaticText" || sib.role === "label") && sib.name) {
        return sib.name;
      }
    }
  }
  // Then look for the first non-empty descendant text — useful for clickable
  // wrappers whose displayed text lives in a child.
  const visit = (idx, budget = 5) => {
    if (budget <= 0) return null;
    const n = tree.nodes[idx];
    if ((n.role === "StaticText" || n.role === "heading") && n.name) return n.name;
    for (const c of n.childrenIdx) {
      const found = visit(c, budget - 1);
      if (found) return found;
    }
    return null;
  };
  for (const c of node.childrenIdx) {
    const found = visit(c, 5);
    if (found) return found;
  }
  return null;
}

// Mapping for non-ARIA role names that show up in the browse snapshot tree
// to their ARIA equivalents. Most importantly: <select> reports as "select"
// in browse snapshots but Playwright's role is "combobox".
const SNAPSHOT_TO_ARIA_ROLE = {
  select: "combobox",
  // Add additional mappings here as we encounter them in production traces.
};

// Roles where the accessible name is an exact label/placeholder and getByRole
// with substring matching causes collisions (e.g. "Company Name" matching
// "Confirm Company Name"). We emit `exact: true` for these.
const EXACT_NAME_ROLES = new Set([
  "textbox", "searchbox", "combobox", "spinbutton", "listbox",
]);

// Build ranked Playwright locator candidates for a node. Each candidate has
// { method, args, confidence (0..1), code }. The first is the "best" — the
// self-healer (P1) can fall back to lower-ranked candidates when selectors
// drift. Ranking heuristic mirrors Swivel's stability ordering.
export function nodeToLocators(node, tree) {
  if (!node) return [];
  const candidates = [];

  const pwName = (n) => n; // Playwright accepts strings for `name`; quotes happen at emit.

  // Normalize the role: map browse-snapshot quirks (e.g., "select") to ARIA roles.
  const rawRole = (node.role || "").toLowerCase();
  const role = SNAPSHOT_TO_ARIA_ROLE[rawRole] || rawRole;
  const buildRoleArgs = (r, name) => {
    const opts = { name: pwName(name) };
    if (EXACT_NAME_ROLES.has(r)) opts.exact = true;
    return [r, opts];
  };

  const isFormInput = role && /^(textbox|combobox|checkbox|searchbox|spinbutton|slider|switch|radio|listbox)$/i.test(role);
  const isSelectLike = role === "combobox" || role === "listbox";

  // For form selects, prefer getByLabel over getByRole — label-based locators
  // tend to be more reliable when forms have repeated/similar select widgets.
  if (isSelectLike && node.name) {
    candidates.push({
      method: "getByLabel",
      args: [node.name],
      confidence: 0.93,
    });
  }

  // 1. getByRole({ name }) — best when both are present and role is ARIA.
  if (role && ARIA_ROLES.has(role) && node.name) {
    candidates.push({
      method: "getByRole",
      args: buildRoleArgs(role, node.name),
      confidence: isSelectLike ? 0.88 : 0.92,
    });
  }

  // 2. getByLabel — for form inputs sitting next to a label (non-select).
  if (isFormInput && !isSelectLike) {
    const label = node.name || findNearbyLabel(node, tree);
    if (label) {
      candidates.push({
        method: "getByLabel",
        args: [label],
        confidence: 0.85,
      });
    }
    // Also try placeholder via getByPlaceholder — placeholder text shows up
    // as `name` for textboxes when there's no explicit label.
    if (node.name) {
      candidates.push({
        method: "getByPlaceholder",
        args: [node.name],
        confidence: 0.75,
      });
    }
  }

  // 3. getByRole({ name }) — also worth trying with role even if not in
  // ARIA_ROLES, since Playwright tolerates many role strings.
  if (role && !ARIA_ROLES.has(role) && node.name) {
    candidates.push({
      method: "getByRole",
      args: buildRoleArgs(role, node.name),
      confidence: 0.6,
    });
  }

  // 4. getByText — fallback when role isn't useful but text is. Useful
  // for clickable wrapper divs that contain a static text child.
  const textForLocator = node.name || findNearbyLabel(node, tree);
  if (textForLocator && textForLocator.length < 100) {
    candidates.push({
      method: "getByText",
      args: [textForLocator],
      confidence: 0.45,
    });
  }

  // 5. getByRole without a name — last resort, only safe when there's
  // really only one of this role in the relevant scope. Low confidence.
  if (role && ARIA_ROLES.has(role) && !node.name) {
    candidates.push({
      method: "getByRole",
      args: [role],
      confidence: 0.25,
    });
  }

  // Dedup by code shape.
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const code = renderLocator(c);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ ...c, code });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

// Render a candidate into a Playwright code fragment like
// `page.getByRole("button", { name: "Submit" })`.
export function renderLocator(candidate) {
  const args = candidate.args.map((a) => stringifyArg(a)).join(", ");
  return `page.${candidate.method}(${args})`;
}

function stringifyArg(a) {
  if (typeof a === "string") return JSON.stringify(a);
  if (typeof a === "number" || typeof a === "boolean") return String(a);
  if (a && typeof a === "object") {
    const entries = Object.entries(a).map(([k, v]) => `${k}: ${stringifyArg(v)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(a);
}

// Convenience: given the full trace and an op (with .ref and .turn), return
// { resolved, candidates, sourceTurn } or { resolved: false, reason }.
export function resolveOpRef(op, snapshots) {
  const r = resolveRef(op.ref, snapshots, op.turn);
  if (!r) return { resolved: false, reason: `no snapshot ≤ turn ${op.turn} contains ref ${op.ref}` };
  const candidates = nodeToLocators(r.node, r.tree);
  if (candidates.length === 0) {
    return {
      resolved: false,
      reason: `ref ${op.ref} resolved to node with no usable locator (role=${r.node.role}, name=${r.node.name})`,
      node: r.node,
      sourceTurn: r.sourceTurn,
    };
  }
  return { resolved: true, candidates, node: r.node, sourceTurn: r.sourceTurn };
}
