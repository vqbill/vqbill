import React, { useState } from 'react';
import { X, Plus, Trash2, Save, MessageSquareText, Calendar, CheckCircle2 } from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  PaymentType,
  DebtStatus,
  ConfirmRequestOptions,
} from '../types';
import {
  formatVND,
  inferCategory,
  reconstructBillItemsFromSummary,
  resolveBusinessBillDate,
  sanitizeId,
  splitProductNameAndInlineNote,
  truncateStr,
} from '../utils/parser';

interface BillEditModalProps {
  bill: BillRecord;
  items: BillItemRecord[];
  categories: string[];
  products: ProductRecord[];
  debtors?: string[];
  onClose: () => void;
  onSaveEdit: (updatedBill: BillRecord, updatedItems: BillItemRecord[]) => Promise<void>;
  onDeleteBill?: (bill: BillRecord) => void;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const BillEditModal: React.FC<BillEditModalProps> = ({
  bill,
  items,
  categories,
  products,
  debtors = [],
  onClose,
  onSaveEdit,
  onDeleteBill,
  requestConfirm,
}) => {
  const [billDate, setBillDate] = useState(bill.billDate);
  const [checkInTime, setCheckInTime] = useState(bill.checkInTime || '');
  const [checkOutTime, setCheckOutTime] = useState(bill.checkOutTime || '');
  const [discountAmount, setDiscountAmount] = useState<number>(bill.discountAmount || 0);
  const [paymentType, setPaymentType] = useState<PaymentType>(bill.paymentType);
  const [splitCashInput, setSplitCashInput] = useState<string>(() => {
    if (bill.paymentType === 'split') {
      return bill.paidCashAmount !== undefined ? String(bill.paidCashAmount) : '';
    }
    return '';
  });
  const [splitTransferInput, setSplitTransferInput] = useState<string>(() => {
    if (bill.paymentType === 'split') {
      return bill.paidTransferAmount !== undefined ? String(bill.paidTransferAmount) : '';
    }
    return '';
  });
  const [debtorName, setDebtorName] = useState(bill.debtorName);
  const [debtStatus, setDebtStatus] = useState<'none' | 'unpaid' | 'paid'>(bill.debtStatus);
  const [settleDate, setSettleDate] = useState<string>(() => {
    return bill.settleDate || (bill.debtStatus === 'paid' ? bill.billDate : '');
  });
  const [note, setNote] = useState(bill.note);
  const [initialItems] = useState<BillItemRecord[]>(() => {
    const source =
      items && items.length > 0
        ? items
        : reconstructBillItemsFromSummary(bill, products);
    return source.map((it) => ({ ...it, note: it.note || '' }));
  });
  const [editItems, setEditItems] = useState<BillItemRecord[]>(() =>
    initialItems.map((it) => ({ ...it }))
  );
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = React.useMemo(() => {
    if (billDate !== bill.billDate) return true;
    if ((checkInTime || '').trim() !== (bill.checkInTime || '').trim()) return true;
    if ((checkOutTime || '').trim() !== (bill.checkOutTime || '').trim()) return true;
    if (
      Math.max(0, Math.round(Number(discountAmount) || 0)) !==
      Math.max(0, Math.round(Number(bill.discountAmount) || 0))
    ) {
      return true;
    }
    if (paymentType !== bill.paymentType) return true;
    if (paymentType === 'split') {
      const currentCash = Math.max(0, Number(splitCashInput) || 0);
      const currentTransfer = Math.max(0, Number(splitTransferInput) || 0);
      const oldCash = Math.max(0, Number(bill.paidCashAmount) || 0);
      const oldTransfer = Math.max(0, Number(bill.paidTransferAmount) || 0);
      if (currentCash !== oldCash || currentTransfer !== oldTransfer) return true;
    }
    if ((debtorName || '').trim() !== (bill.debtorName || '').trim()) return true;
    if (debtStatus !== bill.debtStatus) return true;
    if ((settleDate || '').trim() !== (bill.settleDate || '').trim()) return true;
    if ((note || '').trim() !== (bill.note || '').trim()) return true;

    if (editItems.length !== initialItems.length) return true;
    for (let i = 0; i < editItems.length; i++) {
      const curr = editItems[i];
      const init = initialItems[i];
      if (!init) return true;
      if (curr.id !== init.id) return true;
      if (curr.productName.trim() !== init.productName.trim()) return true;
      if ((curr.note || '').trim() !== (init.note || '').trim()) return true;
      if (curr.category !== init.category) return true;
      if (Number(curr.quantity) !== Number(init.quantity)) return true;
      if (Number(curr.unitPrice) !== Number(init.unitPrice)) return true;
    }

    return false;
  }, [
    bill,
    billDate,
    checkInTime,
    checkOutTime,
    discountAmount,
    paymentType,
    splitCashInput,
    splitTransferInput,
    debtorName,
    debtStatus,
    settleDate,
    note,
    editItems,
    initialItems,
  ]);

  const subtotalAmount = editItems.reduce(
    (sum, it) => sum + Math.round(it.quantity * it.unitPrice),
    0
  );
  const safeDiscount = Math.min(
    subtotalAmount,
    Math.max(0, Math.round(Number(discountAmount) || 0))
  );
  const computedTotal = Math.max(0, subtotalAmount - safeDiscount);

  const handleItemChange = (
    idx: number,
    field: 'productName' | 'note' | 'category' | 'quantity' | 'unitPrice',
    val: string | number
  ) => {
    setEditItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const copy = { ...it };
        if (field === 'productName') {
          const nameStr = String(val);
          copy.productName = nameStr;
          const catalogProd = products.find(
            (p) => p.productName.toLowerCase().trim() === nameStr.toLowerCase().trim()
          );
          if (catalogProd) {
            copy.category = catalogProd.category;
            if (copy.unitPrice === 0 || it.productName !== nameStr) {
              copy.unitPrice = catalogProd.unitPrice;
              copy.subtotal = copy.quantity * copy.unitPrice;
            }
          } else {
            copy.category = inferCategory(copy.productName, categories);
          }
        } else if (field === 'note') {
          copy.note = String(val);
        } else if (field === 'category') {
          copy.category = String(val);
        } else if (field === 'quantity') {
          copy.quantity = Math.max(1, Math.round(Number(val) || 1));
          copy.subtotal = copy.quantity * copy.unitPrice;
        } else if (field === 'unitPrice') {
          copy.unitPrice = Math.max(0, Math.round(Number(val) || 0));
          copy.subtotal = copy.quantity * copy.unitPrice;
        }
        return copy;
      })
    );
  };

  const handleProductNameBlur = (idx: number) => {
    setEditItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const split = splitProductNameAndInlineNote(
          it.productName,
          products,
          categories
        );
        if (split.productName && split.note && split.productName !== it.productName) {
          const combinedNote = [it.note, split.note]
            .filter(Boolean)
            .filter(
              (v, k, arr) =>
                arr.findIndex((x) => x!.toLowerCase() === v!.toLowerCase()) === k
            )
            .join(', ');
          const uPrice =
            it.unitPrice > 0
              ? it.unitPrice
              : split.catalogUnitPrice || it.unitPrice;
          return {
            ...it,
            productName: split.productName,
            note: combinedNote,
            category: split.category || it.category,
            unitPrice: uPrice,
            subtotal: it.quantity * uPrice,
          };
        }
        return it;
      })
    );
  };

  const handleTimeBlur = () => {
    const { businessDate, shiftedFromNextMorning } = resolveBusinessBillDate(
      billDate,
      checkInTime,
      checkOutTime,
      false
    );
    if (shiftedFromNextMorning && businessDate !== billDate) {
      setBillDate(businessDate);
    }
  };

  const handleAddRow = () => {
    requestConfirm({
      title: 'Xác nhận Thêm Món Vào Hóa Đơn',
      message: `Bạn có muốn thêm 1 dòng món mới vào hóa đơn ${bill.billCode} không?`,
      confirmLabel: 'Thêm món',
      variant: 'primary',
      onConfirm: () => {
        const now = Date.now();
        const defaultProd = products[0];
        setEditItems((prev) => [
          ...prev,
          {
            id: sanitizeId(`item_${now}_${Math.random().toString(36).slice(2, 6)}`),
            ownerId: bill.ownerId,
            billId: bill.id,
            billDate,
            productName: defaultProd ? defaultProd.productName : 'Bia Tiger Lùn',
            note: '',
            category: defaultProd ? defaultProd.category : categories[0] || 'Bia',
            quantity: 1,
            returnedQuantity: 0,
            unitPrice: defaultProd ? defaultProd.unitPrice : 22000,
            subtotal: defaultProd ? defaultProd.unitPrice : 22000,
            createdAtMs: now,
            updatedAtMs: now,
          },
        ]);
      },
    });
  };

  const handleRemoveRow = (idx: number) => {
    const target = editItems[idx];
    requestConfirm({
      title: 'Xác nhận Xóa Món Trong Hóa Đơn',
      message: `Bạn có chắc chắn muốn xóa món "${target?.productName || ''}" khỏi hóa đơn ${
        bill.billCode
      } không?`,
      confirmLabel: 'Xóa món',
      variant: 'danger',
      onConfirm: () => {
        setEditItems((prev) => prev.filter((_, i) => i !== idx));
      },
    });
  };

  const triggerSaveBill = () => {
    if (!hasChanges || isSaving) return;
    const valid = editItems.filter((it) => it.productName.trim() !== '');
    if (valid.length === 0) return;

    requestConfirm({
      title: 'Xác nhận Cập Nhật Hóa Đơn & Giá Món Trong Bill',
      message: `Bạn có chắc chắn muốn lưu thay đổi cho hóa đơn ${bill.billCode} (Tổng mới: ${formatVND(
        computedTotal
      )}) lên Firebase không? (Lưu ý: Giá chỉnh sửa trong bill này không làm thay đổi giá mặc định của sản phẩm trong Menu).`,
      confirmLabel: 'Lưu chỉnh sửa',
      variant: 'warning',
      onConfirm: async () => {
        setIsSaving(true);
        try {
          const now = Date.now();
          const summaryStr = truncateStr(
            valid
              .map(
                (it) =>
                  `${it.productName}${it.note ? ` (${it.note})` : ''} x${it.quantity}`
              )
              .join(', '),
            1000,
            ''
          );
          const isSettled =
            paymentType !== 'split' &&
            paymentType !== 'cash' &&
            paymentType !== 'transfer' &&
            (debtStatus === 'paid' ||
              (bill.debtStatus === 'paid' && debtStatus !== 'unpaid'));
          const isDebtBill =
            paymentType === 'debt' ||
            (paymentType !== 'split' &&
              paymentType !== 'cash' &&
              paymentType !== 'transfer' &&
              (Boolean(debtorName.trim()) || Boolean(bill.debtorName) || isSettled));

          const finalSettleDate = isSettled
            ? (settleDate.trim() || bill.settleDate || bill.billDate)
            : undefined;

          // Khi đã tất toán: Hóa đơn vẫn giữ bản chất công nợ phát sinh ngày billDate với debtStatus = 'paid',
          // và ngày tiền thực thu được ghi nhận chính xác vào settleDate với hình thức tương ứng (tiền mặt / chuyển khoản).
          const finalPaymentType: PaymentType = isDebtBill ? 'debt' : paymentType;
          const finalDebtStatus: DebtStatus = isSettled
            ? 'paid'
            : isDebtBill
            ? 'unpaid'
            : 'none';
          const finalSettledMethod: 'cash' | 'transfer' | undefined = isSettled
            ? (bill.settledMethod === 'transfer' ? 'transfer' : 'cash')
            : undefined;

          let finalPaidCash: number | undefined = undefined;
          let finalPaidTransfer: number | undefined = undefined;
          if (finalPaymentType === 'split') {
            let c = Math.max(0, Number(splitCashInput) || 0);
            let t = Math.max(0, Number(splitTransferInput) || 0);
            if (c === 0 && t === 0 && computedTotal > 0) {
              c = Math.round(computedTotal / 2);
              t = computedTotal - c;
            } else if (c + t !== computedTotal) {
              if (c > 0 && t === 0) {
                t = Math.max(0, computedTotal - c);
              } else if (t > 0 && c === 0) {
                c = Math.max(0, computedTotal - t);
              }
            }
            finalPaidCash = c;
            finalPaidTransfer = t;
          }

          const updatedBill: BillRecord = {
            ...bill,
            billDate,
            checkInTime: checkInTime.trim() || undefined,
            checkOutTime: checkOutTime.trim() || undefined,
            paymentType: finalPaymentType,
            paidCashAmount: finalPaidCash,
            paidTransferAmount: finalPaidTransfer,
            debtorName: isDebtBill ? (debtorName.trim() || bill.debtorName || 'Khách nợ') : '',
            debtStatus: finalDebtStatus,
            settleDate: finalSettleDate,
            settledMethod: finalSettledMethod,
            subtotalAmount,
            discountAmount: safeDiscount,
            totalAmount: computedTotal,
            itemsSummary: summaryStr,
            note: note.trim(),
            updatedAtMs: now,
          };

          const normalizedItems = valid.map((it) => ({
            ...it,
            note: (it.note || '').trim(),
            billDate,
            subtotal: it.quantity * it.unitPrice,
            updatedAtMs: now,
          }));

          await onSaveEdit(updatedBill, normalizedItems);
          onClose();
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerSaveBill();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-4xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-2.5 shrink-0" />

        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              Chỉnh sửa Hóa Đơn ({bill.billCode})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Ca bán 09:00 sáng → 08:00 sáng hôm sau · Chỉnh giá/ghi chú món trực tiếp
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!hasChanges || isSaving}
              onClick={triggerSaveBill}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors select-none ${
                hasChanges && !isSaving
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300/70 dark:border-slate-700 cursor-not-allowed pointer-events-none'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Đóng"
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ngày Bill (Ca 9h → 8h sáng hôm sau)
              </label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Giờ vào
                </label>
                <input
                  type="text"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  onBlur={handleTimeBlur}
                  placeholder="VD: 19:30"
                  className="w-full h-10 px-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Giờ ra
                </label>
                <input
                  type="text"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  onBlur={handleTimeBlur}
                  placeholder="VD: 01:30"
                  className="w-full h-10 px-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Chiết khấu (₫)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={discountAmount}
                onChange={(e) =>
                  setDiscountAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))
                }
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Hình thức thanh toán
              </label>
              <select
                value={paymentType}
                onChange={(e) => {
                  const nextType = e.target.value as PaymentType;
                  setPaymentType(nextType);
                  if (nextType === 'split') {
                    if (!splitCashInput && !splitTransferInput && computedTotal > 0) {
                      const halfCash = Math.round(computedTotal / 2);
                      setSplitCashInput(String(halfCash));
                      setSplitTransferInput(String(computedTotal - halfCash));
                    }
                  }
                  if (nextType === 'debt' && debtStatus === 'none') {
                    setDebtStatus('unpaid');
                  }
                }}
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="cash">Tiền mặt (Đã thanh toán)</option>
                <option value="transfer">Chuyển khoản (Đã thanh toán)</option>
                <option value="split">Tiền mặt + Chuyển khoản (Kết hợp)</option>
                <option value="debt">Công nợ (Chưa thanh toán)</option>
              </select>
            </div>

            {paymentType === 'split' && (
              <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-purple-600"></span>
                    Chia tiền thanh toán (Tổng hóa đơn: {formatVND(computedTotal)})
                  </span>
                  <span className="text-[11px] text-purple-700 dark:text-purple-300">
                    VD: Bill 5 triệu → TM 1 triệu, CK 4 triệu
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        1. Tiền mặt (VNĐ):
                      </label>
                      {computedTotal > 0 && (
                        <div className="flex items-center gap-1">
                          {[1000000, 2000000, Math.round(computedTotal / 2)].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                const c = Math.min(computedTotal, preset);
                                setSplitCashInput(String(c));
                                setSplitTransferInput(String(Math.max(0, computedTotal - c)));
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-mono font-medium hover:bg-emerald-50 cursor-pointer"
                            >
                              {formatVND(preset)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={splitCashInput}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        setSplitCashInput(valStr);
                        if (valStr !== '' && !isNaN(Number(valStr))) {
                          const cashNum = Math.max(0, Number(valStr));
                          const remain = Math.max(0, computedTotal - cashNum);
                          setSplitTransferInput(String(remain));
                        }
                      }}
                      placeholder="Số tiền mặt..."
                      className="w-full h-10 px-3 text-xs font-mono font-bold rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                        2. Chuyển khoản (VNĐ):
                      </label>
                      {computedTotal > 0 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSplitTransferInput(String(computedTotal));
                              setSplitCashInput('0');
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 font-mono font-medium hover:bg-sky-50 cursor-pointer"
                          >
                            CK hết
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={splitTransferInput}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        setSplitTransferInput(valStr);
                        if (valStr !== '' && !isNaN(Number(valStr))) {
                          const trNum = Math.max(0, Number(valStr));
                          const remain = Math.max(0, computedTotal - trNum);
                          setSplitCashInput(String(remain));
                        }
                      }}
                      placeholder="Số tiền chuyển khoản..."
                      className="w-full h-10 px-3 text-xs font-mono font-bold rounded-xl border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Đối soát tổng TM + CK so với tổng bill */}
                {(() => {
                  const c = Number(splitCashInput) || 0;
                  const t = Number(splitTransferInput) || 0;
                  const sum = c + t;
                  const diff = computedTotal - sum;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-purple-200/60 dark:border-purple-900/40">
                      <span className="text-slate-600 dark:text-slate-300">
                        Tổng đã chia: <strong className="font-mono text-purple-700 dark:text-purple-300">{formatVND(sum)}</strong> / {formatVND(computedTotal)}
                      </span>
                      {diff === 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Khớp 100%
                        </span>
                      ) : diff > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          Thiếu {formatVND(diff)}
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">
                          Dư {formatVND(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Người nợ (Chọn hoặc nhập mới)
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paymentType === 'debt'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPaymentType('debt');
                        if (debtStatus === 'none') setDebtStatus('unpaid');
                      } else {
                        setPaymentType('cash');
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Tích Công Nợ</span>
                </label>
              </div>
              <input
                type="text"
                list="vqbill-edit-debtors-list"
                value={debtorName}
                onChange={(e) => setDebtorName(e.target.value)}
                placeholder="Chọn hoặc nhập tên người nợ..."
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <datalist id="vqbill-edit-debtors-list">
                {debtors.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>

            {(paymentType === 'debt' || bill.paymentType === 'debt' || debtStatus === 'paid' || bill.debtStatus === 'paid') && (
              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-amber-900 dark:text-amber-200">
                    Trạng thái công nợ của hóa đơn
                  </label>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300">
                    {debtStatus === 'paid' ? 'Đã tất toán' : 'Đang ghi nợ'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDebtStatus('unpaid');
                    }}
                    className={`h-9 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      debtStatus !== 'paid'
                        ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>Đang nợ (Chưa trả)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDebtStatus('paid');
                      if (!settleDate) {
                        setSettleDate(bill.settleDate || bill.billDate);
                      }
                    }}
                    className={`h-9 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      debtStatus === 'paid'
                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Đã tất toán</span>
                  </button>
                </div>

                {(debtStatus === 'paid' || bill.debtStatus === 'paid') && (
                  <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900/40">
                    <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Ngày tất toán công nợ (Tùy chỉnh ngày thu tiền nợ)</span>
                    </label>
                    <input
                      type="date"
                      value={settleDate || bill.settleDate || bill.billDate}
                      onChange={(e) => setSettleDate(e.target.value)}
                      className="w-full h-10 px-3 text-xs font-mono font-semibold rounded-xl border border-emerald-400 dark:border-emerald-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Doanh thu thu hồi nợ của bill này sẽ được tính vào báo cáo ngày tất toán đã chọn ở trên.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ghi chú chung hóa đơn
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú bàn, khách hàng, yêu cầu..."
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Các món & ghi chú món trong hóa đơn ({editItems.length})
              </span>
              <button
                type="button"
                onClick={handleAddRow}
                className="h-8 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm món</span>
              </button>
            </div>

            {/* Mobile Card List (< md) */}
            <div className="md:hidden space-y-2.5">
              {editItems.map((it, idx) => {
                const catalogMatch = products.find(
                  (p) =>
                    p.productName.toLowerCase().trim() ===
                    it.productName.toLowerCase().trim()
                );
                const categoryOptions = Array.from(
                  new Set([...categories, it.category].filter(Boolean))
                );

                return (
                  <div
                    key={it.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        list="vqbill-menu-products-list"
                        value={it.productName}
                        onChange={(e) =>
                          handleItemChange(idx, 'productName', e.target.value)
                        }
                        onBlur={() => handleProductNameBlur(idx)}
                        placeholder="Tên món..."
                        className="flex-1 h-9 px-2.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="w-9 h-9 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="relative">
                      <MessageSquareText className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={it.note || ''}
                        onChange={(e) =>
                          handleItemChange(idx, 'note', e.target.value)
                        }
                        placeholder="Ghi chú món (VD: làm cay, chi tiết Combo)..."
                        className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-slate-800 dark:text-amber-200 text-[11px]"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Danh mục
                        </label>
                        <select
                          value={it.category}
                          onChange={(e) =>
                            handleItemChange(idx, 'category', e.target.value)
                          }
                          className="w-full h-9 px-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          {categoryOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Số lượng
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) =>
                            handleItemChange(idx, 'quantity', e.target.value)
                          }
                          className="w-full h-9 px-2 text-right font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Đơn giá Bill (₫)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={it.unitPrice}
                          onChange={(e) =>
                            handleItemChange(idx, 'unitPrice', e.target.value)
                          }
                          className="w-full h-9 px-2 text-right font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-800 text-xs font-mono">
                      <span className="text-[11px] text-slate-500">
                        {catalogMatch
                          ? `Giá Menu: ${formatVND(catalogMatch.unitPrice)}`
                          : 'Món tùy chỉnh'}
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        = {formatVND(it.quantity * it.unitPrice)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-3">Tên món & Ghi chú món</th>
                    <th className="py-2.5 px-2 w-36">Danh mục</th>
                    <th className="py-2.5 px-2 w-20 text-right">SL</th>
                    <th className="py-2.5 px-2 w-36 text-right">
                      Đơn giá trong Bill (₫)
                    </th>
                    <th className="py-2.5 px-3 w-28 text-right">Thành tiền</th>
                    <th className="py-2.5 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {editItems.map((it, idx) => {
                    const catalogMatch = products.find(
                      (p) =>
                        p.productName.toLowerCase().trim() ===
                        it.productName.toLowerCase().trim()
                    );
                    const isCustomPrice =
                      catalogMatch &&
                      catalogMatch.unitPrice > 0 &&
                      catalogMatch.unitPrice !== it.unitPrice;
                    const categoryOptions = Array.from(
                      new Set([...categories, it.category].filter(Boolean))
                    );

                    return (
                      <tr key={it.id}>
                        <td className="p-2 align-top space-y-1.5">
                          <input
                            type="text"
                            list="vqbill-menu-products-list"
                            value={it.productName}
                            onChange={(e) =>
                              handleItemChange(idx, 'productName', e.target.value)
                            }
                            onBlur={() => handleProductNameBlur(idx)}
                            className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                          />
                          <div className="relative">
                            <MessageSquareText className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={it.note || ''}
                              onChange={(e) =>
                                handleItemChange(idx, 'note', e.target.value)
                              }
                              placeholder="Ghi chú món (VD: làm cay, chi tiết Combo)..."
                              className="w-full h-7 pl-8 pr-2.5 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-slate-700 dark:text-amber-200 text-[11px]"
                            />
                          </div>
                        </td>
                        <td className="p-2 align-top">
                          <select
                            value={it.category}
                            onChange={(e) =>
                              handleItemChange(idx, 'category', e.target.value)
                            }
                            className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          >
                            {categoryOptions.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'quantity', e.target.value)
                            }
                            className="w-full h-9 px-2 text-right font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={it.unitPrice}
                            onChange={(e) =>
                              handleItemChange(idx, 'unitPrice', e.target.value)
                            }
                            className="w-full h-9 px-2 text-right font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                          {catalogMatch && (
                            <div className="text-[10px] text-right mt-0.5 font-mono text-slate-400">
                              {isCustomPrice ? (
                                <span className="text-amber-600 dark:text-amber-400">
                                  Giá gốc Menu: {formatVND(catalogMatch.unitPrice)}
                                </span>
                              ) : (
                                <span>Giá gốc Menu: {formatVND(catalogMatch.unitPrice)}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2 align-top text-right font-mono font-semibold pt-3.5">
                          {formatVND(it.quantity * it.unitPrice)}
                        </td>
                        <td className="p-2 align-top text-center pt-3">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="font-mono text-xs sm:text-sm flex flex-wrap items-center justify-between sm:justify-start gap-3">
              <span className="text-slate-500">
                Tạm tính: <strong>{formatVND(subtotalAmount)}</strong>
              </span>
              {safeDiscount > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  Chiết khấu: <strong>-{formatVND(safeDiscount)}</strong>
                </span>
              )}
              <span className="text-slate-700 dark:text-slate-300">
                Tổng cộng:{' '}
                <strong className="text-lg text-emerald-600 dark:text-emerald-400">
                  {formatVND(computedTotal)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {onDeleteBill && (
                <button
                  type="button"
                  onClick={() => onDeleteBill(bill)}
                  className="h-10 px-3.5 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Xóa Bill</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial h-10 px-4 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!hasChanges || isSaving}
                className={`flex-1 sm:flex-initial h-10 px-5 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors select-none ${
                  hasChanges && !isSaving
                    ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300/70 dark:border-slate-700 cursor-not-allowed pointer-events-none'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
