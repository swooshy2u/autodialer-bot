import type {
  BotPhase,
  BotSettings,
  QueueItem,
  QueueStats,
} from '../types/dialer';

export const MIN_CALL_DURATION_SEC = 3;
export const MAX_CALL_DURATION_SEC = 3600;
export const MIN_COOLDOWN_SEC = 0;
export const MAX_COOLDOWN_SEC = 120;
export const MIN_RING_DURATION_SEC = 1;
export const MAX_RING_DURATION_SEC = 30;

export function clampDuration(value: number, min = MIN_CALL_DURATION_SEC, max = MAX_CALL_DURATION_SEC): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function createDefaultSettings(): BotSettings {
  return {
    callDurationSec: 15,
    cooldownSec: 2,
    ringDurationSec: 2,
    autoMuteMic: true,
    micLockMode: 'always_during_call',
    playDtmfTones: true,
    playRingbackTone: true,
    webhookUrl: '',
    loopQueue: false,
  };
}

export function createDemoQueue(): QueueItem[] {
  return [
    {
      id: 'demo-1',
      phone: '+79991102481',
      name: 'Алексей Морозов (Отдел продаж)',
      status: 'queued',
      customDurationSec: null,
      lastCallDurationSec: null,
      micWasLocked: false,
      attempts: 0,
      updatedAt: null,
    },
    {
      id: 'demo-2',
      phone: '+79164829015',
      name: 'Елена Соколова (Логистика)',
      status: 'queued',
      customDurationSec: null,
      lastCallDurationSec: null,
      micWasLocked: false,
      attempts: 0,
      updatedAt: null,
    },
    {
      id: 'demo-3',
      phone: '+79037551840',
      name: 'Сергей Волков (Служба поддержки)',
      status: 'queued',
      customDurationSec: 20,
      lastCallDurationSec: null,
      micWasLocked: false,
      attempts: 0,
      updatedAt: null,
    },
    {
      id: 'demo-4',
      phone: '+79263094412',
      name: 'Марина Кузнецова (Партнёр)',
      status: 'queued',
      customDurationSec: null,
      lastCallDurationSec: null,
      micWasLocked: false,
      attempts: 0,
      updatedAt: null,
    },
  ];
}

export function getEffectiveDuration(item: QueueItem, settings: BotSettings): number {
  const raw = item.customDurationSec ?? settings.callDurationSec;
  return clampDuration(raw, MIN_CALL_DURATION_SEC, MAX_CALL_DURATION_SEC);
}

export function getNextPendingItem(queue: QueueItem[]): QueueItem | null {
  return queue.find((item) => item.status === 'queued') ?? null;
}

export function shouldLockMicrophone(phase: BotPhase, settings: BotSettings, manualOverride: boolean): boolean {
  if (!settings.autoMuteMic) return false;
  if (manualOverride) return false;

  if (phase === 'dialing') {
    return settings.micLockMode === 'always_during_call';
  }
  if (phase === 'connected') {
    return true;
  }
  return false;
}

export function computeQueueStats(queue: QueueItem[]): QueueStats {
  let queued = 0;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let totalTalkSec = 0;

  for (const item of queue) {
    if (item.status === 'queued' || item.status === 'dialing' || item.status === 'connected') {
      queued += 1;
    } else if (item.status === 'completed') {
      completed += 1;
    } else if (item.status === 'skipped') {
      skipped += 1;
    } else if (item.status === 'failed') {
      failed += 1;
    }

    if (item.lastCallDurationSec && item.lastCallDurationSec > 0) {
      totalTalkSec += item.lastCallDurationSec;
    }
  }

  return {
    total: queue.length,
    queued,
    completed,
    skipped,
    failed,
    totalTalkSec,
  };
}

export function resetQueueForRestart(queue: QueueItem[]): QueueItem[] {
  return queue.map((item) => ({
    ...item,
    status: 'queued',
  }));
}
