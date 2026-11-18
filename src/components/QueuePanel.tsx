import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ListPlus,
  MicOff,
  PhoneCall,
  Plus,
  RotateCcw,
  Search,
  SkipForward,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type { BotSettings, QueueItem, QueueItemStatus } from '../types/dialer';
import {
  formatDuration,
  formatPhoneDisplay,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from '../utils/phoneParser';
import { clampDuration, MAX_CALL_DURATION_SEC, MIN_CALL_DURATION_SEC } from '../utils/dialerEngine';

interface QueuePanelProps {
  queue: QueueItem[];
  activeItemId: string | null;
  settings: BotSettings;
  isBotRunning: boolean;
  onAddSingle: (phone: string, name: string, customDurationSec: number | null) => void;
  onOpenBulkImport: () => void;
  onRemoveItem: (id: string) => void;
  onRetryItem: (id: string) => void;
  onUpdateItemDuration: (id: string, durationSec: number | null) => void;
  onLoadDemo: () => void;
  onClearQueue: () => void;
}

type FilterTab = 'all' | 'pending' | 'done';

const STATUS_META: Record<
  QueueItemStatus,
  { label: string; colorClass: string; Icon: typeof Clock }
> = {
  queued: { label: 'В очереди', colorClass: 'text-slate-600', Icon: Clock },
  dialing: { label: 'Набор...', colorClass: 'text-blue-700', Icon: PhoneCall },
  connected: { label: 'Разговор', colorClass: 'text-emerald-700', Icon: PhoneCall },
  completed: { label: 'Завершён', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  skipped: { label: 'Пропущен', colorClass: 'text-amber-700', Icon: SkipForward },
  failed: { label: 'Ошибка', colorClass: 'text-red-700', Icon: XCircle },
};

export function QueuePanel({
  queue,
  activeItemId,
  settings,
  isBotRunning,
  onAddSingle,
  onOpenBulkImport,
  onRemoveItem,
  onRetryItem,
  onUpdateItemDuration,
  onLoadDemo,
  onClearQueue,
}: QueuePanelProps) {
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [customDurInput, setCustomDurInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      if (filterTab === 'pending') {
        if (item.status !== 'queued' && item.status !== 'dialing' && item.status !== 'connected') {
          return false;
        }
      } else if (filterTab === 'done') {
        if (item.status !== 'completed' && item.status !== 'skipped' && item.status !== 'failed') {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchPhone = item.phone.toLowerCase().includes(q);
        const matchName = item.name.toLowerCase().includes(q);
        return matchPhone || matchName;
      }
      return true;
    });
  }, [queue, filterTab, searchQuery]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setFormError('Введите номер телефона.');
      return;
    }
    if (!isValidPhoneNumber(trimmed)) {
      setFormError('Некорректный формат номера. Укажите от 7 до 15 цифр.');
      return;
    }

    const normalized = normalizePhoneNumber(trimmed);
    if (queue.some((item) => item.phone === normalized)) {
      setFormError('Этот номер уже находится в очереди.');
      return;
    }

    let parsedDur: number | null = null;
    if (customDurInput.trim()) {
      const numeric = Number(customDurInput.trim());
      if (!Number.isFinite(numeric) || numeric < MIN_CALL_DURATION_SEC) {
        setFormError(`Длительность должна быть не менее ${MIN_CALL_DURATION_SEC} сек.`);
        return;
      }
      parsedDur = clampDuration(numeric, MIN_CALL_DURATION_SEC, MAX_CALL_DURATION_SEC);
    }

    onAddSingle(normalized, nameInput.trim(), parsedDur);
    setPhoneInput('');
    setNameInput('');
    setCustomDurInput('');
    setFormError(null);
  };

  return (
    <section
      aria-label="Очередь номеров для обзвона"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Список номеров для обзвона</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Добавляйте номера по одному или загрузите список. Длительность можно задать индивидуально или использовать общую ({settings.callDurationSec} сек).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenBulkImport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            Массовый импорт
          </button>
          <button
            type="button"
            onClick={onLoadDemo}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ListPlus className="w-3.5 h-3.5" aria-hidden="true" />
            Демо-список
          </button>
          {queue.length > 0 && (
            <button
              type="button"
              onClick={onClearQueue}
              disabled={isBotRunning}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-slate-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Очистить
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleAddSubmit} className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-4">
            <label htmlFor="add-phone-input" className="block text-xs font-medium text-slate-600 mb-1">
              Номер телефона
            </label>
            <input
              id="add-phone-input"
              type="tel"
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                setFormError(null);
              }}
              placeholder="+7 999 123-45-67"
              className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-4">
            <label htmlFor="add-name-input" className="block text-xs font-medium text-slate-600 mb-1">
              Имя / заметка (необязательно)
            </label>
            <input
              id="add-name-input"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Клиент или отдел"
              className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="add-dur-input" className="block text-xs font-medium text-slate-600 mb-1">
              Лимит (сек)
            </label>
            <input
              id="add-dur-input"
              type="number"
              min={MIN_CALL_DURATION_SEC}
              max={MAX_CALL_DURATION_SEC}
              value={customDurInput}
              onChange={(e) => {
                setCustomDurInput(e.target.value);
                setFormError(null);
              }}
              placeholder={`${settings.callDurationSec}`}
              className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 px-3 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Добавить
            </button>
          </div>
        </div>
        {formError && (
          <p role="alert" className="text-xs font-medium text-red-600">
            {formError}
          </p>
        )}
      </form>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <div
          role="tablist"
          aria-label="Фильтр очереди по статусу"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          {(
            [
              ['all', 'Все'],
              ['pending', 'В очереди'],
              ['done', 'Завершённые'],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={filterTab === tabKey}
              onClick={() => setFilterTab(tabKey)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterTab === tabKey
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Поиск по номеру или имени"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по номеру или имени"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-sm font-medium text-slate-900">Список номеров пока пуст</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Добавьте номер через форму выше, вставьте список в окне импорта или загрузите готовый демо-список для проверки работы бота.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onLoadDemo}
              className="px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
            >
              Загрузить демо-список
            </button>
            <button
              type="button"
              onClick={onOpenBulkImport}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              Импорт списком
            </button>
          </div>
        </div>
      ) : filteredQueue.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500 border border-slate-100 rounded-lg">
          Нет номеров, соответствующих выбранному фильтру или поиску.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left border-collapse" data-testid="queue-table">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 pr-3">#</th>
                <th className="py-2.5 pr-3">Номер</th>
                <th className="py-2.5 pr-3">Контакт</th>
                <th className="py-2.5 pr-3 text-right">Лимит</th>
                <th className="py-2.5 pr-3">Статус</th>
                <th className="py-2.5 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredQueue.map((item, idx) => {
                const isActive = item.id === activeItemId;
                const meta = STATUS_META[item.status];
                const StatusIcon = meta.Icon;
                const effectiveDur = item.customDurationSec ?? settings.callDurationSec;

                return (
                  <tr
                    key={item.id}
                    data-status={item.status}
                    className={`transition-colors ${
                      isActive ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-2.5 pr-3 text-xs text-slate-400 font-mono tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatPhoneDisplay(item.phone)}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 max-w-[200px] truncate">
                      {item.name || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      <input
                        type="number"
                        aria-label={`Лимит звонка для ${item.phone} в секундах`}
                        min={MIN_CALL_DURATION_SEC}
                        max={MAX_CALL_DURATION_SEC}
                        disabled={isActive}
                        value={item.customDurationSec ?? ''}
                        placeholder={`${settings.callDurationSec}`}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (!val) {
                            onUpdateItemDuration(item.id, null);
                            return;
                          }
                          const num = Number(val);
                          if (Number.isFinite(num)) {
                            onUpdateItemDuration(
                              item.id,
                              clampDuration(num, MIN_CALL_DURATION_SEC, MAX_CALL_DURATION_SEC),
                            );
                          }
                        }}
                        title={`По умолчанию: ${effectiveDur} сек`}
                        className="w-16 h-7 text-right rounded border border-slate-200 bg-white px-1.5 text-xs font-mono tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none disabled:bg-slate-100"
                      />
                      <span className="text-xs text-slate-400 ml-1">с</span>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${meta.colorClass}`} aria-hidden="true" />
                        <span className={`font-medium ${meta.colorClass}`}>{meta.label}</span>
                        {item.lastCallDurationSec !== null && (
                          <span className="text-slate-400 font-mono tabular-nums">
                            · {formatDuration(item.lastCallDurationSec)}
                          </span>
                        )}
                        {item.micWasLocked && item.status === 'completed' && (
                          <span
                            title="Микрофон был автоматически заблокирован во время вызова"
                            className="inline-flex items-center text-slate-400"
                          >
                            <MicOff className="w-3 h-3" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        {(item.status === 'completed' ||
                          item.status === 'skipped' ||
                          item.status === 'failed') && (
                          <button
                            type="button"
                            onClick={() => onRetryItem(item.id)}
                            aria-label={`Повторить вызов ${item.phone}`}
                            title="Вернуть в очередь"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          disabled={isActive}
                          aria-label={`Удалить ${item.phone}`}
                          title="Удалить из очереди"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
