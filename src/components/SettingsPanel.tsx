import { Mic, MicOff, Shield, Volume2, Webhook } from 'lucide-react';
import type { BotSettings, MicHardwareStatus, MicLockMode } from '../types/dialer';
import {
  clampDuration,
  MAX_CALL_DURATION_SEC,
  MAX_COOLDOWN_SEC,
  MAX_RING_DURATION_SEC,
  MIN_CALL_DURATION_SEC,
  MIN_COOLDOWN_SEC,
  MIN_RING_DURATION_SEC,
} from '../utils/dialerEngine';

interface SettingsPanelProps {
  settings: BotSettings;
  micHardwareStatus: MicHardwareStatus;
  micDeviceLabel: string;
  micLocked: boolean;
  micLevel: number;
  onChangeSettings: (patch: Partial<BotSettings>) => void;
  onRequestMicAccess: () => void;
}

const DURATION_PRESETS = [10, 15, 30, 60, 120];

export function SettingsPanel({
  settings,
  micHardwareStatus,
  micDeviceLabel,
  micLocked,
  micLevel,
  onChangeSettings,
  onRequestMicAccess,
}: SettingsPanelProps) {
  return (
    <aside aria-label="Параметры бота и блокировка микрофона" className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Длительность и интервалы</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Бот автоматически завершит звонок по истечении заданного лимита и перейдёт к следующему номеру.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="call-duration-input" className="text-sm font-medium text-slate-700">
              Длительность звонка (сек)
            </label>
            <input
              id="call-duration-input"
              type="number"
              min={MIN_CALL_DURATION_SEC}
              max={MAX_CALL_DURATION_SEC}
              value={settings.callDurationSec}
              onChange={(e) =>
                onChangeSettings({
                  callDurationSec: clampDuration(
                    Number(e.target.value),
                    MIN_CALL_DURATION_SEC,
                    MAX_CALL_DURATION_SEC,
                  ),
                })
              }
              className="w-24 h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-right text-sm font-mono tabular-nums font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          <input
            type="range"
            aria-label="Ползунок длительности звонка"
            min={MIN_CALL_DURATION_SEC}
            max={180}
            value={Math.min(180, settings.callDurationSec)}
            onChange={(e) =>
              onChangeSettings({
                callDurationSec: clampDuration(
                  Number(e.target.value),
                  MIN_CALL_DURATION_SEC,
                  MAX_CALL_DURATION_SEC,
                ),
              })
            }
            className="w-full accent-blue-600 cursor-pointer"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChangeSettings({ callDurationSec: preset })}
                className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                  settings.callDurationSec === preset
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {preset}с
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
          <div>
            <label htmlFor="ring-duration-input" className="block text-xs font-medium text-slate-600 mb-1">
              Время набора (сек)
            </label>
            <input
              id="ring-duration-input"
              type="number"
              min={MIN_RING_DURATION_SEC}
              max={MAX_RING_DURATION_SEC}
              value={settings.ringDurationSec}
              onChange={(e) =>
                onChangeSettings({
                  ringDurationSec: clampDuration(
                    Number(e.target.value),
                    MIN_RING_DURATION_SEC,
                    MAX_RING_DURATION_SEC,
                  ),
                })
              }
              className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-mono tabular-nums text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="cooldown-duration-input" className="block text-xs font-medium text-slate-600 mb-1">
              Пауза между (сек)
            </label>
            <input
              id="cooldown-duration-input"
              type="number"
              min={MIN_COOLDOWN_SEC}
              max={MAX_COOLDOWN_SEC}
              value={settings.cooldownSec}
              onChange={(e) =>
                onChangeSettings({
                  cooldownSec: clampDuration(
                    Number(e.target.value),
                    MIN_COOLDOWN_SEC,
                    MAX_COOLDOWN_SEC,
                  ),
                })
              }
              className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-mono tabular-nums text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 pt-2 text-xs text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.loopQueue}
            onChange={(e) => onChangeSettings({ loopQueue: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          Зациклить список после завершения последнего номера
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-700" aria-hidden="true" />
              Автоблокировка микрофона
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Аппаратное и программное отключение аудиовхода при каждом исходящем вызове.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer select-none">
          <span className="text-sm font-medium text-slate-900">
            Блокировать микрофон автоматически
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={settings.autoMuteMic}
            checked={settings.autoMuteMic}
            onChange={(e) => onChangeSettings({ autoMuteMic: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
        </label>

        {settings.autoMuteMic && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-600 mb-1">
              Момент срабатывания блокировки
            </legend>
            {(
              [
                ['always_during_call', 'Сразу при наборе номера и на всё время звонка'],
                ['on_connect', 'После установки соединения с абонентом'],
              ] as Array<[MicLockMode, string]>
            ).map(([mode, label]) => (
              <label
                key={mode}
                className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer"
              >
                <input
                  type="radio"
                  name="mic-lock-mode"
                  value={mode}
                  checked={settings.micLockMode === mode}
                  onChange={() => onChangeSettings({ micLockMode: mode })}
                  className="mt-0.5 text-blue-600 focus:ring-blue-600"
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="text-slate-500 shrink-0">Аудиоустройство:</span>
            <span className="font-medium text-slate-800 text-right">
              {micDeviceLabel}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                {micLocked ? (
                  <MicOff className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                )}
                {micLocked ? 'Вход заглушён (0%)' : 'Контроль уровня входа'}
              </span>
              <span className="font-mono tabular-nums">
                {micLocked ? '0%' : `${micLevel}%`}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  micLocked ? 'bg-slate-300' : 'bg-emerald-500'
                }`}
                style={{ width: `${micLocked ? 0 : micLevel}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestMicAccess}
            className="w-full py-2 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            {micHardwareStatus === 'granted'
              ? 'Перепроверить системный микрофон'
              : 'Подключить и проверить микрофон'}
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-slate-700" aria-hidden="true" />
          Звук и внешний шлюз
        </h2>

        <div className="space-y-2">
          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.playDtmfTones}
              onChange={(e) => onChangeSettings({ playDtmfTones: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            Воспроизводить тональный набор (DTMF)
          </label>
          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.playRingbackTone}
              onChange={(e) => onChangeSettings({ playRingbackTone: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            Воспроизводить гудки ожидания ответа (425 Гц)
          </label>
        </div>

        <div className="pt-3 border-t border-slate-100">
          <label htmlFor="webhook-url-input" className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
            <Webhook className="w-3.5 h-3.5" aria-hidden="true" />
            Webhook VoIP / SIP-шлюза (опционально)
          </label>
          <input
            id="webhook-url-input"
            type="url"
            value={settings.webhookUrl}
            onChange={(e) => onChangeSettings({ webhookUrl: e.target.value })}
            placeholder="https://sip-bridge.local/api/call"
            className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            При указании URL бот отправляет POST-события старта и сброса с флагом muteMic.
          </p>
        </div>
      </section>
    </aside>
  );
}
