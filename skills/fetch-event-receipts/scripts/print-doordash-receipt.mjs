#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Keep generated files private while preserving the owner execute bit that
// private directories need for traversal: files become 0600, directories 0700.
process.umask(0o077);

class ReceiptError extends Error {
  constructor(stage, code, details = {}) {
    super(code);
    this.stage = stage;
    this.code = code;
    this.failedChecks = Array.isArray(details.failedChecks)
      ? details.failedChecks
      : [];
  }
}

const fail = (stage, code, details) => {
  throw new ReceiptError(stage, code, details);
};

function parseArguments(argv) {
  const values = { output: "", targetId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--output") values.output = argv[++index] ?? "";
    else if (flag === "--target-id") values.targetId = argv[++index] ?? "";
    else fail("input", "unknown_argument");
  }
  return values;
}

function commandOutput(command, args, code) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) fail("artifact", code);
  return result.stdout;
}

async function loadBrowseStagehand() {
  let browseEntrypoint;
  try {
    const browseExecutable = execFileSync("which", ["browse"], {
      encoding: "utf8",
    }).trim();
    browseEntrypoint = realpathSync(browseExecutable);
  } catch {
    fail("input", "browse_cli_unavailable");
  }

  try {
    const browseRequire = createRequire(browseEntrypoint);
    const stagehandEntrypoint = browseRequire.resolve("@browserbasehq/stagehand");
    const stagehandModule = await import(pathToFileURL(stagehandEntrypoint).href);
    if (typeof stagehandModule.Stagehand !== "function") {
      fail("input", "browse_driver_unavailable");
    }
    return stagehandModule.Stagehand;
  } catch (error) {
    if (error instanceof ReceiptError) throw error;
    fail("input", "browse_driver_unavailable");
  }
}

const {
  output,
  targetId,
} = parseArguments(process.argv.slice(2));
const connectUrl = process.env.BROWSERBASE_CONNECT_URL || "";
let stagehandContext;
let printPage;
let mediaChanged = false;
let workdir = "";
let outputPath = "";

try {
  if (!/^wss?:\/\//i.test(connectUrl)) fail("input", "invalid_cdp_url");
  if (!/^[0-9a-f]{16,64}$/i.test(targetId)) fail("input", "invalid_target_id");
  if (!output || !isAbsolute(output) || !/\.pdf$/i.test(output)) {
    fail("input", "invalid_output_path");
  }
  outputPath = resolve(output);
  if (existsSync(outputPath)) fail("input", "output_already_exists");
  const outputParent = dirname(outputPath);
  if (!existsSync(outputParent) || !statSync(outputParent).isDirectory()) {
    fail("input", "output_parent_unavailable");
  }

  workdir = mkdtempSync(join(outputParent, ".receipt-print-"));
  chmodSync(workdir, 0o700);
  const rawPdfPath = join(workdir, "raw.pdf");
  const candidatePath = join(workdir, "candidate.pdf");

  // Browse already owns navigation and selection. Reuse the exact Stagehand
  // driver bundled with the installed Browse CLI, connect to the same remote
  // browser, and address only the target that Browse reports as active.
  const Stagehand = await loadBrowseStagehand();
  const stagehand = new Stagehand({
    disablePino: true,
    env: "LOCAL",
    localBrowserLaunchOptions: { cdpUrl: connectUrl },
    verbose: 0,
  });
  await stagehand.init();
  stagehandContext = stagehand.context;
  if (!stagehandContext) fail("print", "browse_driver_connection_failed");

  printPage = stagehandContext.pages().find((page) => page.targetId() === targetId);
  if (!printPage) fail("print", "browse_target_unavailable");
  let targetUrl;
  try {
    targetUrl = new URL(printPage.url());
  } catch {
    fail("print", "browse_target_unavailable");
  }
  if ((targetUrl.hostname !== "doordash.com"
      && !targetUrl.hostname.endsWith(".doordash.com"))
      || !targetUrl.pathname.startsWith("/orders/")) {
    fail("print", "browse_target_not_receipt");
  }

  await printPage.sendCDP("Page.enable");
  await printPage.sendCDP("Emulation.setEmulatedMedia", { media: "print" });
  mediaChanged = true;
  await printPage.sendCDP("Runtime.evaluate", {
    expression: "document.fonts?.ready || Promise.resolve()",
    awaitPromise: true,
  });
  const printed = await printPage.sendCDP("Page.printToPDF", {
    landscape: false,
    displayHeaderFooter: false,
    printBackground: true,
    preferCSSPageSize: false,
    paperWidth: 8.5,
    paperHeight: 11,
    marginTop: 0.35,
    marginBottom: 0.35,
    marginLeft: 0.35,
    marginRight: 0.35,
    scale: 1,
    transferMode: "ReturnAsBase64",
  });
  if (!printed.data || printed.stream) fail("print", "pdf_data_unavailable");
  writeFileSync(rawPdfPath, Buffer.from(printed.data, "base64"), {
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(rawPdfPath, 0o600);

  await printPage.sendCDP("Emulation.setEmulatedMedia", { media: "screen" });
  mediaChanged = false;

  const initialBytes = statSync(rawPdfPath).size;
  const compressionApplied = initialBytes > 3 * 1024 * 1024;
  if (compressionApplied) {
    const pagePrefix = join(workdir, "page");
    commandOutput("pdftocairo", [
      "-jpeg",
      "-r",
      "110",
      "-jpegopt",
      "quality=55,progressive=y,optimize=y",
      rawPdfPath,
      pagePrefix,
    ], "pdf_compression_failed");
    const pageImages = readdirSync(workdir)
      .filter((name) => /^page-\d+\.jpg$/.test(name))
      .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]))
      .map((name) => join(workdir, name));
    if (pageImages.length === 0) fail("artifact", "pdf_compression_failed");
    const pagePdfs = [];
    for (const imagePath of pageImages) {
      const outputBase = imagePath.slice(0, -4);
      commandOutput("tesseract", [imagePath, outputBase, "pdf"], "pdf_ocr_failed");
      pagePdfs.push(`${outputBase}.pdf`);
    }
    commandOutput("pdfunite", [...pagePdfs, candidatePath], "pdf_compression_failed");
  } else {
    renameSync(rawPdfPath, candidatePath);
  }
  chmodSync(candidatePath, 0o600);

  const bytes = statSync(candidatePath).size;
  if (bytes <= 0) fail("artifact", "pdf_data_unavailable");
  const encodedBytes = Math.ceil(bytes / 3) * 4;

  renameSync(candidatePath, outputPath);
  chmodSync(outputPath, 0o600);
  console.log(JSON.stringify({
    ok: true,
    stage: "complete",
    artifact: {
      kind: "pdf",
      provenance: "browse_cdp_page_print_to_pdf",
      bytes,
      encodedBytes,
      compressionApplied,
      compressionMethod: compressionApplied
        ? "jpeg_110dpi_q55_with_ocr_text"
        : null,
    },
    checks: {},
  }));
} catch (error) {
  if (outputPath && existsSync(outputPath)) unlinkSync(outputPath);
  const failure = {
    ok: false,
    stage: error instanceof ReceiptError ? error.stage : "unexpected",
    code: error instanceof ReceiptError ? error.code : "print_receipt_failed",
  };
  // Emit one small structured result so the narrating agent can report it.
  console.log(JSON.stringify(failure));
  process.exitCode = 1;
} finally {
  if (printPage && mediaChanged) {
    await printPage.sendCDP(
      "Emulation.setEmulatedMedia",
      { media: "screen" },
    ).catch(() => {});
  }
  await stagehandContext?.close().catch(() => {});
  if (workdir && existsSync(workdir)) rmSync(workdir, { recursive: true, force: true });
}
