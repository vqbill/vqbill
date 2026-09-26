import React, { useState, useMemo, useEffect } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash2,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  DeductionRecord,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, formatNumber } from '../utils/parser';

interface ReturnsDeductionsTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  deductions: DeductionRecord[];
  canWrite: boolean;
  canDelete: boolean;
  preselectedBillId?: string | null;
  onRecordReturn: (params: {
    bill: BillRecord;
    billItem: BillItemRecord;
    returnQty: number;
    deductionDate: string;
    note: string;
  }) => Promise<void>;
  onDeleteDeductionsBatch: (deductionIds: string[]) => Promise<void>;
  onDeleteAllMenuProducts: () => void;
  menuProductsCount: number;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const ReturnsDeductionsTab: React.FC<ReturnsDeductionsTabProps> = ({
  bills,
  billItems,
  deductions,
  canWrite,
  canDelete,
  preselectedBillId,
  onRecordReturn,
  onDeleteDeductionsBatch,
  onDeleteAllMenuProducts,
  menuProductsCount,
  requestConfirm,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Unique dates that have bills (so user can easily click 2026-08-20 or today)
  const availableBillDates = useMemo(() => {
    const set = new Set(bills.map((b) => b.billDate));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [bills]);

  const [selectedBillDate, setSelectedBillDate] = useState<string>('all');
  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [returnQty, setReturnQty] = useState<number>(1);
  const [deductionDate, setDeductionDate] = useState<string>(todayStr);
  const [note, setNote] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [searchDeduction, setSearchDeduction] = useState('');

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
      title: 'Xác nhận Hoàn Trả Hàng Hóa & Ghi Khoản Trừ',
      message: `Bạn có chắc chắn muốn hoàn trả ${safeQty} "${
        activeBillItem.productName
      }" (Số tiền trừ: -${formatVND(refundAmt)}) từ Bill ${activeBill.billCode} (ngày ${
        activeBill.billDate
      }) và lưu vào Firebase không?`,
      confirmLabel: 'Xác nhận Hoàn trả',
      variant: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onRecordReturn({
            bill: activeBill,
            billItem: activeBillItem,
            returnQty: safeQty,
            deductionDate,
            note:
              note.trim() ||
              `Hoàn trả ${safeQty} ${activeBillItem.productName} từ bill ${activeBill.billCode} (ngày ${activeBill.billDate})`,
          });
          setStatusMsg({
            type: 'ok',
            text: `Đã hoàn trả ${safeQty} ${activeBillItem.productName} (${formatVND(
              refundAmt
            )}) và lưu vào Khoản trừ + Ghi chú trên Firebase!`,
          });
          setNote('');
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

  const filteredDeductions = useMemo(() => {
    return deductions
      .filter((d) => {
        if (!searchDeduction.trim()) return true;
        const q = searchDeduction.toLowerCase();
        return (
          d.productName.toLowerCase().includes(q) ||
          d.billCode.toLowerCase().includes(q) ||
          d.billDate.includes(q) ||
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

  return (
    <div className="space-y-6">
      {/* Return Builder Card */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Hoàn Trả Hàng Hóa & Ghi Nhận Khoản Trừ
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ví dụ: Bill ngày 20/08/2026 có 15 lon bia → Chọn ngày 2026-08-20, chọn Bill, chọn món Bia và số lon trả lại để hệ thống tự động lưu vào Khoản trừ kèm ghi chú.
            </p>
          </div>

          {canWrite && menuProductsCount > 0 && (
            <button
              type="button"
              onClick={onDeleteAllMenuProducts}
              className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa tất cả sản phẩm trong Menu ({menuProductsCount})</span>
            </button>
          )}
        </div>

        {statusMsg && (
          <div
            className={`p-3.5 rounded-lg border flex items-center gap-2.5 text-xs ${
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
            Bước 1: Chọn Ngày Hóa Đơn cần hoàn trả
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedBillDate('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                selectedBillDate === 'all'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả các ngày ({bills.length} bill)
            </button>
            {availableBillDates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setSelectedBillDate(d);
                  setSelectedBillId('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors cursor-pointer ${
                  selectedBillDate === d
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {d === '2026-08-20' ? '2026-08-20 (Bill 15 lon bia)' : d}
              </button>
            ))}
            <input
              type="date"
              value={selectedBillDate === 'all' ? '' : selectedBillDate}
              onChange={(e) => {
                setSelectedBillDate(e.target.value || 'all');
                setSelectedBillId('');
              }}
              className="px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
        </div>

        <form onSubmit={handleConfirmReturn} className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
          {/* Step 2: Select Bill & Item */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Bước 2: Chọn Hóa Đơn (Bill) trong ngày
              </label>
              <select
                value={activeBill?.id || ''}
                onChange={(e) => {
                  setSelectedBillId(e.target.value);
                  setSelectedItemId('');
                }}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {filteredBillsForDate.map((b) => (
                  <option key={b.id} value={b.id}>
                    [{b.billDate}] {b.billCode} — {PAYMENT_LABELS[b.paymentType]} (
                    {formatVND(b.totalAmount)}) — {b.itemsSummary.slice(0, 65)}
                  </option>
                ))}
              </select>
            </div>

            {/* Table of Items in Selected Bill to Click & Return */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bước 3: Chọn món ăn / đồ uống trong Bill để hoàn trả
              </label>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-2 px-3">Chọn</th>
                      <th className="py-2 px-3">Tên món trong Bill</th>
                      <th className="py-2 px-2 text-right">Đã mua</th>
                      <th className="py-2 px-2 text-right">Đã trả</th>
                      <th className="py-2 px-2 text-right">Còn lại</th>
                      <th className="py-2 px-3 text-right">Đơn giá</th>
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
                              ? 'bg-rose-50/70 dark:bg-rose-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="radio"
                              name="returnItem"
                              checked={isPicked}
                              onChange={() => setSelectedItemId(it.id)}
                              className="text-rose-600 focus:ring-rose-500"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                            {it.productName}
                          </td>
                          <td className="py-2.5 px-2 text-right">{it.quantity}</td>
                          <td className="py-2.5 px-2 text-right text-rose-600 dark:text-rose-400">
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
          <div className="lg:col-span-5 p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block">Món đang chọn hoàn trả:</span>
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
                    className="w-full px-3 py-2 text-sm font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ngày ghi nhận Khoản trừ
                  </label>
                  <input
                    type="date"
                    value={deductionDate}
                    onChange={(e) => setDeductionDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú / Lý do hoàn trả
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Khách trả lại 5 lon bia Tiger Lùn chưa khui..."
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500">Số tiền trừ vào doanh thu:</span>
                <span className="text-base font-bold text-rose-600 dark:text-rose-400">
                  -{formatVND((activeBillItem?.unitPrice || 0) * (returnQty || 0))}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !canWrite || maxReturnableQty <= 0}
                className="w-full py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Đang lưu khoản trừ...'
                    : 'Xác Nhận Hoàn Trả & Lưu Vào Khoản Trừ'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Deduction History Table */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Danh Sách Khoản Trừ & Lịch Sử Hoàn Trả ({filteredDeductions.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tổng tiền khoản trừ đang hiển thị:{' '}
              <strong className="font-mono text-rose-600 dark:text-rose-400">
                -{formatVND(totalDeductionsAmount)}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchDeduction}
                onChange={(e) => setSearchDeduction(e.target.value)}
                placeholder="Tìm món trả, mã bill, ghi chú..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {canDelete && filteredDeductions.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllDeductionsClick}
                className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả khoản trừ ({filteredDeductions.length})</span>
              </button>
            )}
          </div>
        </div>

        {filteredDeductions.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            Chưa có khoản trừ / hoàn trả nào.
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[680px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Ngày trừ</th>
                  <th className="py-2.5 px-3">Bill gốc (Ngày bill)</th>
                  <th className="py-2.5 px-3">Món hoàn trả</th>
                  <th className="py-2.5 px-3">Danh mục</th>
                  <th className="py-2.5 px-3 text-right">Số lượng trả</th>
                  <th className="py-2.5 px-3 text-right">Số tiền trừ</th>
                  <th className="py-2.5 px-3">Ghi chú hoàn trả</th>
                  {canDelete && <th className="py-2.5 px-3 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredDeductions.map((ded) => (
                  <tr key={ded.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {ded.deductionDate}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                      {ded.billCode} ({ded.billDate})
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      {ded.productName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      {ded.category}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                      -{formatNumber(ded.quantity)}
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
};
