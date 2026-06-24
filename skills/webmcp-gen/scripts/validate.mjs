#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Stagehand } from "@browserbasehq/stagehand";

function usage() {
  return "Usage: validate.mjs <artifact-dir>";
}

async function readManifest(artifactDir) {
  return JSON.parse(await readFile(path.join(artifactDir, "manifest.json"), "utf8"));
}

function outputLooksFailed(output) {
  return output !== null && typeof output === "object" && "success" in output && output.success === false;
}

async function writeEvalResult(artifactDir, result) {
  await writeFile(path.join(artifactDir, "eval.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const lines = [
    "# WebMCP Eval Report",
    "",
    `Status: ${result.status}`,
    `URL: ${result.url}`,
    "",
    "## Tools",
    ""
  ];
  for (const tool of result.tools) {
    lines.push(`- ${tool.name}: found=${tool.found} invoked=${tool.invoked} status=${tool.status ?? "n/a"}`);
    if (tool.error) lines.push(`  - error: ${tool.error}`);
  }
  if (result.errors.length) {
    lines.push("", "## Errors", "");
    for (const error of result.errors) lines.push(`- ${error}`);
  }
  await writeFile(path.join(artifactDir, "eval-report.md"), `${lines.join("\n")}\n`, "utf8");
}

async function validateArtifact(artifactDir) {
  const manifest = await readManifest(artifactDir);
  const scriptPath = path.join(artifactDir, "webmcp.init.js");
  const errors = [];
  const tools = [];

  if (!Array.isArray(manifest.tools)) {
    const result = {
      artifactDir,
      url: manifest.url,
      status: "failed",
      tools,
      errors: ["Manifest `tools` must be an array."]
    };
    await writeEvalResult(artifactDir, result);
    return result;
  }

  try {
    await access(scriptPath);
  } catch {
    const result = {
      artifactDir,
      url: manifest.url,
      status: "failed",
      tools,
      errors: [`Missing webmcp.init.js. Run compile.mjs ${artifactDir} first.`]
    };
    await writeEvalResult(artifactDir, result);
    return result;
  }

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    localBrowserLaunchOptions: {
      args: ["--enable-features=WebMCPTesting,DevToolsWebMCPSupport"]
    }
  });

  try {
    await stagehand.init();
    const page = stagehand.context.pages()[0] ?? (await stagehand.context.newPage());
    await page.addInitScript({ path: scriptPath });
    await page.goto(manifest.url, { waitUntil: "load" });

    const registeredTools = await page.listWebMCPTools({ timeoutMs: 5000 });

    for (const expectedTool of manifest.tools) {
      const foundTool = registeredTools.find((tool) => tool.name === expectedTool.name);
      if (!foundTool) {
        tools.push({
          name: expectedTool.name,
          found: false,
          invoked: false,
          error: "Tool was not registered."
        });
        continue;
      }

      try {
        const invocation = await page.invokeWebMCPTool(
          expectedTool.name,
          expectedTool.fixtureInput ?? {},
          { frameId: foundTool.frameId }
        );
        const result = await invocation.result;
        const failed = Boolean(result.errorText) || outputLooksFailed(result.output);
        const error = failed
          ? result.errorText || "Tool returned an output with success=false."
          : undefined;
        tools.push({
          name: expectedTool.name,
          found: true,
          invoked: true,
          status: result.status,
          output: result.output,
          ...(error ? { error } : {})
        });
      } catch (error) {
        tools.push({
          name: expectedTool.name,
          found: true,
          invoked: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await stagehand.close().catch(() => {});
  }

  if (manifest.tools.length === 0) {
    errors.push("Manifest declares no tools; nothing to validate.");
  }

  const status = errors.length === 0 &&
    manifest.tools.length > 0 &&
    tools.length === manifest.tools.length &&
    tools.every((tool) => tool.found && tool.invoked && tool.status === "Completed" && !tool.error)
    ? "passed"
    : "failed";

  const result = {
    artifactDir,
    url: manifest.url,
    status,
    tools,
    errors
  };
  await writeEvalResult(artifactDir, result);
  return result;
}

async function main() {
  const artifactDir = process.argv[2];
  if (!artifactDir) throw new Error(usage());
  const resolvedArtifactDir = path.resolve(process.cwd(), artifactDir);
  const result = await validateArtifact(resolvedArtifactDir);
  console.log(`Validation ${result.status}: ${resolvedArtifactDir}`);
  for (const tool of result.tools) {
    console.log(`- ${tool.name}: found=${tool.found} invoked=${tool.invoked} status=${tool.status ?? "n/a"}`);
    if (tool.error) console.log(`  error=${tool.error}`);
  }
  for (const error of result.errors) console.log(`Error: ${error}`);
  if (result.status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
