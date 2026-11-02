import React, { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

export interface ExportButtonsProps {
  onExportExcel: () => Promise<void> | void;
  onExportPdf: () => Promise<void> | void;
  labelExcel?: string;
  labelPdf?: string;
  className?: string;
  size?: 'sm' | 'md';
  onSuccess?: (msg: string) => void;
  onError?: (err: string) => void;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  onExportExcel,
  onExportPdf,
  labelExcel = 'Xuất Excel',
  labelPdf = 'Xuất PDF',
  className = '',
  size = 'sm',
  onSuccess,
  onError,
}) => {
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExcel = async () => {
    if (isExportingExcel || isExportingPdf) return;
    try {
      setIsExportingExcel(true);
      await onExportExcel();
      if (onSuccess) {
        onSuccess('Đã tải xuống file Excel (.xlsx) thành công!');
      }
    } catch (err: unknown) {
      console.error('Lỗi xuất file Excel:', err);
      const msg = err instanceof Error ? err.message : 'Có lỗi khi xuất file Excel';
      if (onError) onError(msg);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handlePdf = async () => {
    if (isExportingExcel || isExportingPdf) return;
    try {
      setIsExportingPdf(true);
      await onExportPdf();
      if (onSuccess) {
        onSuccess('Đã tải xuống file PDF (.pdf) thành công!');
      }
    } catch (err: unknown) {
      console.error('Lỗi xuất file PDF:', err);
      const msg = err instanceof Error ? err.message : 'Có lỗi khi xuất file PDF';
      if (onError) onError(msg);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const isSmall = size === 'sm';
  const paddingClass = isSmall ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs sm:text-sm';
  const iconClass = isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {/* EXCEL BUTTON */}
      <button
        type="button"
        onClick={handleExcel}
        disabled={isExportingExcel || isExportingPdf}
        title="Tải bảng tính Excel (.xlsx) với công thức và phân tích chi tiết"
        className={`${paddingClass} rounded-xl font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs border ${
          isExportingExcel
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 opacity-80 cursor-wait'
            : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white border-emerald-600 dark:border-emerald-500'
        }`}
      >
        {isExportingExcel ? (
          <Loader2 className={`${iconClass} animate-spin`} />
        ) : (
          <FileSpreadsheet className={iconClass} />
        )}
        <span>{isExportingExcel ? 'Đang tạo Excel...' : labelExcel}</span>
      </button>

      {/* PDF BUTTON */}
      <button
        type="button"
        onClick={handlePdf}
        disabled={isExportingExcel || isExportingPdf}
        title="Tải văn bản báo cáo PDF (.pdf) kèm chữ ký và định dạng in ấn chuẩn A4"
        className={`${paddingClass} rounded-xl font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs border ${
          isExportingPdf
            ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 opacity-80 cursor-wait'
            : 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white border-rose-600 dark:border-rose-500'
        }`}
      >
        {isExportingPdf ? (
          <Loader2 className={`${iconClass} animate-spin`} />
        ) : (
          <FileText className={iconClass} />
        )}
        <span>{isExportingPdf ? 'Đang tạo PDF...' : labelPdf}</span>
      </button>
    </div>
  );
};
