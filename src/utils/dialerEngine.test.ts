import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampDuration,
  computeQueueStats,
  createDefaultSettings,
  createDemoQueue,
  getEffectiveDuration,
  getNextPendingItem,
  resetQueueForRestart,
  shouldLockMicrophone,
} from './dialerEngine';

test('clampDuration enforces bounds and rounds numbers', () => {
  assert.equal(clampDuration(1.2, 3, 3600), 3);
  assert.equal(clampDuration(5000, 3, 3600), 3600);
  assert.equal(clampDuration(14.6, 3, 3600), 15);
  assert.equal(clampDuration(Number.NaN, 3, 3600), 3);
});

test('shouldLockMicrophone enforces auto-mute across call phases', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.autoMuteMic, true);
  assert.equal(settings.micLockMode, 'always_during_call');

  assert.equal(shouldLockMicrophone('dialing', settings, false), true);
  assert.equal(shouldLockMicrophone('connected', settings, false), true);
  assert.equal(shouldLockMicrophone('idle', settings, false), false);
  assert.equal(shouldLockMicrophone('connected', settings, true), false);

  const onConnectOnly = { ...settings, micLockMode: 'on_connect' as const };
  assert.equal(shouldLockMicrophone('dialing', onConnectOnly, false), false);
  assert.equal(shouldLockMicrophone('connected', onConnectOnly, false), true);

  const disabled = { ...settings, autoMuteMic: false };
  assert.equal(shouldLockMicrophone('connected', disabled, false), false);
});

test('getNextPendingItem and getEffectiveDuration respect queue order and overrides', () => {
  const settings = createDefaultSettings();
  const queue = createDemoQueue();
  queue[0].status = 'completed';

  const next = getNextPendingItem(queue);
  assert.equal(next?.id, 'demo-2');
  assert.equal(getEffectiveDuration(queue[1], settings), 15);
  assert.equal(getEffectiveDuration(queue[2], settings), 20);
});

test('computeQueueStats aggregates statuses and total talk time', () => {
  const queue = createDemoQueue();
  queue[0].status = 'completed';
  queue[0].lastCallDurationSec = 15;
  queue[1].status = 'skipped';
  queue[1].lastCallDurationSec = 4;

  const stats = computeQueueStats(queue);
  assert.equal(stats.total, 4);
  assert.equal(stats.queued, 2);
  assert.equal(stats.completed, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.totalTalkSec, 19);
});

test('resetQueueForRestart resets all items back to queued', () => {
  const queue = createDemoQueue();
  queue[0].status = 'completed';
  queue[1].status = 'failed';
  const reset = resetQueueForRestart(queue);
  assert.equal(reset.every((item) => item.status === 'queued'), true);
});
