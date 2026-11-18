import type { CallRecord } from '../types/dialer';

export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  // Normalize Russian 11-digit numbers starting with 8 to +7
  if (!hasLeadingPlus && digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }
  if (!hasLeadingPlus && digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }
  if (!hasLeadingPlus && digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }

  return hasLeadingPlus ? `+${digits}` : `+${digits}`;
}

export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  if (phone.startsWith('+')) {
    return phone;
  }
  return `+${digits}`;
}

export interface ParsedPhoneEntry {
  phone: string;
  name: string;
}

export interface ParsePhoneListResult {
  valid: ParsedPhoneEntry[];
  invalid: string[];
  duplicates: number;
}

export function parsePhoneList(
  input: string,
  existingPhones: Iterable<string> = [],
): ParsePhoneListResult {
  const seen = new Set<string>();
  for (const existing of existingPhones) {
    const norm = normalizePhoneNumber(existing);
    if (norm) seen.add(norm);
  }

  const valid: ParsedPhoneEntry[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    // Support separators: ; , \t or " - " between phone and name
    const parts = line.split(/[;\t,]|(?:\s+-\s+)/).map((p) => p.trim());
    const firstPart = parts[0] ?? '';
    const secondPart = parts.slice(1).join(' ').trim();

    let rawPhone = firstPart;
    let name = secondPart;

    // If user wrote "Name; +79991234567", detect which part is phone
    if (!isValidPhoneNumber(firstPart) && isValidPhoneNumber(secondPart)) {
      rawPhone = secondPart;
      name = firstPart;
    }

    const normalized = normalizePhoneNumber(rawPhone);
    if (!isValidPhoneNumber(normalized)) {
      invalid.push(line);
      continue;
    }

    if (seen.has(normalized)) {
      duplicates += 1;
      continue;
    }

    seen.add(normalized);
    valid.push({
      phone: normalized,
      name: name || '',
    });
  }

  return { valid, invalid, duplicates };
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function generateCsvReport(records: CallRecord[]): string {
  const header = [
    'ID',
    'Номер',
    'Контакт',
    'Начало',
    'Завершение',
    'Лимит (сек)',
    'Факт (сек)',
    'Результат',
    'Микрофон заблокирован',
    'Ручная разблокировка',
  ];

  const escapeCell = (value: string | number | boolean): string => {
    const str = String(value);
    if (/[",\n;]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map((r) => [
    r.id,
    r.phone,
    r.name || '—',
    r.startedAt,
    r.endedAt,
    r.configuredDurationSec,
    r.actualDurationSec,
    r.outcome,
    r.micLocked ? 'Да' : 'Нет',
    r.micManualOverrideUsed ? 'Да' : 'Нет',
  ]);

  return [header, ...rows].map((row) => row.map(escapeCell).join(';')).join('\n');
}
