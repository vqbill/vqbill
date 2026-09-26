import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, X } from 'lucide-react';
import { ConfirmRequestOptions } from '../types';

interface ConfirmDialogModalProps {
  config: ConfirmRequestOptions | null;
  onClose: () => void;
}

export const ConfirmDialogModal: React.FC<ConfirmDialogModalProps> = ({
  config,
  onClose,
}) => {
  const [isBusy, setIsBusy] = useState(false);

  if (!config) return null;

  const variant = config.variant || 'primary';

  const handleConfirmClick = async () => {
    setIsBusy(true);
    try {
      await config.onConfirm();
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {variant === 'danger' ? (
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
            ) : variant === 'warning' ? (
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            )}
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title}
            </h3>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {config.message}
          </p>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            {config.cancelLabel || 'Hủy bỏ'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleConfirmClick}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : variant === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isBusy
              ? 'Đang xử lý...'
              : config.confirmLabel || 'Xác nhận thực hiện'}
          </button>
        </div>
      </div>
    </div>
  );
};
