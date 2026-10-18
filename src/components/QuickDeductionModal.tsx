import React, { useState } from 'react';
import { MinusCircle, X, Check, ArrowRight } from 'lucide-react';

interface QuickDeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayStr: string;
  categories: string[];
  formatVND: (n: number) => string;
  onSaveDeduction: (params: {
    deductionDate: string;
    expenseTitle: string;
    category: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
    note: string;
  }) => Promise<void>;
  onNavigateToTab?: () => void;
}

export const QuickDeductionModal: React.FC<QuickDeductionModalProps> = ({
  isOpen,
  onClose,
  todayStr,
  categories,
  formatVND,
  onSaveDeduction,
  onNavigateToTab,
}) => {
  const [deductionDate, setDeductionDate] = useState<string>(todayStr || new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<string>(categories[0] || 'Chi phí vận hành');
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [keepOpen, setKeepOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const availableCategories = categories && categories.length > 0 ? categories : [
    'Chi phí vận hành',
    'Nhập bia / nước ngọt',
    'Mua thực phẩm chợ',
    'Hoàn trả khách',
    'Gas / Nhiên liệu',
    'Khác',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = expenseTitle.trim();
    if (!cleanTitle) return;
    if (amount <= 0 && unitPrice <= 0) return;

    const finalAmount = amount > 0 ? amount : quantity * unitPrice;
    if (finalAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await onSaveDeduction({
        deductionDate,
        expenseTitle: cleanTitle,
        category: category || availableCategories[0] || 'Khác',
        quantity: quantity > 0 ? quantity : 1,
        unitPrice: unitPrice > 0 ? unitPrice : undefined,
        amount: finalAmount,
        note: note.trim(),
      });

      setSavedSuccessMsg(`Đã ghi nhận trừ: ${cleanTitle} (-${formatVND(finalAmount)})`);
      setTimeout(() => setSavedSuccessMsg(null), 3000);

      if (keepOpen) {
        setExpenseTitle('');
        setQuantity(1);
        setUnitPrice(0);
        setAmount(0);
        setNote('');
      } else {
        onClose();
      }
    } catch {
      // Handled upstream
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <MinusCircle className="w-5 h-5 shrink-0" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                <span>Nhập Khoản Trừ Trong Ngày</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Khoản chi trừ tiền mặt bán ngày hoặc tiền két trực tiếp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success toast if keep open */}
        {savedSuccessMsg && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">{savedSuccessMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="p-4 sm:p-5 space-y-3.5 sm:space-y-4">
          {/* Date & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ngày trừ / chi tiêu:
              </label>
              <input
                type="date"
                required
                value={deductionDate}
                onChange={(e) => setDeductionDate(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nhóm khoản trừ:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
              >
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Expense Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên khoản trừ / chi (*):
            </label>
            <input
              type="text"
              required
              placeholder="VD: Mua bánh mì, Rau sống, Đá bi, Tiền gia vị..."
              value={expenseTitle}
              onChange={(e) => setExpenseTitle(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
            />
            {/* Quick chips */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] sm:text-[11px] text-slate-400 shrink-0">Gợi ý nhanh:</span>
              {[
                'Mua bánh mì',
                'Mua rau củ',
                'Tiền đá lạnh',
                'Gia vị / Hành tỏi',
                'Gas phụ / Nhiên liệu',
                'Vật tư quán',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setExpenseTitle(chip)}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-medium border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 text-slate-600 dark:text-slate-300 hover:text-amber-800 dark:hover:text-amber-300 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity, Unit Price, Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số lượng:
              </label>
              <input
                type="number"
                min={0.01}
                step="any"
                value={quantity}
                onChange={(e) => {
                  const q = Number(e.target.value) || 1;
                  setQuantity(q);
                  if (unitPrice > 0) setAmount(q * unitPrice);
                }}
                className="w-full h-9 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Đơn giá (VNĐ):
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={unitPrice || ''}
                placeholder="0"
                onChange={(e) => {
                  const p = Number(e.target.value) || 0;
                  setUnitPrice(p);
                  setAmount(p * (quantity || 1));
                }}
                className="w-full h-9 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Tổng tiền trừ (*):
              </label>
              <input
                type="number"
                required
                min={0}
                step="any"
                value={amount || ''}
                placeholder="0"
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full h-9 px-3 text-xs font-mono font-bold rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
              />
            </div>
          </div>

          {amount > 0 && (
            <div className="text-right text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">
              Khoản trừ sẽ ghi nhận: -{formatVND(amount)}
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú chi tiết (nếu có):
            </label>
            <input
              type="text"
              placeholder="Ghi chú người mua, ca trực hoặc số lượng hàng..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Keep open toggle & Go to full tab */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={keepOpen}
                onChange={(e) => setKeepOpen(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
              />
              <span>Tiếp tục nhập khoản khác sau khi lưu</span>
            </label>
            {onNavigateToTab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToTab();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                <span>Xem danh sách đầy đủ</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!expenseTitle.trim()) || (amount <= 0 && unitPrice <= 0)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <MinusCircle className="w-4 h-4 shrink-0" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Lưu Khoản Trừ (-' + formatVND(amount || 0) + ')'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
