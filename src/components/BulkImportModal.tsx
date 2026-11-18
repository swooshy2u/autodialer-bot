import { useMemo, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { parsePhoneList } from '../utils/phoneParser';

interface BulkImportModalProps {
  isOpen: boolean;
  existingPhones: string[];
  onClose: () => void;
  onImport: (entries: Array<{ phone: string; name: string }>) => void;
}

export function BulkImportModal({
  isOpen,
  existingPhones,
  onClose,
  onImport,
}: BulkImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const preview = useMemo(
    () => parsePhoneList(rawText, existingPhones),
    [rawText, existingPhones],
  );

  if (!isOpen) return null;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText((prev) => (prev ? `${prev}\n${text}` : text));
    setSubmitError(null);
    event.target.value = '';
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) {
      setSubmitError('Вставьте хотя бы один номер телефона или загрузите файл.');
      return;
    }
    if (preview.valid.length === 0) {
      setSubmitError('Не найдено новых корректных номеров для добавления.');
      return;
    }
    onImport(preview.valid);
    setRawText('');
    setSubmitError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-import-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="bulk-import-title" className="text-lg font-semibold text-slate-900">
              Массовый импорт номеров
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              По одному номеру на строку. Можно указать имя через точку с запятой или запятую.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно импорта"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="bulk-phone-textarea" className="text-sm font-medium text-slate-700">
                Список номеров
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                Загрузить .txt / .csv
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>
            <textarea
              id="bulk-phone-textarea"
              rows={7}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setSubmitError(null);
              }}
              placeholder={'+7 999 123-45-67; Иван Петров\n89165550122, Отдел доставки\n+79037778899'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              К добавлению: <strong className="text-slate-900 tabular-nums">{preview.valid.length}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Дубликаты: <strong className="text-slate-900 tabular-nums">{preview.duplicates}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Неверный формат:{' '}
              <strong className={preview.invalid.length > 0 ? 'text-red-600 tabular-nums' : 'text-slate-900 tabular-nums'}>
                {preview.invalid.length}
              </strong>
            </span>
          </div>

          {submitError && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
            >
              Импортировать ({preview.valid.length})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
