import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  History,
  ListOrdered,
  Mic,
  MicOff,
  PhoneCall,
  Square,
  Upload,
} from 'lucide-react';
import { ActiveCallStage } from './components/ActiveCallStage';
import { BulkImportModal } from './components/BulkImportModal';
import { CallHistoryView } from './components/CallHistoryView';
import { QueuePanel } from './components/QueuePanel';
import { SettingsPanel } from './components/SettingsPanel';
import type {
  BotPhase,
  BotSettings,
  CallRecord,
  MicHardwareStatus,
  QueueItem,
} from './types/dialer';
import { audioController } from './utils/audioController';
import {
  computeQueueStats,
  createDefaultSettings,
  createDemoQueue,
  getEffectiveDuration,
  getNextPendingItem,
  resetQueueForRestart,
  shouldLockMicrophone,
} from './utils/dialerEngine';
import { formatDuration } from './utils/phoneParser';

const STORAGE_KEYS = {
  queue: 'autodialer_queue_v1',
  settings: 'autodialer_settings_v1',
  history: 'autodialer_history_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type ActiveView = 'console' | 'history';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('console');
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    loadFromStorage<QueueItem[]>(STORAGE_KEYS.queue, createDemoQueue()),
  );
  const [settings, setSettings] = useState<BotSettings>(() => ({
    ...createDefaultSettings(),
    ...loadFromStorage<Partial<BotSettings>>(STORAGE_KEYS.settings, {}),
  }));
  const [history, setHistory] = useState<CallRecord[]>(() =>
    loadFromStorage<CallRecord[]>(STORAGE_KEYS.history, []),
  );

  const [phase, setPhase] = useState<BotPhase>('idle');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(settings.callDurationSec);
  const [targetDurationSec, setTargetDurationSec] = useState<number>(settings.callDurationSec);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0);

  const [manualMicOverride, setManualMicOverride] = useState<boolean>(false);
  const [micOverrideUsedInCall, setMicOverrideUsedInCall] = useState<boolean>(false);
  const [micHardwareStatus, setMicHardwareStatus] =
    useState<MicHardwareStatus>('uninitialized');
  const [micDeviceLabel, setMicDeviceLabel] = useState<string>(
    'Программный замок (устройство не выбрано)',
  );
  const [micLevel, setMicLevel] = useState<number>(0);

  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Refs for accurate timer closures
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const activeItemIdRef = useRef(activeItemId);
  activeItemIdRef.current = activeItemId;
  const callStartedAtRef = useRef<string | null>(null);
  const callConnectedAtMsRef = useRef<number | null>(null);
  const manualMicOverrideRef = useRef(manualMicOverride);
  manualMicOverrideRef.current = manualMicOverride;
  const micOverrideUsedRef = useRef(micOverrideUsedInCall);
  micOverrideUsedRef.current = micOverrideUsedInCall;

  // Persist to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
    } catch {
      // ignore quota errors
    }
  }, [queue]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      // ignore quota errors
    }
  }, [settings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    } catch {
      // ignore quota errors
    }
  }, [history]);

  const micLocked = useMemo(() => {
    if (phase === 'dialing' || phase === 'connected') {
      return shouldLockMicrophone(phase, settings, manualMicOverride);
    }
    // Outside an active call, reflect auto-lock standby state cleanly
    return settings.autoMuteMic;
  }, [phase, settings, manualMicOverride]);

  // Keep hardware audio track synchronized with lock state
  useEffect(() => {
    audioController.setHardwareMicLocked(micLocked);
  }, [micLocked]);

  // Poll mic input level only when hardware mic is granted and unlocked
  useEffect(() => {
    if (micHardwareStatus !== 'granted' || micLocked) {
      setMicLevel(0);
      return;
    }
    const id = window.setInterval(() => {
      setMicLevel(audioController.getMicInputLevel());
    }, 120);
    return () => window.clearInterval(id);
  }, [micHardwareStatus, micLocked]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioController.stopRingbackTone();
      audioController.stopMicrophone();
    };
  }, []);

  const dispatchWebhook = useCallback(
    async (
      event: 'call_start' | 'call_end',
      item: QueueItem,
      extra: { durationSec: number; micLocked: boolean; outcome?: string },
    ): Promise<boolean | null> => {
      const url = settingsRef.current.webhookUrl.trim();
      if (!url) return null;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event,
            phone: item.phone,
            name: item.name,
            durationSec: extra.durationSec,
            micLocked: extra.micLocked,
            outcome: extra.outcome,
            timestamp: new Date().toISOString(),
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [],
  );

  const beginCallForItem = useCallback(
    (item: QueueItem) => {
      const currentSettings = settingsRef.current;
      const duration = getEffectiveDuration(item, currentSettings);

      // Reset manual override at the start of EVERY call so auto-lock always re-engages
      setManualMicOverride(false);
      setMicOverrideUsedInCall(false);
      manualMicOverrideRef.current = false;
      micOverrideUsedRef.current = false;

      const lockAtDial = shouldLockMicrophone('dialing', currentSettings, false);
      audioController.setHardwareMicLocked(lockAtDial);

      setActiveItemId(item.id);
      setTargetDurationSec(duration);
      setRemainingSec(duration);
      setPhase('dialing');
      callStartedAtRef.current = new Date().toISOString();
      callConnectedAtMsRef.current = null;

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'dialing',
                attempts: q.attempts + 1,
                updatedAt: new Date().toISOString(),
              }
            : q,
        ),
      );

      if (currentSettings.playDtmfTones) {
        void audioController.playDtmfSequence(item.phone);
      }
      if (currentSettings.playRingbackTone) {
        audioController.startRingbackTone();
      }
      void dispatchWebhook('call_start', item, {
        durationSec: duration,
        micLocked: lockAtDial,
      });
    },
    [dispatchWebhook],
  );

  const finalizeCurrentCall = useCallback(
    (
      outcome: CallRecord['outcome'],
      nextQueueStatus: QueueItem['status'],
      continueQueue: boolean,
    ) => {
      audioController.stopRingbackTone();

      const itemId = activeItemIdRef.current;
      const item = queueRef.current.find((q) => q.id === itemId) ?? null;
      const currentSettings = settingsRef.current;

      if (item) {
        const targetDur = getEffectiveDuration(item, currentSettings);
        const actualSec =
          callConnectedAtMsRef.current !== null
            ? Math.min(
                targetDur,
                Math.max(1, Math.round((Date.now() - callConnectedAtMsRef.current) / 1000)),
              )
            : 0;

        const wasMicLocked =
          currentSettings.autoMuteMic && !micOverrideUsedRef.current;

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: nextQueueStatus,
                  lastCallDurationSec: actualSec,
                  micWasLocked: wasMicLocked,
                  updatedAt: new Date().toISOString(),
                }
              : q,
          ),
        );

        const record: CallRecord = {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          itemId: item.id,
          phone: item.phone,
          name: item.name,
          startedAt: callStartedAtRef.current ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          configuredDurationSec: targetDur,
          actualDurationSec: actualSec,
          outcome,
          micLocked: wasMicLocked,
          micManualOverrideUsed: micOverrideUsedRef.current,
          webhookDelivered: null,
        };
        setHistory((prev) => [record, ...prev]);

        void dispatchWebhook('call_end', item, {
          durationSec: actualSec,
          micLocked: wasMicLocked,
          outcome,
        });
      }

      setActiveItemId(null);
      setManualMicOverride(false);

      if (!continueQueue) {
        setPhase('idle');
        return;
      }

      // Look ahead for next queued item (excluding the item just finalized)
      const nextItem = queueRef.current.find(
        (q) => q.id !== itemId && q.status === 'queued',
      );

      if (nextItem) {
        if (currentSettings.cooldownSec > 0) {
          setCooldownRemainingSec(currentSettings.cooldownSec);
          setPhase('cooldown');
        } else {
          beginCallForItem(nextItem);
        }
      } else if (currentSettings.loopQueue && queueRef.current.length > 0) {
        const restarted = resetQueueForRestart(queueRef.current);
        setQueue(restarted);
        const first = restarted[0];
        if (first) {
          if (currentSettings.cooldownSec > 0) {
            setCooldownRemainingSec(currentSettings.cooldownSec);
            setPhase('cooldown');
          } else {
            beginCallForItem(first);
          }
        } else {
          setPhase('finished');
        }
      } else {
        setPhase('finished');
      }
    },
    [beginCallForItem, dispatchWebhook],
  );

  // Dialing -> Connected transition timer
  useEffect(() => {
    if (phase !== 'dialing' || !activeItemId) return;

    const ringMs = Math.max(1, settings.ringDurationSec) * 1000;
    const timeoutId = window.setTimeout(() => {
      audioController.stopRingbackTone();
      callConnectedAtMsRef.current = Date.now();

      const lockNow = shouldLockMicrophone(
        'connected',
        settingsRef.current,
        manualMicOverrideRef.current,
      );
      audioController.setHardwareMicLocked(lockNow);

      setPhase('connected');
      setQueue((prev) =>
        prev.map((q) =>
          q.id === activeItemId ? { ...q, status: 'connected' } : q,
        ),
      );
    }, ringMs);

    return () => window.clearTimeout(timeoutId);
  }, [phase, activeItemId, settings.ringDurationSec]);

  // Connected countdown ticker (1s)
  useEffect(() => {
    if (phase !== 'connected') return;

    const intervalId = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          finalizeCurrentCall('completed', 'completed', true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [phase, finalizeCurrentCall]);

  // Cooldown countdown ticker (1s)
  useEffect(() => {
    if (phase !== 'cooldown') return;

    const intervalId = window.setInterval(() => {
      setCooldownRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          const next = getNextPendingItem(queueRef.current);
          if (next) {
            beginCallForItem(next);
          } else {
            setPhase('finished');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [phase, beginCallForItem]);

  const handleRequestMicAccess = useCallback(async () => {
    const result = await audioController.requestMicrophone();
    setMicHardwareStatus(result.status);
    setMicDeviceLabel(result.deviceLabel);
  }, []);

  const handleStartBot = useCallback(() => {
    let candidate = getNextPendingItem(queueRef.current);
    if (!candidate && queueRef.current.length > 0 && settingsRef.current.loopQueue) {
      const restarted = resetQueueForRestart(queueRef.current);
      setQueue(restarted);
      candidate = restarted[0] ?? null;
    }
    if (!candidate) return;

    if (micHardwareStatus === 'uninitialized') {
      void handleRequestMicAccess();
    }
    setActiveView('console');
    beginCallForItem(candidate);
  }, [beginCallForItem, handleRequestMicAccess, micHardwareStatus]);

  const handleStopBot = useCallback(() => {
    if (phaseRef.current === 'cooldown') {
      setPhase('idle');
      return;
    }
    finalizeCurrentCall('stopped', 'queued', false);
  }, [finalizeCurrentCall]);

  const handleHangupAndNext = useCallback(() => {
    finalizeCurrentCall('completed', 'completed', true);
  }, [finalizeCurrentCall]);

  const handleSkip = useCallback(() => {
    finalizeCurrentCall('skipped', 'skipped', true);
  }, [finalizeCurrentCall]);

  const handleToggleManualMic = useCallback(() => {
    setManualMicOverride((prev) => {
      const next = !prev;
      if (next) {
        setMicOverrideUsedInCall(true);
        micOverrideUsedRef.current = true;
      }
      return next;
    });
  }, []);

  const handleAddSingle = useCallback(
    (phone: string, name: string, customDurationSec: number | null) => {
      const newItem: QueueItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        phone,
        name,
        status: 'queued',
        customDurationSec,
        lastCallDurationSec: null,
        micWasLocked: false,
        attempts: 0,
        updatedAt: null,
      };
      setQueue((prev) => [...prev, newItem]);
      if (phase === 'finished') {
        setPhase('idle');
      }
    },
    [phase],
  );

  const handleBulkImport = useCallback(
    (entries: Array<{ phone: string; name: string }>) => {
      const newItems: QueueItem[] = entries.map((entry, index) => ({
        id: `item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`,
        phone: entry.phone,
        name: entry.name,
        status: 'queued',
        customDurationSec: null,
        lastCallDurationSec: null,
        micWasLocked: false,
        attempts: 0,
        updatedAt: null,
      }));
      setQueue((prev) => [...prev, ...newItems]);
      if (phase === 'finished') {
        setPhase('idle');
      }
    },
    [phase],
  );

  const handleRemoveItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleRetryItem = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'queued' } : item,
      ),
    );
    if (phaseRef.current === 'finished') {
      setPhase('idle');
    }
  }, []);

  const handleUpdateItemDuration = useCallback((id: string, durationSec: number | null) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, customDurationSec: durationSec } : item,
      ),
    );
  }, []);

  const handleLoadDemo = useCallback(() => {
    const demo = createDemoQueue();
    setQueue((prev) => {
      const existing = new Set(prev.map((p) => p.phone));
      const toAdd = demo.filter((d) => !existing.has(d.phone));
      return toAdd.length > 0 ? [...prev, ...toAdd] : demo;
    });
    if (phaseRef.current === 'finished') {
      setPhase('idle');
    }
  }, []);

  const handleClearQueue = useCallback(() => {
    if (phaseRef.current === 'dialing' || phaseRef.current === 'connected' || phaseRef.current === 'cooldown') {
      return;
    }
    setQueue([]);
    setPhase('idle');
  }, []);

  const handleResetQueue = useCallback(() => {
    setQueue((prev) => resetQueueForRestart(prev));
    setPhase('idle');
  }, []);

  const handleChangeSettings = useCallback((patch: Partial<BotSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const stats = useMemo(() => computeQueueStats(queue), [queue]);
  const activeItem = useMemo(
    () => queue.find((q) => q.id === activeItemId) ?? null,
    [queue, activeItemId],
  );
  const nextQueuedItem = useMemo(() => getNextPendingItem(queue), [queue]);
  const isBotRunning =
    phase === 'dialing' || phase === 'connected' || phase === 'cooldown';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Left Sidebar (Desktop) */}
      <aside className="w-full lg:w-64 lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="px-6 py-5 border-b border-slate-100">
            <a
              href="#top"
              className="inline-flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              <PhoneCall className="w-5 h-5 text-blue-600 shrink-0" aria-hidden="true" />
              <span>АвтоДозвон Бот</span>
            </a>
          </div>

          <nav aria-label="Разделы консоли" className="p-3 flex lg:flex-col gap-1">
            <button
              type="button"
              onClick={() => setActiveView('console')}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'console'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ListOrdered className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Очередь и управление</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('history')}
              className={`flex items-center justify-between gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'history'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span className="inline-flex items-center gap-2.5">
                <History className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Журнал звонков</span>
              </span>
              <span
                className={`text-xs font-mono tabular-nums ${
                  activeView === 'history' ? 'text-slate-300' : 'text-slate-400'
                }`}
              >
                {history.length}
              </span>
            </button>
          </nav>
        </div>

        <div className="hidden lg:block p-4 m-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            {micLocked ? (
              <MicOff className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            ) : (
              <Mic className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            )}
            <span>
              {micLocked ? 'Автоблокировка включена' : 'Микрофон не заблокирован'}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {settings.autoMuteMic
              ? 'Микрофон отключается автоматически при каждом новом звонке из списка.'
              : 'Включите автоблокировку в настройках для защиты от фонового шума.'}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 sm:gap-8">
          <div className="text-sm font-medium text-slate-600 truncate min-w-0">
            <span className="hidden sm:inline">Рабочее место</span>
            <span className="hidden sm:inline mx-2 text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="text-slate-900 font-semibold">
              {activeView === 'console' ? 'Очередь и автодозвон' : 'Журнал звонков'}
            </span>
          </div>

          <div className="shrink-0">
            {isBotRunning ? (
              <button
                type="button"
                onClick={handleStopBot}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                Остановить бота
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                Импорт списка
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* 4-column KPI strip */}
          <section
            aria-label="Сводка очереди и параметров"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden"
          >
            <div className="bg-white p-4 sm:p-5 min-w-0">
              <div className="text-xs text-slate-500">Номеров в списке</div>
              <div
                data-testid="kpi-total-count"
                className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1"
              >
                {stats.total}
              </div>
              <div className="text-xs text-slate-500 mt-1 tabular-nums">
                В очереди: {stats.queued}
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 min-w-0">
              <div className="text-xs text-slate-500">Завершено вызовов</div>
              <div
                data-testid="kpi-completed-count"
                className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1"
              >
                {stats.completed}
              </div>
              <div className="text-xs text-slate-500 mt-1 tabular-nums">
                Общее время: {formatDuration(stats.totalTalkSec)}
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 min-w-0">
              <div className="text-xs text-slate-500">Длительность звонка</div>
              <div
                data-testid="kpi-duration-setting"
                className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1"
              >
                {settings.callDurationSec} сек
              </div>
              <div className="text-xs text-slate-500 mt-1 tabular-nums">
                Пауза: {settings.cooldownSec} сек · Набор: {settings.ringDurationSec} сек
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 min-w-0">
              <div className="text-xs text-slate-500">Микрофон на звонке</div>
              <div
                data-testid="kpi-mic-policy"
                className={`text-base sm:text-lg font-semibold mt-1.5 flex items-center gap-1.5 min-w-0 ${
                  settings.autoMuteMic ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {settings.autoMuteMic ? (
                  <>
                    <MicOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">Автоблокировка</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">Отключена</span>
                  </>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {settings.autoMuteMic
                  ? settings.micLockMode === 'always_during_call'
                    ? 'Блокируется с начала набора'
                    : 'Блокируется при ответе'
                  : 'Ручной контроль оператором'}
              </div>
            </div>
          </section>

          {activeView === 'console' ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-8 space-y-6">
                <ActiveCallStage
                  phase={phase}
                  activeItem={activeItem}
                  nextQueuedItem={nextQueuedItem}
                  remainingSec={remainingSec}
                  targetDurationSec={targetDurationSec}
                  cooldownRemainingSec={cooldownRemainingSec}
                  micLocked={micLocked}
                  micHardwareStatus={micHardwareStatus}
                  micLevel={micLevel}
                  settings={settings}
                  hasQueuedItems={stats.queued > 0}
                  hasAnyItems={stats.total > 0}
                  onStart={handleStartBot}
                  onStop={handleStopBot}
                  onHangupAndNext={handleHangupAndNext}
                  onSkip={handleSkip}
                  onToggleManualMic={handleToggleManualMic}
                  onResetQueue={handleResetQueue}
                />

                <QueuePanel
                  queue={queue}
                  activeItemId={activeItemId}
                  settings={settings}
                  isBotRunning={isBotRunning}
                  onAddSingle={handleAddSingle}
                  onOpenBulkImport={() => setIsImportModalOpen(true)}
                  onRemoveItem={handleRemoveItem}
                  onRetryItem={handleRetryItem}
                  onUpdateItemDuration={handleUpdateItemDuration}
                  onLoadDemo={handleLoadDemo}
                  onClearQueue={handleClearQueue}
                />
              </div>

              <div className="xl:col-span-4">
                <SettingsPanel
                  settings={settings}
                  micHardwareStatus={micHardwareStatus}
                  micDeviceLabel={micDeviceLabel}
                  micLocked={micLocked}
                  micLevel={micLevel}
                  onChangeSettings={handleChangeSettings}
                  onRequestMicAccess={handleRequestMicAccess}
                />
              </div>
            </div>
          ) : (
            <CallHistoryView
              records={history}
              onClearHistory={() => setHistory([])}
            />
          )}
        </main>
      </div>

      <BulkImportModal
        isOpen={isImportModalOpen}
        existingPhones={queue.map((q) => q.phone)}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleBulkImport}
      />
    </div>
  );
}
