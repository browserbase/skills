// Unit tests for the stop-signal helper used by snapshot-loop.mjs.
//
// Run with:  node --test scripts/snapshot-loop.test.mjs
//
// The factory exposes `_trigger` so each test can stand in for the live
// SIGTERM/SIGINT handlers without touching the surrounding process.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStopSignal } from './snapshot-loop.mjs';

test('stopping is false until trigger fires', () => {
  const stop = createStopSignal();
  assert.equal(stop.stopping, false);
  stop._trigger();
  assert.equal(stop.stopping, true);
});

test('sleep wakes immediately when trigger fires mid-wait', async () => {
  const stop = createStopSignal();
  const startedAt = Date.now();
  const sleeping = stop.sleep(60_000);
  // Fire the stop on the next tick so the sleep is actually pending.
  setTimeout(() => stop._trigger(), 5);
  await sleeping;
  const waited = Date.now() - startedAt;
  assert.ok(
    waited < 1_000,
    `sleep should have aborted in well under a second, but waited ${waited} ms`,
  );
  assert.equal(stop.stopping, true);
});

test('sleep resolves immediately when trigger has already fired', async () => {
  const stop = createStopSignal();
  stop._trigger();
  const startedAt = Date.now();
  await stop.sleep(60_000);
  const waited = Date.now() - startedAt;
  assert.ok(
    waited < 100,
    `sleep should have returned synchronously after stopping, but waited ${waited} ms`,
  );
});

test('sleep without a trigger waits for the requested interval', async () => {
  const stop = createStopSignal();
  const startedAt = Date.now();
  await stop.sleep(80);
  const waited = Date.now() - startedAt;
  assert.ok(
    waited >= 70,
    `sleep should honor its interval when no trigger fires, but waited ${waited} ms`,
  );
  assert.equal(stop.stopping, false);
});

test('repeated triggers are idempotent', () => {
  const stop = createStopSignal();
  stop._trigger();
  stop._trigger();
  stop._trigger();
  assert.equal(stop.stopping, true);
});

test('completed sleeps deregister from the pending set so closures can be GC\'d', async () => {
  const stop = createStopSignal();
  assert.equal(stop._pendingCount(), 0);
  // Run many sleeps back-to-back so a per-sleep .then handler would
  // accumulate visibly on the stop promise's reaction list.
  for (let i = 0; i < 200; i++) {
    const p = stop.sleep(1);
    assert.equal(stop._pendingCount(), 1, `pending should be 1 mid-sleep on iteration ${i}`);
    await p;
    assert.equal(stop._pendingCount(), 0, `pending should drain to 0 after iteration ${i}`);
  }
});

test('trigger drains every still-pending sleep without leaking', async () => {
  const stop = createStopSignal();
  const sleeps = [stop.sleep(60_000), stop.sleep(60_000), stop.sleep(60_000)];
  assert.equal(stop._pendingCount(), 3);
  stop._trigger();
  assert.equal(stop._pendingCount(), 0);
  // All three resolve with no further input.
  await Promise.all(sleeps);
});
