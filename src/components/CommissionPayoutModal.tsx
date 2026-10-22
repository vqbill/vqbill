import React, { useState, useEffect } from 'react';
import { MinusCircle, X, Check, Banknote, CreditCard, UserCheck, AlertCircle } from 'lucide-react';
import { BillRecord, DeductionRecord } from '../types';
import { extractBillTableName } from '../utils/parser';

interface CommissionPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: BillRecord | null;
  existingDeduction?: DeductionRecord | null;
  onSave: (params: {
    bill: BillRecord;
    deductionDate: string;
    amount: number;
    recipientName: string;
    paymentMethod: 'cash' | 'transfer';
    note: string;
    existingDeductionId?: string;
  }) => Promise<void>;
  formatVND: (n: number) => string;
}

export const CommissionPayoutModal: React.FC<CommissionPayoutModalProps> = ({
  isOpen,
  onClose,
  bill,
  existingDeduction,
  onSave,
  formatVND,
}) => {
  const [deductionDate, setDeductionDate] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && bill) {
      const todayStr = new Date().toISOString().split('T')[0];
      const initialDate = existingDeduction?.deductionDate || bill.billDate || todayStr;
      const initialAmount = existingDeduction?.amount ?? (bill.discountAmount || 0);
      
      // Extract existing recipient from existing deduction or bill note
      let initialRecipient = '';
      if (existingDeduction) {
        const prodMatch = (existingDeduction.productName || '').match(/Chi hoa hồng.*?:\s*(.+)$/i);
        if (prodMatch && prodMatch[1]) {
          initialRecipient = prodMatch[1].trim();
        } else if (existingDeduction.note) {
          const noteMatch = existingDeduction.note.match(/người đặt(?:\s*bàn)?:\s*([^\-·,\n]+)/i);
          if (noteMatch && noteMatch[1]) {
            initialRecipient = noteMatch[1].trim();
          }
        }
      }
      if (!initialRecipient && bill.note) {
        const bookerMatch = bill.note.match(/(?:người đặt|đặt bàn|ck đặt bàn|hoa hồng)\s*[:\-]\s*([^\-·,\n]+)/i);
        if (bookerMatch && bookerMatch[1]) {
          initialRecipient = bookerMatch[1].trim();
        }
      }
      if (!initialRecipient && bill.debtorName && bill.debtorName !== 'Khách nợ') {
        initialRecipient = bill.debtorName;
      }

      const tableLabel = extractBillTableName(bill) || bill.tableName || 'Bàn';
      const initialNote =
        existingDeduction?.note ||
        `Chiết khấu / Hoa hồng gửi người đặt bàn (${tableLabel}) · Hóa đơn ${bill.billCode}`;

      setDeductionDate(initialDate);
      setAmountInput(initialAmount > 0 ? String(initialAmount) : '');
      setRecipientName(initialRecipient);
      setPaymentMethod('cash');
      setNote(initialNote);
      setErrorMsg(null);
    }
  }, [isOpen, bill, existingDeduction]);

  if (!isOpen || !bill) return null;

  const currentAmount = Math.max(0, Math.round(Number(amountInput) || 0));
  const tableLabel = extractBillTableName(bill) || bill.tableName || 'Bàn';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAmount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền chi hoa hồng / chiết khấu (> 0đ).');
      return;
    }
    if (!deductionDate) {
      setErrorMsg('Vui lòng chọn ngày chi tiền.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        bill,
        deductionDate,
        amount: currentAmount,
        recipientName: recipientName.trim() || 'Người đặt bàn',
        paymentMethod,
        note: note.trim(),
        existingDeductionId: existingDeduction?.id,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi khi lưu khoản chi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md">
              <MinusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Gửi Tiền Chiết Khấu / Hoa Hồng Đặt Bàn</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ghi nhận khoản chi quỹ cho hóa đơn <strong className="font-mono text-amber-600 dark:text-amber-400">{bill.billCode}</strong> · {tableLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Context Card */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-slate-500">Tổng hóa đơn gốc: </span>
              <strong className="font-mono text-slate-800 dark:text-slate-200">
                {formatVND(bill.subtotalAmount || (bill.totalAmount + (bill.discountAmount || 0)))}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Chi hoa hồng / CK: </span>
              <strong className="font-mono text-rose-600 dark:text-rose-400">
                {currentAmount > 0 ? `-${formatVND(currentAmount)}` : '0 ₫'}
              </strong>
            </div>
            <div className="w-full text-xs text-emerald-700 dark:text-emerald-400 flex items-center justify-between mt-1 pt-1.5 border-t border-slate-200 dark:border-slate-700 font-bold">
              <span>Hóa đơn sau trừ ({tableLabel}):</span>
              <span className="font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatVND(
                  Math.max(
                    0,
                    (bill.subtotalAmount || (bill.totalAmount + (bill.discountAmount || 0))) - currentAmount
                  )
                )}
              </span>
            </div>
            {existingDeduction && (
              <div className="w-full text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
                <Check className="w-3.5 h-3.5" />
                <span>Đã có khoản chi trước đó: {formatVND(existingDeduction.amount)} (Lưu để cập nhật)</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Ngày chi */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ngày chi tiền <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={deductionDate}
                onChange={(e) => setDeductionDate(e.target.value)}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Số tiền chi */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số tiền gửi người đặt <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="VD: 200000"
                  className="w-full h-10 pl-3 pr-8 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  ₫
                </span>
              </div>
            </div>
          </div>

          {/* Quick preset amounts */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="text-slate-500 font-medium">Chọn nhanh:</span>
            {bill.discountAmount && bill.discountAmount > 0 && (
              <button
                type="button"
                onClick={() => setAmountInput(String(bill.discountAmount))}
                className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold font-mono hover:bg-amber-200 cursor-pointer"
              >
                CK Bill ({formatVND(bill.discountAmount)})
              </button>
            )}
            {[100000, 200000, 300000, 500000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountInput(String(preset))}
                className={`px-2 py-0.5 rounded-lg border font-mono font-semibold cursor-pointer transition-colors ${
                  currentAmount === preset
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {formatVND(preset)}
              </button>
            ))}
          </div>

          {/* Người nhận tiền chiết khấu */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Người nhận chiết khấu (Tên / SĐT người đặt bàn)
            </label>
            <div className="relative">
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="VD: Anh Nam đặt bàn 0988xxx, Chị Lan..."
                className="w-full h-10 pl-9 pr-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Hình thức chi tiền */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hình thức chi trả tiền
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`h-10 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  paymentMethod === 'cash'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>Tiền mặt (Két quán)</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`h-10 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  paymentMethod === 'transfer'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Chuyển khoản NH</span>
              </button>
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú sổ quỹ
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú chi tiết khoản gửi hoa hồng..."
              className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Realtime summary display */}
          <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs">
            <span className="text-amber-800 dark:text-amber-300 font-medium">
              Ghi giảm quỹ tiền ngày {deductionDate}:
            </span>
            <span className="text-base font-extrabold font-mono text-amber-700 dark:text-amber-300">
              -{formatVND(currentAmount)}
            </span>
          </div>

          {/* Footer buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || currentAmount <= 0}
              className="flex-2 h-11 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
            >
              {isSubmitting ? (
                <span>Đang lưu...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Xác Nhận Chi Tiền (-{formatVND(currentAmount)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
