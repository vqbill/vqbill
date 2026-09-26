import React, { useState, useMemo, useEffect } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash2,
  Plus,
  Receipt,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  DeductionRecord,
  ReturnRecord,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, formatNumber, getCurrentBusinessDate } from '../utils/parser';

interface ReturnsDeductionsTabProps {
  mode: 'deductions' | 'returns';
  bills: BillRecord[];
  billItems: BillItemRecord[];
  deductions: DeductionRecord[];
  returns: ReturnRecord[];
  canWrite: boolean;
  canDelete: boolean;
  preselectedBillId?: string | null;
  onAddExpenseDeduction: (params: {
    deductionDate: string;
    expenseTitle: string;
    category: string;
    amount: number;
    note: string;
  }) => Promise<void>;
  onRecordReturn: (params: {
    bill: BillRecord;
    billItem: BillItemRecord;
    returnQty: number;
    returnDate: string;
    note: string;
  }) => Promise<void>;
  onDeleteDeductionsBatch: (deductionIds: string[]) => Promise<void>;
  onDeleteReturnsBatch: (returnIds: string[]) => Promise<void>;
  onDeleteAllMenuProducts: () => void;
  menuProductsCount: number;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

const EXPENSE_PRESETS = [
  { title: 'Mua bánh mì', category: 'Mua bánh mì / Rau / Gia vị', defaultAmount: 50000 },
  { title: 'Mua rau & gia vị bếp', category: 'Mua bánh mì / Rau / Gia vị', defaultAmount: 120000 },
  { title: 'Trả tiền nguyên liệu tươi sống', category: 'Nguyên liệu / Thực phẩm', defaultAmount: 500000 },
  { title: 'Mua đá cây / đá bi / gas', category: 'Vật tư / Đá / Gas', defaultAmount: 100000 },
  { title: 'Tiền bồi hoàn cho khách', category: 'Bồi hoàn / Hoàn trả khách', defaultAmount: 100000 },
  { title: 'Khoản hoàn trả khách (Nhập thủ công)', category: 'Bồi hoàn / Hoàn trả khách', defaultAmount: 50000 },
];

const EXPENSE_CATEGORIES = [
  'Mua bánh mì / Rau / Gia vị',
  'Nguyên liệu / Thực phẩm',
  'Bồi hoàn / Hoàn trả khách',
  'Vật tư / Đá / Gas',
  'Chi phí vận hành trong ngày',
  'Khác',
];

export const ReturnsDeductionsTab: React.FC<ReturnsDeductionsTabProps> = ({
  mode,
  bills,
  billItems,
  deductions,
  returns,
  canWrite,
  canDelete,
  preselectedBillId,
  onAddExpenseDeduction,
  onRecordReturn,
  onDeleteDeductionsBatch,
  onDeleteReturnsBatch,
  onDeleteAllMenuProducts,
  menuProductsCount,
  requestConfirm,
}) => {
  const todayStr = getCurrentBusinessDate();

  // State for Manual Expense Deduction ("Khoản trừ")
  const [deductionDate, setDeductionDate] = useState<string>(todayStr);
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expenseAmount, setExpenseAmount] = useState<number>(50000);
  const [expenseNote, setExpenseNote] = useState<string>('');
  const [searchDeduction, setSearchDeduction] = useState('');

  // State for Customer Item Return ("Hoàn trả")
  const availableBillDates = useMemo(() => {
    const set = new Set(bills.map((b) => b.billDate));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [bills]);

  const [selectedBillDate, setSelectedBillDate] = useState<string>('all');
  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [returnQty, setReturnQty] = useState<number>(1);
  const [returnDate, setReturnDate] = useState<string>(todayStr);
  const [returnNote, setReturnNote] = useState<string>('');
  const [searchReturn, setSearchReturn] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  useEffect(() => {
    setStatusMsg(null);
  }, [mode]);

  useEffect(() => {
    if (preselectedBillId) {
      const found = bills.find((b) => b.id === preselectedBillId);
      if (found) {
        setSelectedBillDate(found.billDate);
        setSelectedBillId(found.id);
      }
    }
  }, [preselectedBillId, bills]);

  const filteredBillsForDate = useMemo(() => {
    const list =
      selectedBillDate === 'all'
        ? bills
        : bills.filter((b) => b.billDate === selectedBillDate);
    return list.sort((a, b) => b.billDate.localeCompare(a.billDate));
  }, [bills, selectedBillDate]);

  const activeBill = useMemo(() => {
    if (selectedBillId) {
      const found = filteredBillsForDate.find((b) => b.id === selectedBillId);
      if (found) return found;
    }
    return filteredBillsForDate[0] || null;
  }, [filteredBillsForDate, selectedBillId]);

  const itemsInActiveBill = useMemo(() => {
    if (!activeBill) return [];
    return billItems.filter((it) => it.billId === activeBill.id);
  }, [billItems, activeBill]);

  const activeBillItem = useMemo(() => {
    if (selectedItemId) {
      const found = itemsInActiveBill.find((it) => it.id === selectedItemId);
      if (found) return found;
    }
    return itemsInActiveBill[0] || null;
  }, [itemsInActiveBill, selectedItemId]);

  const maxReturnableQty = activeBillItem
    ? Math.max(0, activeBillItem.quantity - activeBillItem.returnedQuantity)
    : 0;

  useEffect(() => {
    if (maxReturnableQty > 0 && returnQty > maxReturnableQty) {
      setReturnQty(maxReturnableQty);
    } else if (maxReturnableQty > 0 && returnQty < 1) {
      setReturnQty(1);
    }
  }, [maxReturnableQty, returnQty]);

  // Handlers for Khoản Trừ (Daily Expenses)
  const handleAddExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!canWrite) {
      setStatusMsg({
        type: 'err',
        text: 'Tài khoản Chỉ xem không có quyền thêm khoản trừ.',
      });
      return;
    }

    const cleanTitle = expenseTitle.trim();
    if (!cleanTitle) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng nhập nội dung chi tiêu (VD: Mua bánh mì, mua rau, trả tiền nguyên liệu...).',
      });
      return;
    }

    const safeAmt = Math.max(0, Math.round(Number(expenseAmount) || 0));
    if (safeAmt <= 0) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng nhập số tiền khoản trừ lớn hơn 0đ.',
      });
      return;
    }

    requestConfirm({
      title: 'Xác nhận Ghi Nhận Khoản Trừ (Chi Tiêu Ngày)',
      message: `Bạn có chắc chắn muốn lưu khoản trừ "${cleanTitle}" (-${formatVND(
        safeAmt
      )}, ngày ${deductionDate}) vào hệ thống? Khoản này sẽ được trừ trực tiếp vào Doanh thu tổng ngày (Tiền mặt + Chuyển khoản - Khoản trừ).`,
      confirmLabel: 'Lưu Khoản Trừ',
      variant: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onAddExpenseDeduction({
            deductionDate,
            expenseTitle: cleanTitle,
            category: expenseCategory,
            amount: safeAmt,
            note: expenseNote.trim() || cleanTitle,
          });
          setStatusMsg({
            type: 'ok',
            text: `Đã lưu khoản trừ "${cleanTitle}" (-${formatVND(
              safeAmt
            )}) vào ngày ${deductionDate}!`,
          });
          setExpenseTitle('');
          setExpenseNote('');
        } catch (err: any) {
          setStatusMsg({
            type: 'err',
            text: err?.message || 'Lỗi khi lưu khoản trừ.',
          });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const handleDeleteOneDeduction = (ded: DeductionRecord) => {
    if (!canDelete) return;
    requestConfirm({
      title: 'Xác nhận Xóa Khoản Trừ',
      message: `Bạn có chắc chắn muốn xóa khoản trừ "${ded.productName}" (-${formatVND(
        ded.amount
      )}) khỏi lịch sử trên Firebase không?`,
      confirmLabel: 'Xóa khoản trừ',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteDeductionsBatch([ded.id]);
      },
    });
  };

  const filteredDeductions = useMemo(() => {
    return deductions
      .filter((d) => {
        if (!searchDeduction.trim()) return true;
        const q = searchDeduction.toLowerCase();
        return (
          d.productName.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.deductionDate.includes(q) ||
          d.note.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          b.deductionDate.localeCompare(a.deductionDate) || b.createdAtMs - a.createdAtMs
      );
  }, [deductions, searchDeduction]);

  const totalDeductionsAmount = useMemo(
    () => filteredDeductions.reduce((s, d) => s + d.amount, 0),
    [filteredDeductions]
  );

  const handleDeleteAllDeductionsClick = () => {
    if (!canDelete || filteredDeductions.length === 0) return;
    const ids = filteredDeductions.map((d) => d.id);
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Khoản Trừ',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${ids.length} khoản trừ đang hiển thị khỏi Firebase không?`,
      confirmLabel: 'Xóa tất cả khoản trừ',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteDeductionsBatch(ids);
      },
    });
  };

  // Handlers for Hoàn Trả (Customer Returns)
  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!canWrite) {
      setStatusMsg({
        type: 'err',
        text: 'Tài khoản Chỉ xem không có quyền thực hiện hoàn trả.',
      });
      return;
    }

    if (!activeBill || !activeBillItem) {
      setStatusMsg({
        type: 'err',
        text: 'Vui lòng chọn Hóa đơn và Món cần hoàn trả.',
      });
      return;
    }

    if (maxReturnableQty <= 0) {
      setStatusMsg({
        type: 'err',
        text: 'Món này trong hóa đơn đã được hoàn trả hết số lượng.',
      });
      return;
    }

    const safeQty = Math.min(Math.max(1, Math.round(returnQty)), maxReturnableQty);
    const refundAmt = safeQty * activeBillItem.unitPrice;

    requestConfirm({
      title: 'Xác nhận Hoàn Trả Bia / Món Thừa',
      message: `Bạn có chắc chắn muốn ghi nhận khách hoàn trả ${safeQty} "${
        activeBillItem.productName
      }" (Tiền hoàn lại: ${formatVND(refundAmt)}) từ Bill ${activeBill.billCode} (ngày ${
        activeBill.billDate
      }) không? Lưu ý: Khoản hoàn trả này được lưu riêng ở mục Hoàn trả và KHÔNG tự động cộng vào Khoản trừ chi tiêu trong ngày.`,
      confirmLabel: 'Xác nhận Hoàn trả',
      variant: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onRecordReturn({
            bill: activeBill,
            billItem: activeBillItem,
            returnQty: safeQty,
            returnDate,
            note:
              returnNote.trim() ||
              `Khách trả lại ${safeQty} ${activeBillItem.productName} từ bill ${activeBill.billCode} (ngày ${activeBill.billDate})`,
          });
          setStatusMsg({
            type: 'ok',
            text: `Đã ghi nhận hoàn trả ${safeQty} ${activeBillItem.productName} (${formatVND(
              refundAmt
            )}) vào tab Hoàn trả (Không tự động cộng vào Khoản trừ)!`,
          });
          setReturnNote('');
        } catch (err: any) {
          setStatusMsg({
            type: 'err',
            text: err?.message || 'Lỗi khi lưu khoản hoàn trả.',
          });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const filteredReturns = useMemo(() => {
    return returns
      .filter((r) => {
        if (!searchReturn.trim()) return true;
        const q = searchReturn.toLowerCase();
        return (
          r.productName.toLowerCase().includes(q) ||
          r.billCode.toLowerCase().includes(q) ||
          r.billDate.includes(q) ||
          r.returnDate.includes(q) ||
          r.note.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          b.returnDate.localeCompare(a.returnDate) || b.createdAtMs - a.createdAtMs
      );
  }, [returns, searchReturn]);

  const totalReturnsAmount = useMemo(
    () => filteredReturns.reduce((s, r) => s + r.amount, 0),
    [filteredReturns]
  );

  const handleDeleteOneReturn = (ret: ReturnRecord) => {
    if (!canDelete) return;
    requestConfirm({
      title: 'Xác nhận Xóa Bản Ghi Hoàn Trả',
      message: `Bạn có chắc chắn muốn xóa bản ghi hoàn trả "${ret.productName}" (${formatVND(
        ret.amount
      )}) khỏi Firebase không?`,
      confirmLabel: 'Xóa bản ghi hoàn trả',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteReturnsBatch([ret.id]);
      },
    });
  };

  const handleDeleteAllReturnsClick = () => {
    if (!canDelete || filteredReturns.length === 0) return;
    const ids = filteredReturns.map((r) => r.id);
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Bản Ghi Hoàn Trả',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${ids.length} bản ghi hoàn trả đang hiển thị khỏi Firebase không?`,
      confirmLabel: 'Xóa tất cả hoàn trả',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteReturnsBatch(ids);
      },
    });
  };

  // RENDER MODE 1: KHOẢN TRỪ (DAILY EXPENSES)
  if (mode === 'deductions') {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <span>Quản Lý Khoản Trừ (Chi Tiêu Trong Ngày)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Khoản trừ là những tiền chi ra trong ngày (ví dụ: <strong>mua bánh mì, mua rau, trả tiền nguyên liệu, tiền bồi hoàn cho khách, hoặc các khoản hoàn trả nhập thủ công</strong>). Công thức: <strong>Doanh thu tổng ngày = Tiền mặt + Chuyển khoản - Khoản trừ</strong>.
              </p>
            </div>
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
                statusMsg.type === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
              }`}
            >
              {statusMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Quick Expense Presets */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Chọn nhanh khoản chi phổ biến trong ngày:
            </span>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setExpenseTitle(preset.title);
                    setExpenseCategory(preset.category);
                    setExpenseAmount(preset.defaultAmount);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-rose-500 dark:hover:border-rose-500 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  + {preset.title}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleAddExpenseSubmit}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800"
          >
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ngày chi (Khoản trừ)
              </label>
              <input
                type="date"
                value={deductionDate}
                onChange={(e) => setDeductionDate(e.target.value)}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nội dung khoản chi *
              </label>
              <input
                type="text"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="VD: Mua bánh mì, mua rau, trả nguyên liệu..."
                className="w-full h-10 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nhóm khoản trừ
              </label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="w-full h-10 px-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Số tiền chi (₫) *
              </label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(Number(e.target.value))}
                className="w-full h-10 px-3 text-xs font-mono font-bold text-rose-600 dark:text-rose-400 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="lg:col-span-3 flex flex-col justify-end">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ghi chú thêm
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={expenseNote}
                  onChange={(e) => setExpenseNote(e.target.value)}
                  placeholder="Ghi chú (tùy chọn)..."
                  className="flex-1 h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !canWrite}
                  className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shrink-0 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Lưu Khoản Trừ</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Deductions History Table */}
        <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Danh Sách Khoản Trừ Trong Ngày / Kỳ ({filteredDeductions.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tổng tiền khoản trừ (Trừ vào Doanh thu ngày):{' '}
                <strong className="font-mono text-rose-600 dark:text-rose-400">
                  -{formatVND(totalDeductionsAmount)}
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDeduction}
                  onChange={(e) => setSearchDeduction(e.target.value)}
                  placeholder="Tìm khoản chi, ngày, ghi chú..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {canDelete && filteredDeductions.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAllDeductionsClick}
                  className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa tất cả ({filteredDeductions.length})</span>
                </button>
              )}
            </div>
          </div>

          {filteredDeductions.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              Chưa có khoản trừ (chi tiêu trong ngày) nào trong kỳ này.
            </div>
          ) : (
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">Ngày chi</th>
                    <th className="py-2.5 px-3">Khoản chi / Nội dung</th>
                    <th className="py-2.5 px-3">Nhóm chi phí</th>
                    <th className="py-2.5 px-3 text-right">Số tiền trừ</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                    {canDelete && <th className="py-2.5 px-3 text-right">Xóa</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredDeductions.map((ded) => (
                    <tr key={ded.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                        {ded.deductionDate}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {ded.productName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {ded.category}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        -{formatVND(ded.amount)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {ded.note}
                      </td>
                      {canDelete && (
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteOneDeduction(ded)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Xóa khoản trừ"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // RENDER MODE 2: HOÀN TRẢ (CUSTOMER ITEM RETURNS - BEER / DISHES)
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Quản Lý Hoàn Trả (Khách Trả Bia Thừa / Món Thừa)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Hoàn trả là khoản tiền hoàn lại cho khách khi khách trả bia thừa, món thừa theo hóa đơn. <strong>Hoàn trả KHÔNG tự động cập nhật vào Khoản trừ chi tiêu trong ngày</strong> (Nếu muốn tính vào chi tiêu ngày, bạn nhập thủ công bên tab Khoản trừ).
            </p>
          </div>

          {canWrite && menuProductsCount > 0 && (
            <button
              type="button"
              onClick={onDeleteAllMenuProducts}
              className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa tất cả SP Menu ({menuProductsCount})</span>
            </button>
          )}
        </div>

        {statusMsg && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
              statusMsg.type === 'ok'
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
            }`}
          >
            {statusMsg.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Quick Date Picker Chips */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Bước 1: Chọn Ngày Hóa Đơn có bia / món khách trả lại
          </label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setSelectedBillDate('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                selectedBillDate === 'all'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả ({bills.length} bill)
            </button>
            {availableBillDates.slice(0, 6).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setSelectedBillDate(d);
                  setSelectedBillId('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition-colors whitespace-nowrap cursor-pointer ${
                  selectedBillDate === d
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {d}
              </button>
            ))}
            <input
              type="date"
              value={selectedBillDate === 'all' ? '' : selectedBillDate}
              onChange={(e) => {
                setSelectedBillDate(e.target.value || 'all');
                setSelectedBillId('');
              }}
              className="px-2.5 py-1.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0"
            />
          </div>
        </div>

        <form
          onSubmit={handleConfirmReturn}
          className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 pt-1"
        >
          {/* Step 2: Select Bill & Item */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Bước 2: Chọn Hóa Đơn (Bill)
              </label>
              <select
                value={activeBill?.id || ''}
                onChange={(e) => {
                  setSelectedBillId(e.target.value);
                  setSelectedItemId('');
                }}
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {filteredBillsForDate.map((b) => (
                  <option key={b.id} value={b.id}>
                    [{b.billDate}] {b.billCode} — {PAYMENT_LABELS[b.paymentType]} (
                    {formatVND(b.totalAmount)}) — {b.itemsSummary.slice(0, 55)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bước 3: Chọn bia / món khách trả lại trong Bill
              </label>

              <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Chọn</th>
                      <th className="py-2.5 px-3">Tên món trong Bill</th>
                      <th className="py-2.5 px-2 text-right">Đã mua</th>
                      <th className="py-2.5 px-2 text-right">Đã trả</th>
                      <th className="py-2.5 px-2 text-right">Còn lại</th>
                      <th className="py-2.5 px-3 text-right">Đơn giá</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                    {itemsInActiveBill.map((it) => {
                      const remain = Math.max(0, it.quantity - it.returnedQuantity);
                      const isPicked = activeBillItem?.id === it.id;
                      return (
                        <tr
                          key={it.id}
                          onClick={() => {
                            setSelectedItemId(it.id);
                            setReturnQty(Math.min(1, remain));
                          }}
                          className={`cursor-pointer transition-colors ${
                            isPicked
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="radio"
                              name="returnItem"
                              checked={isPicked}
                              onChange={() => setSelectedItemId(it.id)}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                            {it.productName}
                          </td>
                          <td className="py-2.5 px-2 text-right">{it.quantity}</td>
                          <td className="py-2.5 px-2 text-right text-indigo-600 dark:text-indigo-400">
                            {it.returnedQuantity}
                          </td>
                          <td className="py-2.5 px-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {remain}
                          </td>
                          <td className="py-2.5 px-3 text-right">{formatVND(it.unitPrice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Step 4: Quantity & Note Confirmation */}
          <div className="lg:col-span-5 p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="pb-2.5 border-b border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  Món / Bia đang chọn hoàn trả:
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeBillItem ? activeBillItem.productName : 'Chưa chọn món'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Số lượng trả (Tối đa: {maxReturnableQty})
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, maxReturnableQty)}
                    value={returnQty}
                    onChange={(e) => setReturnQty(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ngày hoàn trả
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú hoàn trả (Bia thừa / Món thừa)
                </label>
                <textarea
                  rows={3}
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="Ví dụ: Khách trả lại 5 lon bia Tiger chưa khui..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500">Tiền hoàn lại cho khách:</span>
                <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                  {formatVND((activeBillItem?.unitPrice || 0) * (returnQty || 0))}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !canWrite || maxReturnableQty <= 0}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Đang lưu hoàn trả...'
                    : 'Xác Nhận Hoàn Trả Bia / Món Thừa'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Returns History */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Lịch Sử Hoàn Trả Bia Thừa / Món Thừa ({filteredReturns.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tổng tiền hoàn trả hiển thị (Không tự cộng vào Khoản trừ):{' '}
              <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                {formatVND(totalReturnsAmount)}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchReturn}
                onChange={(e) => setSearchReturn(e.target.value)}
                placeholder="Tìm món trả, mã bill, ghi chú..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {canDelete && filteredReturns.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllReturnsClick}
                className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả ({filteredReturns.length})</span>
              </button>
            )}
          </div>
        </div>

        {filteredReturns.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            Chưa có bản ghi hoàn trả bia thừa / món thừa nào.
          </div>
        ) : (
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Ngày trả</th>
                  <th className="py-2.5 px-3">Bill gốc</th>
                  <th className="py-2.5 px-3">Món / Bia hoàn trả</th>
                  <th className="py-2.5 px-3">Danh mục</th>
                  <th className="py-2.5 px-3 text-right">SL trả</th>
                  <th className="py-2.5 px-3 text-right">Tiền hoàn trả</th>
                  <th className="py-2.5 px-3">Ghi chú</th>
                  {canDelete && <th className="py-2.5 px-3 text-right">Xóa</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredReturns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {ret.returnDate}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                      {ret.billCode} ({ret.billDate})
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      {ret.productName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      {ret.category}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {formatNumber(ret.quantity)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {formatVND(ret.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {ret.note}
                    </td>
                    {canDelete && (
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteOneReturn(ret)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Xóa hoàn trả"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
