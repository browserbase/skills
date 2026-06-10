#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const IMPLEMENTATION_KINDS = new Set(["same_origin_fetch", "dom", "hybrid"]);
const PLAYWRIGHT_STYLE_PATTERNS = [
  /\bpage\.(goto|locator|click|fill|evaluate|waitFor|waitForSelector)\s*\(/,
  /\bbrowser\.newPage\s*\(/,
  /\bcontext\.newPage\s*\(/,
  /\bawait\s+page\b/,
];

function usage() {
  return "Usage: compile.mjs <artifact-dir>";
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertValidTool(tool) {
  assertObject(tool, "Tool");
  if (!TOOL_NAME_PATTERN.test(String(tool.name || ""))) {
    throw new Error(`Invalid tool name "${tool.name}". Use 1-80 letters, numbers, underscores, or hyphens.`);
  }
  if (!String(tool.description || "").trim()) {
    throw new Error(`Tool "${tool.name}" is missing a description.`);
  }
  assertObject(tool.inputSchema, `Tool "${tool.name}" inputSchema`);
  assertObject(tool.implementation, `Tool "${tool.name}" implementation`);
  if (!IMPLEMENTATION_KINDS.has(tool.implementation.kind)) {
    throw new Error(`Tool "${tool.name}" has an invalid implementation kind.`);
  }
  if (!String(tool.implementation.source || "").trim()) {
    throw new Error(`Tool "${tool.name}" is missing implementation source.`);
  }
}

function assertValidManifest(manifest) {
  assertObject(manifest, "Manifest");
  if (!String(manifest.domain || "").trim()) throw new Error("Manifest is missing domain.");
  if (!String(manifest.task || "").trim()) throw new Error("Manifest is missing task.");
  if (!String(manifest.url || "").trim()) throw new Error("Manifest is missing url.");
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    throw new Error("Manifest must contain at least one tool.");
  }
  for (const tool of manifest.tools) assertValidTool(tool);
}

function indent(source, spaces) {
  const prefix = " ".repeat(spaces);
  return String(source)
    .trim()
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function serializeTool(tool) {
  return `{
      name: ${JSON.stringify(tool.name)},
      description: ${JSON.stringify(tool.description)},
      inputSchema: ${JSON.stringify(tool.inputSchema, null, 6)},
      execute: withTimeout(async (input) => {
${indent(tool.implementation.source, 8)}
      }, 30000),
    }`;
}

function emitWebMCPInitScript(manifest) {
  assertValidManifest(manifest);
  const tools = manifest.tools.map(serializeTool).join(",\n\n");

  return `(() => {
  if (window.self !== window.top) return;

  const WEBMCP_GEN_TOOLS = [
    ${tools}
  ];

  function normalizeError(error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    return { message: String(error) };
  }

  function withTimeout(fn, timeoutMs) {
    return async (input) => {
      let timer;
      try {
        return await Promise.race([
          fn(input || {}),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("WebMCP tool timed out")),
              timeoutMs,
            );
          }),
        ]);
      } catch (error) {
        return {
          success: false,
          error: normalizeError(error),
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
  }

  function registerTools() {
    if (!navigator.modelContext) {
      return {
        success: false,
        error: "navigator.modelContext is not available.",
      };
    }

    for (const tool of WEBMCP_GEN_TOOLS) {
      try {
        navigator.modelContext.unregisterTool(tool.name);
      } catch {
        // Tool may not exist yet.
      }
      navigator.modelContext.registerTool(tool);
    }

    return {
      success: true,
      registeredTools: WEBMCP_GEN_TOOLS.map((tool) => tool.name),
    };
  }

  window.__webmcpGenRegistration = registerTools();
})();
`;
}

function staticChecks(manifest, source) {
  const warnings = [];
  const errors = [];
  if (!source.includes("navigator.modelContext.registerTool")) {
    errors.push("Generated script does not register WebMCP tools.");
  }
  for (const tool of manifest.tools) {
    const implementationSource = String(tool.implementation.source || "");
    if (PLAYWRIGHT_STYLE_PATTERNS.some((pattern) => pattern.test(implementationSource))) {
      warnings.push(`Tool "${tool.name}" may contain Playwright-style code; WebMCP implementations run in the page.`);
    }
    if (implementationSource.includes("eval(") || implementationSource.includes("new Function")) {
      errors.push(`Tool "${tool.name}" uses eval/new Function.`);
    }
  }
  return { passed: errors.length === 0, errors, warnings };
}

async function main() {
  const artifactDir = process.argv[2];
  if (!artifactDir) throw new Error(usage());

  const resolvedArtifactDir = path.resolve(process.cwd(), artifactDir);
  const manifestPath = path.join(resolvedArtifactDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const source = emitWebMCPInitScript(manifest);
  const checks = staticChecks(manifest, source);
  if (!checks.passed) {
    throw new Error(`Static checks failed:\n${checks.errors.map((error) => `- ${error}`).join("\n")}`);
  }
  await writeFile(path.join(resolvedArtifactDir, "webmcp.init.js"), source, "utf8");
  console.log(`Compiled WebMCP artifact at ${resolvedArtifactDir}`);
  if (checks.warnings.length) {
    console.log(`Warnings:\n${checks.warnings.map((warning) => `- ${warning}`).join("\n")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
