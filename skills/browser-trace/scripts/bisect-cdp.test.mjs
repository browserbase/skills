#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-trace-bisect-'));
const runId = 'run-1';
const runDir = path.join(root, runId);
const cdpDir = path.join(runDir, 'cdp');
fs.mkdirSync(cdpDir, { recursive: true });
fs.writeFileSync(
  path.join(runDir, 'manifest.json'),
  JSON.stringify({ run_id: runId, started_at: '2026-05-11T00:00:00Z', stopped_at: '2026-05-11T00:00:05Z' }),
);
fs.writeFileSync(
  path.join(cdpDir, 'raw.ndjson'),
  [
    { method: 'Page.frameNavigated', params: { timestamp: 1, frame: { id: 'f1', url: 'https://a.example/' } } },
    { method: 'Network.requestWillBeSent', params: { timestamp: 1.1, requestId: 'r1', type: 'Document', request: { url: 'https://a.example/slow' } } },
    { method: 'Page.frameNavigated', params: { timestamp: 1.2, frame: { id: 'f1', url: 'https://b.example/' } } },
    { method: 'Network.responseReceived', params: { timestamp: 1.3, requestId: 'r1', type: 'Document', response: { url: 'https://a.example/slow', status: 200 } } },
    { method: 'Network.loadingFinished', params: { timestamp: 1.4, requestId: 'r1' } },
  ].map(JSON.stringify).join('\n') + '\n',
);

try {
  execFileSync(process.execPath, [new URL('./bisect-cdp.mjs', import.meta.url).pathname, runId], {
    env: { ...process.env, O11Y_ROOT: root },
    stdio: 'pipe',
  });

  const page0Requests = fs.readFileSync(path.join(cdpDir, 'pages/000/network/requests.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  const page0Responses = fs.readFileSync(path.join(cdpDir, 'pages/000/network/responses.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  const page0Finished = fs.readFileSync(path.join(cdpDir, 'pages/000/network/finished.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  const page1NetworkDir = path.join(cdpDir, 'pages/001/network');

  assert.equal(page0Requests.length, 1);
  assert.equal(page0Responses.length, 1);
  assert.equal(page0Finished.length, 1);
  assert.equal(page0Responses[0].params.response.url, 'https://a.example/slow');
  assert.equal(fs.existsSync(page1NetworkDir), false);

  const page0Summary = JSON.parse(fs.readFileSync(path.join(cdpDir, 'pages/000/summary.json'), 'utf8'));
  const page1Summary = JSON.parse(fs.readFileSync(path.join(cdpDir, 'pages/001/summary.json'), 'utf8'));
  assert.equal(page0Summary.domains.Network.count, 3);
  assert.equal(page0Summary.network.requests, 1);
  assert.equal(page1Summary.domains?.Network, undefined);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
