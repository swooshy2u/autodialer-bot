import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  formatPhoneDisplay,
  generateCsvReport,
  isValidPhoneNumber,
  normalizePhoneNumber,
  parsePhoneList,
} from './phoneParser';

test('normalizePhoneNumber normalizes Russian 8/7/10-digit formats', () => {
  assert.equal(normalizePhoneNumber('8 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhoneNumber('79161112233'), '+79161112233');
  assert.equal(normalizePhoneNumber('9265550199'), '+79265550199');
  assert.equal(normalizePhoneNumber('+1 415 555 0199'), '+14155550199');
});

test('isValidPhoneNumber rejects too short or empty values', () => {
  assert.equal(isValidPhoneNumber('+79991234567'), true);
  assert.equal(isValidPhoneNumber('12345'), false);
  assert.equal(isValidPhoneNumber('abc'), false);
});

test('parsePhoneList parses valid entries, names, invalid lines, and deduplicates', () => {
  const input = [
    '+7 999 111-22-33; Иван Петров',
    '89162223344, Ольга',
    'Сергей - +79035556677',
    '89991112233', // duplicate of first line after normalization
    'неверный-номер',
  ].join('\n');

  const result = parsePhoneList(input, ['+79260000000']);
  assert.equal(result.valid.length, 3);
  assert.deepEqual(result.valid[0], { phone: '+79991112233', name: 'Иван Петров' });
  assert.deepEqual(result.valid[1], { phone: '+79162223344', name: 'Ольга' });
  assert.deepEqual(result.valid[2], { phone: '+79035556677', name: 'Сергей' });
  assert.equal(result.duplicates, 1);
  assert.deepEqual(result.invalid, ['неверный-номер']);
});

test('formatPhoneDisplay and formatDuration format outputs cleanly', () => {
  assert.equal(formatPhoneDisplay('+79991234567'), '+7 (999) 123-45-67');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(0), '00:00');
});

test('generateCsvReport formats semicolon CSV with Russian headers', () => {
  const csv = generateCsvReport([
    {
      id: 'rec-1',
      itemId: 'item-1',
      phone: '+79991234567',
      name: 'Тест',
      startedAt: '2026-11-17T10:00:00Z',
      endedAt: '2026-11-17T10:00:15Z',
      configuredDurationSec: 15,
      actualDurationSec: 15,
      outcome: 'completed',
      micLocked: true,
      micManualOverrideUsed: false,
      webhookDelivered: null,
    },
  ]);

  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Микрофон заблокирован/);
  assert.match(lines[1], /\+79991234567;Тест;.*;15;15;completed;Да;Нет/);
});
