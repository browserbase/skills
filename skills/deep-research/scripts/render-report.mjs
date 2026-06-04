#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const FENCE = String.fromCharCode(96).repeat(3);
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

if (!args.input && !args.sample) {
  printUsage();
  process.exitCode = 1;
} else if (!args.output) {
  console.error('Missing required --output <report.pdf>');
  process.exitCode = 1;
} else {
  try {
    await main(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function main(options) {
  const outputPath = path.resolve(options.output);
  const markdown = options.sample
    ? sampleReport(options.sample)
    : await fs.readFile(path.resolve(options.input), 'utf8');
  const title = options.title || inferTitle(markdown) || 'Deep Research Report';
  const html = renderHtmlDocument(markdown, title);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (options.html) {
    const htmlPath = path.resolve(options.html);
    await fs.mkdir(path.dirname(htmlPath), { recursive: true });
    await fs.writeFile(htmlPath, html);
  }

  const opened = await openBrowser({ local: options.local });
  try {
    const context = opened.browser.contexts()[0] || (await opened.browser.newContext());
    const page = context.pages()[0] || (await context.newPage());

    try {
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
    } catch {
      // Browserbase can report a setContent timeout after the DOM is available.
    }

    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '18mm',
        right: '15mm',
        bottom: '18mm',
        left: '15mm',
      },
    });
  } finally {
    await opened.browser.close().catch(() => {});
  }

  console.log(JSON.stringify({ ok: true, mode: opened.mode, output: outputPath }, null, 2));
}

async function openBrowser({ local }) {
  const { chromium } = await import('playwright');

  if (!local) {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) {
      throw new Error('BROWSERBASE_API_KEY is required for Browserbase PDF rendering. Re-run with --local to use local Chrome for a smoke test.');
    }

    const browserbaseModule = await import('@browserbasehq/sdk');
    const Browserbase =
      browserbaseModule.default || browserbaseModule.Browserbase || browserbaseModule;
    const bb = new Browserbase({ apiKey });
    const session = await bb.sessions.create({});
    const browser = await chromium.connectOverCDP(session.connectUrl);
    return { browser, mode: 'browserbase' };
  }

  try {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    return { browser, mode: 'local-chrome' };
  } catch {
    const browser = await chromium.launch({ headless: true });
    return { browser, mode: 'local-playwright' };
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--local') parsed.local = true;
    else if (arg === '--input') parsed.input = argv[++i];
    else if (arg === '--output') parsed.output = argv[++i];
    else if (arg === '--title') parsed.title = argv[++i];
    else if (arg === '--html') parsed.html = argv[++i];
    else if (arg === '--sample') parsed.sample = argv[++i] || 'general';
    else throw new Error('Unknown argument: ' + arg);
  }
  return parsed;
}

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/render-report.mjs --input report.md --output report.pdf [--title "Title"] [--html report.html]',
    '  node scripts/render-report.mjs --sample general --output /tmp/deep-research-sample.pdf --local',
    '',
    'Options:',
    '  --input <path>    Markdown research report to render.',
    '  --output <path>   PDF path to write.',
    '  --title <text>    PDF HTML title. Defaults to the first markdown H1.',
    '  --html <path>     Also write the intermediate styled HTML.',
    '  --local           Use local Chrome instead of Browserbase. Intended for smoke tests.',
    '  --sample <mode>   Render an internal sample report: general, prospect, or contradiction.',
  ].join('\n'));
}

function inferTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function renderHtmlDocument(markdown, title) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8">',
    '  <title>' + escapeHtml(title) + '</title>',
    '  <style>',
    '    @page { size: A4; }',
    '    * { box-sizing: border-box; }',
    '    body { color: #18202a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.55; margin: 0 auto; max-width: 820px; padding: 34px 20px 46px; }',
    '    h1, h2, h3, h4 { color: #111827; line-height: 1.2; margin: 0 0 10px; page-break-after: avoid; }',
    '    h1 { border-bottom: 2px solid #d9e0e8; font-size: 28px; padding-bottom: 12px; }',
    '    h2 { border-bottom: 1px solid #e5e9ef; font-size: 20px; margin-top: 28px; padding-bottom: 6px; }',
    '    h3 { font-size: 16px; margin-top: 22px; }',
    '    h4 { font-size: 14px; margin-top: 18px; }',
    '    p { margin: 0 0 12px; }',
    '    a { color: #075985; text-decoration: none; overflow-wrap: anywhere; }',
    '    code { background: #f3f6f8; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 1px 4px; }',
    '    pre { background: #f3f6f8; border: 1px solid #e0e5eb; border-radius: 6px; overflow-x: auto; padding: 12px; white-space: pre-wrap; }',
    '    pre code { background: transparent; padding: 0; }',
    '    blockquote { border-left: 4px solid #ccd6e0; color: #4b5563; margin: 0 0 12px; padding: 2px 0 2px 12px; }',
    '    table { border-collapse: collapse; margin: 12px 0 18px; page-break-inside: avoid; width: 100%; }',
    '    th, td { border: 1px solid #ccd6e0; padding: 7px 9px; text-align: left; vertical-align: top; }',
    '    th { background: #f5f7fa; font-weight: 650; }',
    '    ul, ol { margin: 0 0 12px 22px; padding: 0; }',
    '    li { margin: 3px 0; }',
    '    hr { border: 0; border-top: 1px solid #e5e9ef; margin: 22px 0; }',
    '    .citation { color: #075985; font-weight: 600; }',
    '  </style>',
    '</head>',
    '<body>',
    renderMarkdown(markdown),
    '</body>',
    '</html>',
  ].join('\n');
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push('<p>' + renderInline(paragraph.join(' ')) + '</p>');
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push('</' + listType + '>');
    listType = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith(FENCE)) {
      if (inCode) {
        html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    if (/^\s*\|.+\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1] || '')) {
      flushParagraph();
      closeList();
      const tableResult = renderTable(lines, i);
      html.push(tableResult.tableHtml);
      i = tableResult.nextIndex;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push('<h' + level + '>' + renderInline(heading[2].trim()) + '</h' + level + '>');
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr>');
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) {
        closeList();
        html.push('<' + nextType + '>');
        listType = nextType;
      }
      html.push('<li>' + renderInline((unordered || ordered)[1]) + '</li>');
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push('<blockquote>' + renderInline(quote[1]) + '</blockquote>');
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode) html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
  flushParagraph();
  closeList();

  return html.join('\n');
}

function renderTable(lines, startIndex) {
  const rows = [];
  let i = startIndex;
  while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
    rows.push(splitTableRow(lines[i]));
    i++;
  }

  const header = rows[0] || [];
  const body = rows.slice(2);
  const parts = ['<table>', '<thead><tr>'];
  for (const cell of header) parts.push('<th>' + renderInline(cell) + '</th>');
  parts.push('</tr></thead>', '<tbody>');
  for (const row of body) {
    parts.push('<tr>');
    for (const cell of row) parts.push('<td>' + renderInline(cell) + '</td>');
    parts.push('</tr>');
  }
  parts.push('</tbody>', '</table>');

  return { tableHtml: parts.join(''), nextIndex: i - 1 };
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderInline(text) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeHref = sanitizeHref(unescapeHtml(href.trim()));
    if (!safeHref) return label;
    return '<a href="' + escapeAttr(safeHref) + '">' + label + '</a>';
  });
  escaped = escaped.replace(/\[(F\d+)\]/g, '<span class="citation">[$1]</span>');
  return escaped;
}

function sanitizeHref(href) {
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
      return url.href;
    }
  } catch {}
  return null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function unescapeHtml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function sampleReport(mode) {
  if (mode === 'prospect') {
    return [
      '# Example Prospect Research',
      '',
      '## Executive Summary',
      '',
      'ExampleCo appears to be a workflow automation company with public hiring signals around browser automation [F1].',
      '',
      '## Quick Facts',
      '',
      '| Field | Value |',
      '|-------|-------|',
      '| Company | ExampleCo |',
      '| Segment | Workflow Automation |',
      '| Confidence | Medium |',
      '',
      '## Why Browserbase',
      '',
      '- ExampleCo job posts mention Playwright-based browser workflows [F1].',
      '- A product launch describes web actions that need reliable remote browser sessions [F2].',
      '',
      '## Bibliography',
      '',
      '1. [F1] ExampleCo Careers: https://example.com/careers',
      '2. [F2] ExampleCo Launch Notes: https://example.com/blog/launch',
    ].join('\n');
  }

  if (mode === 'contradiction') {
    return [
      '# Example Contradiction Report',
      '',
      '## Executive Summary',
      '',
      'Two sources disagree on the launch timing: one says Q1 and another says Q2 [F1] [F2].',
      '',
      '## Timeline',
      '',
      'Source A dates the launch to Q1 [F1]. Source B dates the same launch to Q2 [F2].',
      '',
      '## Gaps and Contradictions',
      '',
      '- The sources disagree on launch timing, and neither includes a precise day.',
      '',
      '## Bibliography',
      '',
      '1. [F1] Source A: https://example.com/a',
      '2. [F2] Source B: https://example.com/b',
    ].join('\n');
  }

  return [
    '# Example Deep Research Report',
    '',
    '## Executive Summary',
    '',
    'Browserbase-backed research should plan questions, gather sources, record findings, and synthesize only cited claims [F1].',
    '',
    '## Research Workflow',
    '',
    '1. Plan focused sub-questions.',
    '2. Search and fetch likely sources.',
    '3. Use browser fallback when static fetch is thin.',
    '4. Record findings with source URLs.',
    '',
    '## Finding Quality',
    '',
    'The finding ledger prevents uncited synthesis by keeping each claim tied to a source URL and confidence level [F2].',
    '',
    '## Bibliography',
    '',
    '1. [F1] Deep research app architecture: https://example.com/deep-research',
    '2. [F2] Finding ledger example: https://example.com/findings',
  ].join('\n');
}
