export type QueueItemStatus =
  | 'queued'
  | 'dialing'
  | 'connected'
  | 'completed'
  | 'skipped'
  | 'failed';

export type BotPhase = 'idle' | 'dialing' | 'connected' | 'cooldown' | 'finished';

export type MicLockMode = 'always_during_call' | 'on_connect';

export type MicHardwareStatus =
  | 'uninitialized'
  | 'granted'
  | 'denied'
  | 'unavailable';

export interface QueueItem {
  id: string;
  phone: string;
  name: string;
  status: QueueItemStatus;
  customDurationSec: number | null;
  lastCallDurationSec: number | null;
  micWasLocked: boolean;
  attempts: number;
  updatedAt: string | null;
}

export interface BotSettings {
  callDurationSec: number;
  cooldownSec: number;
  ringDurationSec: number;
  autoMuteMic: boolean;
  micLockMode: MicLockMode;
  playDtmfTones: boolean;
  playRingbackTone: boolean;
  webhookUrl: string;
  loopQueue: boolean;
}

export interface CallRecord {
  id: string;
  itemId: string;
  phone: string;
  name: string;
  startedAt: string;
  endedAt: string;
  configuredDurationSec: number;
  actualDurationSec: number;
  outcome: 'completed' | 'skipped' | 'stopped' | 'failed';
  micLocked: boolean;
  micManualOverrideUsed: boolean;
  webhookDelivered: boolean | null;
}

export interface QueueStats {
  total: number;
  queued: number;
  completed: number;
  skipped: number;
  failed: number;
  totalTalkSec: number;
}
