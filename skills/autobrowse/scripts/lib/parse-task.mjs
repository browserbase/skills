// parse-task.mjs — task.md → Zod schema, strategy.md → section ranges.
//
// task.md's `## Output` block holds a fenced JSON example. We normalize
// placeholder tokens (<integer>, <string|null>, etc.) to JSON sentinels,
// then walk the resulting object to infer a Zod schema.

export function extractOutputJson(taskMd) {
  const after = taskMd.split(/^##\s+Output\s*$/m)[1];
  if (!after) return null;
  const fence = after.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!fence) return null;
  let raw = fence[1];
  // <int>, <number>, <count>, etc. → 0
  raw = raw.replace(/"<[^>]*>"/g, '""');
  raw = raw.replace(/<integer>|<number>|<int>|<count>/gi, "0");
  raw = raw.replace(/<bool>|<boolean>/gi, "false");
  raw = raw.replace(/<null>/gi, "null");
  raw = raw.replace(/<[^>]+>/g, '""');
  raw = raw.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function jsonToZod(value, indent = 2) {
  const pad = " ".repeat(indent);
  if (value === null) return "z.unknown().nullable()";
  if (Array.isArray(value)) {
    if (value.length === 0) return "z.array(z.unknown())";
    return `z.array(${jsonToZod(value[0], indent)})`;
  }
  switch (typeof value) {
    case "string":
      return "z.string()";
    case "number":
      return Number.isInteger(value) ? "z.number().int()" : "z.number()";
    case "boolean":
      return "z.boolean()";
    case "object": {
      const entries = Object.entries(value).map(([k, v]) => {
        const keyOut = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        return `${pad}${keyOut}: ${jsonToZod(v, indent + 2)},`;
      });
      return `z.object({\n${entries.join("\n")}\n${" ".repeat(indent - 2)}})`;
    }
    default:
      return "z.unknown()";
  }
}

export function taskToSchema(taskMd) {
  const outputShape = extractOutputJson(taskMd);
  if (outputShape && typeof outputShape === "object" && !Array.isArray(outputShape)) {
    return {
      outputShape,
      zodSchema: jsonToZod(outputShape),
      schemaFieldCount: Object.keys(outputShape).length,
    };
  }
  return {
    outputShape: null,
    zodSchema: "z.object({ result: z.unknown() })",
    schemaFieldCount: 0,
  };
}

// Parse strategy.md headers that carry "(turns N–M)" or "(turns N-M)"
// markers. Returns sections [{ heading, start, end, prose }] in document order.
export function parseStrategySections(strategyMd) {
  const lines = strategyMd.split("\n");
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) {
      if (cur) sections.push(cur);
      const range = h[1].match(/turns?\s+(\d+)\s*[–—\-]\s*(\d+)/i);
      cur = {
        heading: h[1].trim(),
        start: range ? parseInt(range[1], 10) : null,
        end: range ? parseInt(range[2], 10) : null,
        prose: [],
      };
    } else if (cur) {
      cur.prose.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections;
}

export function sectionForTurn(sections, turn) {
  return sections.find((s) => s.start !== null && turn >= s.start && turn <= s.end);
}
