import React, { useState, useMemo } from 'react';
import {
  X,
  Scissors,
  GitMerge,
  ArrowRightLeft,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  PaymentType,
  PAYMENT_LABELS,
} from '../types';
import {
  formatVND,
  formatNumber,
  extractBillTableName,
} from '../utils/parser';

interface BillSplitMergeModalProps {
  bill: BillRecord;
  billItems: BillItemRecord[];
  allBills: BillRecord[];
  allBillItems: BillItemRecord[];
  debtors: string[];
  onClose: () => void;
  onMoveTable: (
    bill: BillRecord,
    newTableName: string,
    extraNote: string
  ) => Promise<void>;
  onSplitBill: (params: {
    sourceBill: BillRecord;
    remainingItems: BillItemRecord[];
    splitItems: { item: BillItemRecord; splitQty: number }[];
    newBillTableName: string;
    newBillPaymentType: PaymentType;
    newBillDebtorName: string;
    newBillNote: string;
  }) => Promise<void>;
  onMergeBills: (params: {
    targetBill: BillRecord;
    sourceBillsToMerge: BillRecord[];
    mergedTableName: string;
    mergedPaymentType: PaymentType;
    mergedDebtorName: string;
  }) => Promise<void>;
}

const QUICK_TABLES = [
  'Bàn 01',
  'Bàn 02',
  'Bàn 03',
  'Bàn 04',
  'Bàn 05',
  'Bàn 06',
  'Bàn 07',
  'Bàn 08',
  'Bàn 09',
  'Bàn 10',
  'Bàn 12',
  'Bàn 15',
  'Bàn VIP 1',
  'Bàn VIP 2',
  'Bàn Sân Vườn 01',
  'Bàn Sân Vườn 02',
];

export const BillSplitMergeModal: React.FC<BillSplitMergeModalProps> = ({
  bill,
  billItems,
  allBills,
  allBillItems,
  debtors,
  onClose,
  onMoveTable,
  onSplitBill,
  onMergeBills,
}) => {
  const initialTable = extractBillTableName(bill) || 'Bàn 01';
  const initialExtraNote = useMemo(() => {
    const raw = (bill.note || '').trim();
    if (!raw) return '';
    const m = raw.match(
      /^(?:bàn\s+[^\-·|]+|vip\s*\d+(?:\s*&\s*vip\s*\d+)?|phòng\s+[^\-·|]+)(?:\s*[\-·|]\s*(.*))?$/i
    );
    return m ? (m[1] || '').trim() : raw;
  }, [bill.note]);

  const [mode, setMode] = useState<'split' | 'merge' | 'move'>('split');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Move Table State
  const [targetTableName, setTargetTableName] = useState(initialTable);
  const [moveExtraNote, setMoveExtraNote] = useState(initialExtraNote);

  // 2. Split Bill State: itemId -> quantity to move to new bill
  const [splitQuantities, setSplitQuantities] = useState<Record<string, number>>({});
  const [splitTableName, setSplitTableName] = useState(`${initialTable} (Tách)`);
  const [splitPaymentType, setSplitPaymentType] = useState<PaymentType>(bill.paymentType);
  const [splitDebtorName, setSplitDebtorName] = useState(bill.debtorName || '');
  const [splitExtraNote, setSplitExtraNote] = useState(
    `Tách từ ${bill.billCode} (${initialTable})`
  );

  // 3. Merge Bills State
  const [selectedMergeBillIds, setSelectedMergeBillIds] = useState<string[]>([]);
  const [mergePaymentType, setMergePaymentType] = useState<PaymentType>(bill.paymentType);
  const [mergeDebtorName, setMergeDebtorName] = useState(bill.debtorName || '');

  // Candidate bills for merging (same date first, excluding current bill)
  const candidateMergeBills = useMemo(() => {
    return allBills
      .filter((b) => b.id !== bill.id)
      .sort((a, b) => {
        const aSameDate = a.billDate === bill.billDate ? 0 : 1;
        const bSameDate = b.billDate === bill.billDate ? 0 : 1;
        if (aSameDate !== bSameDate) return aSameDate - bSameDate;
        return b.billDate.localeCompare(a.billDate) || b.createdAtMs - a.createdAtMs;
      });
  }, [allBills, bill.id, bill.billDate]);

  // Calculate Split Preview
  const splitSummary = useMemo(() => {
    let remainingTotal = 0;
    let splitTotal = 0;
    let remainingQtySum = 0;
    let splitQtySum = 0;

    const remainingItems: BillItemRecord[] = [];
    const splitItems: { item: BillItemRecord; splitQty: number }[] = [];

    for (const item of billItems) {
      const netAvailQty = Math.max(
        1,
        (item.quantity || 1) - (item.returnedQuantity || 0)
      );
      const sQty = Math.min(
        netAvailQty,
        Math.max(0, Math.round(splitQuantities[item.id] || 0))
      );
      const rQty = Math.max(0, (item.quantity || 1) - sQty);

      if (rQty > 0) {
        remainingQtySum += rQty;
        remainingTotal += rQty * item.unitPrice;
        remainingItems.push({
          ...item,
          quantity: rQty,
          subtotal: rQty * item.unitPrice,
        });
      }

      if (sQty > 0) {
        splitQtySum += sQty;
        splitTotal += sQty * item.unitPrice;
        splitItems.push({ item, splitQty: sQty });
      }
    }

    return {
      remainingTotal,
      splitTotal,
      remainingQtySum,
      splitQtySum,
      remainingItems,
      splitItems,
    };
  }, [billItems, splitQuantities]);

  // Calculate Merge Preview
  const mergeSummary = useMemo(() => {
    const selectedBills = candidateMergeBills.filter((b) =>
      selectedMergeBillIds.includes(b.id)
    );
    const tableNames = [
      initialTable,
      ...selectedBills.map((b) => extractBillTableName(b) || b.billCode),
    ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

    const combinedTableName = tableNames.join(' & ');
    const combinedTotal =
      bill.totalAmount +
      selectedBills.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
    const combinedItemsCount =
      billItems.length +
      allBillItems.filter((it) => selectedMergeBillIds.includes(it.billId)).length;

    return {
      selectedBills,
      combinedTableName,
      combinedTotal,
      combinedItemsCount,
    };
  }, [
    candidateMergeBills,
    selectedMergeBillIds,
    initialTable,
    bill.totalAmount,
    billItems.length,
    allBillItems,
  ]);

  const handleAdjustSplitQty = (itemId: string, maxQty: number, delta: number) => {
    setSplitQuantities((prev) => {
      const cur = prev[itemId] || 0;
      const next = Math.min(maxQty, Math.max(0, cur + delta));
      return { ...prev, [itemId]: next };
    });
  };

  const handleToggleSelectMergeBill = (id: string) => {
    setSelectedMergeBillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmitMove = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanTable = targetTableName.trim();
    if (!cleanTable) {
      setErrorMsg('Vui lòng nhập hoặc chọn Tên bàn mới.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onMoveTable(bill, cleanTable, moveExtraNote.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi chuyển bàn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (splitSummary.splitQtySum <= 0) {
      setErrorMsg('Vui lòng chọn ít nhất 1 món (Số lượng tách > 0) để tách sang Bill mới.');
      return;
    }
    if (splitSummary.remainingQtySum <= 0) {
      setErrorMsg(
        'Không thể tách toàn bộ 100% món sang Bill mới (Bill gốc phải còn lại ít nhất 1 món). Nếu muốn đổi bàn, hãy dùng tab "Chuyển Bàn".'
      );
      return;
    }
    if (splitPaymentType === 'debt' && !splitDebtorName.trim()) {
      setErrorMsg('Vui lòng nhập hoặc chọn Tên khách nợ cho Bill tách mới.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSplitBill({
        sourceBill: bill,
        remainingItems: splitSummary.remainingItems,
        splitItems: splitSummary.splitItems,
        newBillTableName: splitTableName.trim() || `${initialTable} (Tách)`,
        newBillPaymentType: splitPaymentType,
        newBillDebtorName: splitPaymentType === 'debt' ? splitDebtorName.trim() : '',
        newBillNote: splitExtraNote.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi tách hóa đơn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (mergeSummary.selectedBills.length === 0) {
      setErrorMsg('Vui lòng tích chọn ít nhất 1 bàn/hóa đơn khác để gộp chung.');
      return;
    }
    if (mergePaymentType === 'debt' && !mergeDebtorName.trim()) {
      setErrorMsg('Vui lòng nhập hoặc chọn Tên khách nợ cho hóa đơn sau khi gộp.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onMergeBills({
        targetBill: bill,
        sourceBillsToMerge: mergeSummary.selectedBills,
        mergedTableName: mergeSummary.combinedTableName,
        mergedPaymentType: mergePaymentType,
        mergedDebtorName: mergePaymentType === 'debt' ? mergeDebtorName.trim() : '',
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi gộp bàn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
      >
        {/* Top Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Chia Bill · Gộp Bàn · Chuyển Bàn ({bill.billCode})
            </h3>
            <p className="text-[11px] text-slate-500 font-mono">
              {initialTable} · Ngày {bill.billDate} · Tổng hiện tại: {formatVND(bill.totalAmount)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="p-2 bg-slate-100 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode('split');
              setErrorMsg(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'split'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Chia / Tách Bill</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('merge');
              setErrorMsg(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'merge'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Gộp Bàn</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('move');
              setErrorMsg(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'move'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Chuyển Bàn</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: SPLIT BILL */}
          {mode === 'split' && (
            <form onSubmit={handleSubmitSplit} className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 text-slate-700 dark:text-slate-300 leading-relaxed">
                Chọn số lượng món muốn <strong>tách sang Bill mới</strong> ở bảng dưới. Hệ thống sẽ tự động trừ số lượng tương ứng ở Bill gốc và tạo 1 Bill mới độc lập.
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500">
                      <th className="py-2 px-3">Món trong Bill</th>
                      <th className="py-2 px-2 text-right">Đơn giá</th>
                      <th className="py-2 px-2 text-center">SL Gốc</th>
                      <th className="py-2 px-3 text-center">SL Tách sang Bill mới</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                    {billItems.map((it) => {
                      const availQty = Math.max(
                        1,
                        (it.quantity || 1) - (it.returnedQuantity || 0)
                      );
                      const splitQty = splitQuantities[it.id] || 0;
                      return (
                        <tr
                          key={it.id}
                          className={
                            splitQty > 0
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/25'
                              : ''
                          }
                        >
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                            <div>{it.productName}</div>
                            {it.note && (
                              <div className="text-[10px] font-normal text-slate-500">
                                {it.note}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-600 dark:text-slate-300">
                            {formatVND(it.unitPrice)}
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold">
                            {availQty}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleAdjustSplitQty(it.id, availQty, -1)
                                }
                                className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={availQty}
                                value={splitQty}
                                onChange={(e) => {
                                  const v = Math.min(
                                    availQty,
                                    Math.max(0, Math.round(Number(e.target.value) || 0))
                                  );
                                  setSplitQuantities((prev) => ({
                                    ...prev,
                                    [it.id]: v,
                                  }));
                                }}
                                className="w-12 h-7 text-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-emerald-600 dark:text-emerald-400"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleAdjustSplitQty(it.id, availQty, 1)
                                }
                                className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Dual Preview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-[11px] font-semibold text-slate-500">
                    Bill Gốc Còn Lại ({bill.billCode})
                  </div>
                  <div className="mt-1 text-base font-extrabold font-mono text-slate-900 dark:text-white">
                    {formatVND(splitSummary.remainingTotal)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Còn {splitSummary.remainingItems.length} món ({splitSummary.remainingQtySum} ĐV)
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30">
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    Bill Mới Được Tách Ra
                  </div>
                  <div className="mt-1 text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatVND(splitSummary.splitTotal)}
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                    Tách {splitSummary.splitItems.length} món ({splitSummary.splitQtySum} ĐV)
                  </div>
                </div>
              </div>

              {/* New Split Bill Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tên bàn cho Bill mới:
                  </label>
                  <input
                    type="text"
                    value={splitTableName}
                    onChange={(e) => setSplitTableName(e.target.value)}
                    placeholder="VD: Bàn 05 (Tách 2)"
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Hình thức thanh toán Bill mới:
                  </label>
                  <select
                    value={splitPaymentType}
                    onChange={(e) => setSplitPaymentType(e.target.value as PaymentType)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="cash">Tiền mặt</option>
                    <option value="transfer">Chuyển khoản</option>
                    <option value="debt">Công nợ</option>
                  </select>
                </div>

                {splitPaymentType === 'debt' && (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                      Tên khách nợ (Bill mới):
                    </label>
                    <input
                      type="text"
                      list="split-debtors-list"
                      value={splitDebtorName}
                      onChange={(e) => setSplitDebtorName(e.target.value)}
                      placeholder="Nhập hoặc chọn tên khách nợ..."
                      className="w-full h-9 px-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/30"
                    />
                    <datalist id="split-debtors-list">
                      {debtors.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Scissors className="w-4 h-4" />
                  <span>Xác Nhận Tách Thành 2 Bill</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: MERGE BILLS */}
          {mode === 'merge' && (
            <form onSubmit={handleSubmitMerge} className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/80 text-slate-700 dark:text-slate-300 leading-relaxed">
                Tích chọn các bàn/hóa đơn muốn <strong>gộp chung vào {bill.billCode} ({initialTable})</strong>. Toàn bộ món ăn sẽ được cộng dồn vào 1 hóa đơn duy nhất.
              </div>

              {candidateMergeBills.length === 0 ? (
                <div className="py-8 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Không có hóa đơn nào khác để gộp.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                  {candidateMergeBills.map((cand) => {
                    const checked = selectedMergeBillIds.includes(cand.id);
                    const candTable = extractBillTableName(cand) || cand.billCode;
                    const isSameDay = cand.billDate === bill.billDate;
                    return (
                      <label
                        key={cand.id}
                        className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          checked
                            ? 'bg-blue-50/80 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleSelectMergeBill(cand.id)}
                            className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{candTable}</span>
                              <span className="font-mono text-[11px] text-slate-500">
                                ({cand.billCode})
                              </span>
                              {isSameDay && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                                  Cùng ngày {cand.billDate}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-md">
                              {cand.itemsSummary}
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {formatVND(cand.totalAmount)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {PAYMENT_LABELS[cand.paymentType]}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Merge Summary Card */}
              <div className="p-3.5 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-blue-800 dark:text-blue-300">
                    Bàn sau khi gộp ({mergeSummary.selectedBills.length + 1} bill):
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {mergeSummary.combinedTableName}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-[11px] text-slate-500">
                    Tổng cộng sau khi gộp:
                  </div>
                  <div className="text-lg font-extrabold text-blue-600 dark:text-blue-400">
                    {formatVND(mergeSummary.combinedTotal)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Hình thức thanh toán sau khi gộp:
                  </label>
                  <select
                    value={mergePaymentType}
                    onChange={(e) => setMergePaymentType(e.target.value as PaymentType)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="cash">Tiền mặt</option>
                    <option value="transfer">Chuyển khoản</option>
                    <option value="debt">Công nợ</option>
                  </select>
                </div>

                {mergePaymentType === 'debt' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                      Tên khách nợ:
                    </label>
                    <input
                      type="text"
                      value={mergeDebtorName}
                      onChange={(e) => setMergeDebtorName(e.target.value)}
                      placeholder="Nhập tên khách nợ..."
                      className="w-full h-9 px-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || mergeSummary.selectedBills.length === 0}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <GitMerge className="w-4 h-4" />
                  <span>Xác Nhận Gộp Bàn ({mergeSummary.selectedBills.length + 1} Bill → 1 Bill)</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: MOVE TABLE */}
          {mode === 'move' && (
            <form onSubmit={handleSubmitMove} className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-slate-700 dark:text-slate-300 leading-relaxed">
                Đổi nhanh số bàn hoặc phòng VIP cho hóa đơn <strong>{bill.billCode}</strong> (từ{' '}
                <strong>{initialTable}</strong> sang bàn mới).
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Chọn nhanh bàn trống / phòng VIP:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TABLES.map((tbl) => {
                    const active =
                      targetTableName.trim().toLowerCase() === tbl.toLowerCase();
                    return (
                      <button
                        key={tbl}
                        type="button"
                        onClick={() => setTargetTableName(tbl)}
                        className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          active
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                      >
                        {tbl}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tên bàn / Phòng mới:
                  </label>
                  <input
                    type="text"
                    value={targetTableName}
                    onChange={(e) => setTargetTableName(e.target.value)}
                    placeholder="VD: Bàn 12, Bàn VIP 2..."
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Ghi chú kèm theo (Tùy chọn):
                  </label>
                  <input
                    type="text"
                    value={moveExtraNote}
                    onChange={(e) => setMoveExtraNote(e.target.value)}
                    placeholder="VD: Khách chuyển từ ngoài sân vào phòng lạnh..."
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác Nhận Chuyển Sang {targetTableName || 'Bàn Mới'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
