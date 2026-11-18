import { Download, Mic, MicOff, Trash2 } from 'lucide-react';
import type { CallRecord } from '../types/dialer';
import { formatDuration, formatPhoneDisplay, generateCsvReport } from '../utils/phoneParser';

interface CallHistoryViewProps {
  records: CallRecord[];
  onClearHistory: () => void;
}

const OUTCOME_LABELS: Record<CallRecord['outcome'], { text: string; cls: string }> = {
  completed: { text: 'Завершён по таймеру', cls: 'text-emerald-700' },
  skipped: { text: 'Пропущен вручную', cls: 'text-amber-700' },
  stopped: { text: 'Прерван остановкой', cls: 'text-slate-600' },
  failed: { text: 'Ошибка шлюза', cls: 'text-red-700' },
};

export function CallHistoryView({ records, onClearHistory }: CallHistoryViewProps) {
  const handleDownloadCsv = () => {
    const csv = generateCsvReport(records);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `autodialer-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Журнал совершённых звонков"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Журнал выполненных вызовов</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            История всех вызовов с фиксацией фактической длительности и статуса блокировки микрофона.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Экспорт CSV
          </button>
          {records.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-slate-200 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Очистить журнал
            </button>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-sm font-medium text-slate-900">Журнал вызовов пока пуст</p>
          <p className="text-xs text-slate-500 mt-1">
            После запуска автодозвона здесь появится подробный отчёт по каждому звонку.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left border-collapse" data-testid="history-table">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 pr-3">Время</th>
                <th className="py-2.5 pr-3">Номер</th>
                <th className="py-2.5 pr-3">Контакт</th>
                <th className="py-2.5 pr-3 text-right">Факт / Лимит</th>
                <th className="py-2.5 pr-3">Микрофон</th>
                <th className="py-2.5">Результат</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {records.map((rec) => {
                const outcome = OUTCOME_LABELS[rec.outcome];
                const timeStr = new Date(rec.startedAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 pr-3 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                      {timeStr}
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatPhoneDisplay(rec.phone)}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 max-w-[200px] truncate">
                      {rec.name || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                      {formatDuration(rec.actualDurationSec)} / {formatDuration(rec.configuredDurationSec)}
                    </td>
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                      {rec.micLocked ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                          <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                          Заблокирован
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                          <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                          Был открыт
                        </span>
                      )}
                    </td>
                    <td className={`py-2.5 text-xs font-medium whitespace-nowrap ${outcome.cls}`}>
                      {outcome.text}
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
