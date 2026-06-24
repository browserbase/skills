#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function usage() {
  return "Usage: generate-stagehand-example.mjs <artifact-dir>";
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertValidManifest(manifest) {
  assertObject(manifest, "Manifest");
  if (!String(manifest.url || "").trim()) throw new Error("Manifest is missing url.");
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    throw new Error("Manifest must contain at least one tool.");
  }
}

function serializeExpectedTools(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    fixtureInput: tool.fixtureInput ?? {},
  }));
}

function emitStagehandExample(manifest) {
  const expectedTools = serializeExpectedTools(manifest.tools);

  return `import { fileURLToPath } from "node:url";

import { Stagehand } from "@browserbasehq/stagehand";

const TARGET_URL = ${JSON.stringify(manifest.url)};
const WEBMCP_INIT_SCRIPT_PATH = fileURLToPath(
  new URL("./webmcp.init.js", import.meta.url),
);
const EXPECTED_TOOLS = ${JSON.stringify(expectedTools, null, 2)};

async function main() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    localBrowserLaunchOptions: {
      args: ["--enable-features=WebMCPTesting,DevToolsWebMCPSupport"],
    },
  });

  try {
    await stagehand.init();
    const page =
      stagehand.context.pages()[0] ?? (await stagehand.context.newPage());

    await page.addInitScript({ path: WEBMCP_INIT_SCRIPT_PATH });
    await page.goto(TARGET_URL, { waitUntil: "load" });

    const registeredTools = await page.listWebMCPTools();
    console.log(\`Found \${registeredTools.length} WebMCP tools:\`);
    for (const tool of registeredTools) {
      console.log(\`- \${tool.name}: \${tool.description ?? "No description"}\`);
    }

    for (const expectedTool of EXPECTED_TOOLS) {
      const tool = registeredTools.find(
        (registeredTool) => registeredTool.name === expectedTool.name,
      );
      if (!tool) {
        throw new Error(\`Expected WebMCP tool "\${expectedTool.name}" was not registered.\`);
      }

      const invocation = await page.invokeWebMCPTool(
        tool.name,
        expectedTool.fixtureInput,
        { frameId: tool.frameId },
      );
      const result = await invocation.result;

      console.log(\`Invocation result for \${tool.name}:\`);
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    await stagehand.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`;
}

async function main() {
  const artifactDir = process.argv[2];
  if (!artifactDir) throw new Error(usage());

  const resolvedArtifactDir = path.resolve(process.cwd(), artifactDir);
  const manifestPath = path.join(resolvedArtifactDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertValidManifest(manifest);

  await writeFile(
    path.join(resolvedArtifactDir, "stagehand-example.ts"),
    emitStagehandExample(manifest),
    "utf8",
  );
  console.log(`Generated Stagehand example at ${path.join(resolvedArtifactDir, "stagehand-example.ts")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
