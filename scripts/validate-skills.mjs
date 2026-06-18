#!/usr/bin/env node
/**
 * validate-skills.mjs — validate every skills/<name>/ dir against the repo's
 * agent-skills standards. Zero dependencies; Node 20+.
 *
 * Usage:
 *   node scripts/validate-skills.mjs            # validate all skills
 *   node scripts/validate-skills.mjs --skill browser
 *
 * Exit code 0 when only warnings are found, 1 on any error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const SKILLS_DIR = join(ROOT, "skills");
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_MD_LINES = 500;
const BANNED_ENTRIES = ["setup.json", "node_modules"];

// ---------------------------------------------------------------------------
// Minimal strict frontmatter parser
//
// Supports the subset used in this repo: `key: value` scalars (optionally
// quoted), `key: |` block scalars, nested maps, and lists of scalars or maps.
// Anything else is a parse error.
// ---------------------------------------------------------------------------

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = value.slice(1, -1);
      return first === '"'
        ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : inner;
    }
  }
  return value;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function parseMap(lines, indent) {
  const map = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    if (indentOf(line) !== indent) {
      throw new Error(`unexpected indentation: "${line.trim()}"`);
    }
    const match = line.trim().match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) {
      throw new Error(`cannot parse line: "${line.trim()}"`);
    }
    const key = match[1];
    if (key in map) {
      throw new Error(`duplicate key "${key}"`);
    }
    const value = match[2].trim();
    i += 1;

    // Collect lines indented deeper than the current key.
    const children = [];
    while (i < lines.length) {
      const child = lines[i];
      if (!child.trim() || indentOf(child) > indent) {
        children.push(child);
        i += 1;
      } else {
        break;
      }
    }
    const nonEmpty = children.filter((l) => l.trim());

    if (value === "|" || value === "|-" || value === ">" || value === ">-") {
      if (nonEmpty.length === 0) {
        throw new Error(`empty block scalar for key "${key}"`);
      }
      const childIndent = Math.min(...nonEmpty.map(indentOf));
      map[key] = children
        .map((l) => l.slice(childIndent))
        .join("\n")
        .trim();
    } else if (value === "") {
      if (nonEmpty.length === 0) {
        map[key] = "";
      } else {
        const childIndent = Math.min(...nonEmpty.map(indentOf));
        map[key] = nonEmpty[0].trim().startsWith("-")
          ? parseList(nonEmpty, childIndent)
          : parseMap(nonEmpty, childIndent);
      }
    } else {
      if (nonEmpty.length > 0) {
        throw new Error(`unexpected indented block under "${key}: ${value}"`);
      }
      map[key] = unquote(value);
    }
  }
  return map;
}

function parseList(lines, indent) {
  const items = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (indentOf(line) !== indent || !line.trim().startsWith("-")) {
      throw new Error(`cannot parse list item: "${line.trim()}"`);
    }
    const rest = line.trim().replace(/^-\s*/, "");
    i += 1;

    const children = [];
    while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > indent)) {
      if (lines[i].trim()) children.push(lines[i]);
      i += 1;
    }

    if (children.length > 0) {
      // List item that is a map spanning multiple lines (`- kind: node` + more).
      const childIndent = indentOf(children[0]);
      const block = rest ? [" ".repeat(childIndent) + rest, ...children] : children;
      items.push(parseMap(block, childIndent));
    } else if (/^[A-Za-z0-9_-]+:(\s|$)/.test(rest)) {
      items.push(parseMap([rest], 0));
    } else {
      items.push(unquote(rest));
    }
  }
  return items;
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { error: "file does not start with a `---` frontmatter block" };
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    return { error: "frontmatter block is not closed with `---`" };
  }
  try {
    return { data: parseMap(lines.slice(1, end), 0) };
  } catch (err) {
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkLicenseFile(skillDir, errors) {
  const licensePath = join(skillDir, "LICENSE.txt");
  if (!existsSync(licensePath)) {
    errors.push("LICENSE.txt is missing");
    return;
  }
  const text = readFileSync(licensePath, "utf8");
  if (!/\bMIT License\b/.test(text)) {
    errors.push("LICENSE.txt is not an MIT license (no `MIT License` header)");
  }
  const copyrightLine = text
    .split(/\r?\n/)
    .find((line) => /^copyright/i.test(line.trim()));
  if (!copyrightLine) {
    errors.push("LICENSE.txt has no copyright line");
  } else if (!copyrightLine.includes("Browserbase, Inc.")) {
    errors.push(
      `LICENSE.txt copyright line must contain "Browserbase, Inc." (found "${copyrightLine.trim()}")`,
    );
  }
}

function checkBannedFiles(skillDir, errors, relative = "") {
  const dir = join(skillDir, relative);
  for (const entry of readdirSync(dir)) {
    const relPath = relative ? `${relative}/${entry}` : entry;
    const fullPath = join(dir, entry);
    const isDir = statSync(fullPath).isDirectory();
    if (BANNED_ENTRIES.includes(entry) || entry.startsWith(".env")) {
      errors.push(`banned file: ${relPath}${isDir ? "/" : ""}`);
      continue; // do not descend into banned directories
    }
    if (isDir) {
      checkBannedFiles(skillDir, errors, relPath);
    }
  }
}

function checkFrontmatter(name, skillDir, errors, warnings) {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    errors.push("SKILL.md is missing");
    return;
  }
  const content = readFileSync(skillMdPath, "utf8");
  const { data, error } = parseFrontmatter(content);
  if (error) {
    errors.push(`SKILL.md frontmatter: ${error}`);
    return;
  }

  if (!data.name) {
    errors.push("frontmatter `name` is missing");
  } else if (data.name !== name) {
    errors.push(
      `frontmatter \`name\` ("${data.name}") does not match directory name ("${name}")`,
    );
  }

  if (typeof data.description !== "string" || data.description.trim() === "") {
    errors.push("frontmatter `description` is missing or empty");
  } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `frontmatter \`description\` is ${data.description.length} chars (max ${MAX_DESCRIPTION_LENGTH})`,
    );
  }

  if (!("license" in data)) {
    errors.push("frontmatter `license` is missing (must be `MIT`)");
  } else if (data.license !== "MIT") {
    errors.push(`frontmatter \`license\` must be "MIT" (found "${data.license}")`);
  }

  if (!("compatibility" in data)) {
    warnings.push("frontmatter `compatibility` is missing");
  }
  if (!("allowed-tools" in data)) {
    warnings.push("frontmatter `allowed-tools` is missing");
  }

  const lineCount = content.split(/\r?\n/).length;
  const hasReference =
    existsSync(join(skillDir, "REFERENCE.md")) ||
    existsSync(join(skillDir, "references"));
  if (lineCount > MAX_SKILL_MD_LINES && !hasReference) {
    warnings.push(
      `SKILL.md is ${lineCount} lines (>${MAX_SKILL_MD_LINES}) with no REFERENCE.md or references/ split`,
    );
  }
}

function readmeLinkedSkills() {
  const readmePath = join(ROOT, "README.md");
  if (!existsSync(readmePath)) return new Set();
  const readme = readFileSync(readmePath, "utf8");
  const linked = new Set();
  for (const match of readme.matchAll(/\(skills\/([^/)]+)\/SKILL\.md\)/g)) {
    linked.add(match[1]);
  }
  return linked;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  let only = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--skill") {
      only = args[i + 1];
      if (!only) {
        console.error("error: --skill requires a skill name");
        process.exit(1);
      }
      i += 1;
    } else {
      console.error(`error: unknown argument "${args[i]}"`);
      console.error("usage: node scripts/validate-skills.mjs [--skill <name>]");
      process.exit(1);
    }
  }

  const allSkills = readdirSync(SKILLS_DIR)
    .filter((entry) => statSync(join(SKILLS_DIR, entry)).isDirectory())
    .sort();

  if (only && !allSkills.includes(only)) {
    console.error(`error: skill "${only}" not found in skills/`);
    process.exit(1);
  }
  const skills = only ? [only] : allSkills;
  const linked = readmeLinkedSkills();

  let errorCount = 0;
  let warningCount = 0;
  let failedSkills = 0;

  for (const name of skills) {
    const skillDir = join(SKILLS_DIR, name);
    const errors = [];
    const warnings = [];

    checkFrontmatter(name, skillDir, errors, warnings);
    checkLicenseFile(skillDir, errors);
    checkBannedFiles(skillDir, errors);
    if (!linked.has(name)) {
      errors.push(`README.md table has no row linking skills/${name}/SKILL.md`);
    }

    const status = errors.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "OK";
    console.log(`[${status.padEnd(4)}] ${name}`);
    for (const error of errors) console.log(`  error: ${error}`);
    for (const warning of warnings) console.log(`  warning: ${warning}`);

    errorCount += errors.length;
    warningCount += warnings.length;
    if (errors.length > 0) failedSkills += 1;
  }

  // Repo-level check: README rows must not point at nonexistent skill dirs.
  if (!only) {
    const stale = [...linked].filter((name) => !allSkills.includes(name)).sort();
    if (stale.length > 0) {
      console.log("[FAIL] README.md");
      for (const name of stale) {
        console.log(`  error: README.md links to nonexistent skill dir skills/${name}/`);
        errorCount += 1;
      }
    }
  }

  console.log("");
  console.log(
    `${skills.length} skill(s) checked: ${skills.length - failedSkills} passed, ` +
      `${failedSkills} failed, ${errorCount} error(s), ${warningCount} warning(s)`,
  );
  process.exit(errorCount > 0 ? 1 : 0);
}

main();
