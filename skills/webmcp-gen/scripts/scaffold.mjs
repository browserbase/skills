#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const [slug, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { slug, flags };
}

function usage() {
  return "Usage: scaffold.mjs <domain>/<task> --url <url> [--out artifacts]";
}

function parseSlug(slug) {
  const parts = String(slug || "").split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Slug must be <domain>/<task> with exactly one slash.\n\n${usage()}`);
  }
  for (const part of parts) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)) {
      throw new Error(
        `Invalid slug segment "${part}". Each segment must start with a letter or digit and contain only letters, digits, dot, dash, or underscore (no path traversal).\n\n${usage()}`
      );
    }
  }
  return { domain: parts[0], task: parts[1] };
}

function artifactDirFor(slug, outRoot) {
  return path.resolve(process.cwd(), outRoot || "artifacts", slug);
}

function toolNameFor(domain, task) {
  // Keep within compile.mjs's 1-80 char tool-name limit so a scaffolded
  // manifest never fails compile on an over-long generated name.
  return `${domain}_${task}`
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
    .replace(/_+$/, "");
}

async function main() {
  const { slug, flags } = parseArgs(process.argv.slice(2));
  const url = typeof flags.url === "string" ? flags.url : undefined;
  if (!slug || !url) throw new Error(usage());

  const { domain, task } = parseSlug(slug);
  const artifactDir = artifactDirFor(slug, typeof flags.out === "string" ? flags.out : undefined);
  await mkdir(artifactDir, { recursive: true });

  const manifest = {
    domain,
    task,
    url,
    generatedAt: new Date().toISOString(),
    tools: [
      {
        name: toolNameFor(domain, task),
        description: "Returns basic page context. Use this scaffold to validate WebMCP injection.",
        inputSchema: {
          type: "object",
          properties: {
            echo: {
              type: "string",
              description: "Optional value to echo in the response."
            }
          },
          additionalProperties: true
        },
        implementation: {
          kind: "dom",
          source: `return {
  success: true,
  echo: input.echo ?? null,
  page: {
    title: document.title,
    url: location.href,
    h1: document.querySelector("h1")?.textContent?.trim() ?? null
  }
};`
        },
        fixtureInput: {
          echo: "webmcp-gen validation"
        }
      }
    ]
  };

  await writeFile(path.join(artifactDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Created WebMCP artifact at ${artifactDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
