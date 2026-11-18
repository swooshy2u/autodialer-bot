import {
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneForwarded,
  PhoneOff,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
} from 'lucide-react';
import type {
  BotPhase,
  BotSettings,
  MicHardwareStatus,
  QueueItem,
} from '../types/dialer';
import { formatDuration, formatPhoneDisplay } from '../utils/phoneParser';

interface ActiveCallStageProps {
  phase: BotPhase;
  activeItem: QueueItem | null;
  nextQueuedItem: QueueItem | null;
  remainingSec: number;
  targetDurationSec: number;
  cooldownRemainingSec: number;
  micLocked: boolean;
  micHardwareStatus: MicHardwareStatus;
  micLevel: number;
  settings: BotSettings;
  hasQueuedItems: boolean;
  hasAnyItems: boolean;
  onStart: () => void;
  onStop: () => void;
  onHangupAndNext: () => void;
  onSkip: () => void;
  onToggleManualMic: () => void;
  onResetQueue: () => void;
}

const PHASE_LABEL: Record<BotPhase, string> = {
  idle: 'Ожидание запуска',
  dialing: 'Набор номера и ожидание ответа',
  connected: 'Идёт вызов (активный таймер)',
  cooldown: 'Пауза перед следующим номером',
  finished: 'Обзвон списка завершён',
};

export function ActiveCallStage({
  phase,
  activeItem,
  nextQueuedItem,
  remainingSec,
  targetDurationSec,
  cooldownRemainingSec,
  micLocked,
  micHardwareStatus,
  micLevel,
  settings,
  hasQueuedItems,
  hasAnyItems,
  onStart,
  onStop,
  onHangupAndNext,
  onSkip,
  onToggleManualMic,
  onResetQueue,
}: ActiveCallStageProps) {
  const isRunning = phase === 'dialing' || phase === 'connected' || phase === 'cooldown';

  const progressPct = (() => {
    if (phase === 'connected' && targetDurationSec > 0) {
      const elapsed = Math.max(0, targetDurationSec - remainingSec);
      return Math.min(100, Math.round((elapsed / targetDurationSec) * 100));
    }
    if (phase === 'cooldown' && settings.cooldownSec > 0) {
      const elapsed = Math.max(0, settings.cooldownSec - cooldownRemainingSec);
      return Math.min(100, Math.round((elapsed / settings.cooldownSec) * 100));
    }
    if (phase === 'dialing') return 18;
    return 0;
  })();

  const displayedTimer = (() => {
    if (phase === 'connected') return formatDuration(remainingSec);
    if (phase === 'cooldown') return formatDuration(cooldownRemainingSec);
    if (phase === 'dialing') return formatDuration(targetDurationSec);
    if (nextQueuedItem) {
      const dur = nextQueuedItem.customDurationSec ?? settings.callDurationSec;
      return formatDuration(dur);
    }
    return formatDuration(settings.callDurationSec);
  })();

  return (
    <section
      aria-label="Активная сессия автодозвона"
      data-testid="active-call-stage"
      data-phase={phase}
      data-mic-locked={micLocked ? 'true' : 'false'}
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
              <span
                className={
                  phase === 'connected'
                    ? 'text-emerald-700 font-semibold'
                    : phase === 'dialing'
                      ? 'text-blue-700 font-semibold'
                      : phase === 'cooldown'
                        ? 'text-amber-700 font-semibold'
                        : 'text-slate-600'
                }
              >
                {PHASE_LABEL[phase]}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                {micLocked ? (
                  <>
                    <MicOff className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span className="text-emerald-700 font-semibold">Микрофон заблокирован</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                    <span className="text-amber-700 font-semibold">Микрофон открыт</span>
                  </>
                )}
              </span>
              {micHardwareStatus === 'granted' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums text-slate-500">
                    Уровень входа: {micLocked ? '0%' : `${micLevel}%`}
                  </span>
                </>
              )}
            </div>

            {activeItem ? (
              <div>
                <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatPhoneDisplay(activeItem.phone)}
                </p>
                <p className="text-sm text-slate-600 mt-1 truncate">
                  {activeItem.name || 'Контакт без имени'}
                </p>
              </div>
            ) : nextQueuedItem ? (
              <div>
                <p className="text-xs text-slate-500 mb-1">Следующий номер в очереди</p>
                <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatPhoneDisplay(nextQueuedItem.phone)}
                </p>
                <p className="text-sm text-slate-600 mt-1 truncate">
                  {nextQueuedItem.name || 'Контакт без имени'}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xl font-semibold text-slate-900">
                  {hasAnyItems ? 'Все номера в очереди обработаны' : 'Очередь номеров пуста'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {hasAnyItems
                    ? 'Сбросьте статусы очереди или добавьте новые номера для повторного обзвона.'
                    : 'Добавьте номера вручную или импортируйте список ниже.'}
                </p>
              </div>
            )}
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="text-xs text-slate-500">
              {phase === 'cooldown' ? 'До следующего вызова' : 'Таймер длительности'}
            </div>
            <div
              data-testid="call-countdown-timer"
              className="text-4xl font-semibold text-slate-900 font-mono tabular-nums tracking-tight mt-0.5"
            >
              {displayedTimer}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!isRunning ? (
            <>
              {hasQueuedItems ? (
                <button
                  type="button"
                  onClick={onStart}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4" aria-hidden="true" />
                  Запустить автодозвон
                </button>
              ) : hasAnyItems ? (
                <button
                  type="button"
                  onClick={onResetQueue}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Сбросить очередь и повторить
                </button>
              ) : null}
            </>
          ) : (
            <>
              {phase !== 'cooldown' && (
                <button
                  type="button"
                  onClick={onHangupAndNext}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PhoneForwarded className="w-4 h-4" aria-hidden="true" />
                  Завершить и далее
                </button>
              )}

              {phase !== 'cooldown' && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" aria-hidden="true" />
                  Пропустить
                </button>
              )}

              {phase !== 'cooldown' && (
                <button
                  type="button"
                  onClick={onToggleManualMic}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    micLocked
                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-slate-600'
                      : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 focus-visible:outline-amber-600'
                  }`}
                >
                  {micLocked ? (
                    <>
                      <Mic className="w-4 h-4" aria-hidden="true" />
                      Временно открыть микрофон
                    </>
                  ) : (
                    <>
                      <MicOff className="w-4 h-4" aria-hidden="true" />
                      Заблокировать микрофон
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {phase === 'cooldown' ? (
                  <Pause className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <PhoneOff className="w-4 h-4" aria-hidden="true" />
                )}
                Остановить
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            {settings.autoMuteMic
              ? settings.micLockMode === 'always_during_call'
                ? 'Политика: автоблокировка микрофона с начала набора до завершения вызова'
                : 'Политика: автоблокировка микрофона при соединении с абонентом'
              : 'Политика: автоблокировка микрофона отключена'}
          </span>
          <span className="font-mono tabular-nums">
            {phase === 'connected'
              ? `${progressPct}%`
              : phase === 'cooldown'
                ? `Пауза ${settings.cooldownSec}с`
                : `Лимит ${targetDurationSec}с`}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              phase === 'cooldown'
                ? 'bg-amber-500'
                : phase === 'connected'
                  ? 'bg-blue-600'
                  : phase === 'dialing'
                    ? 'bg-blue-400'
                    : 'bg-slate-200'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {activeItem && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Если используете системную звонилку устройства, можно также открыть номер напрямую:
          </span>
          <a
            href={`tel:${activeItem.phone}`}
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap shrink-0"
          >
            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
            Открыть tel:{activeItem.phone}
          </a>
        </div>
      )}
    </section>
  );
}
