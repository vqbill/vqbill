import React, { useState } from 'react';
import { X, Plus, Trash2, Save, MessageSquareText } from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  PaymentType,
  ConfirmRequestOptions,
} from '../types';
import {
  formatVND,
  inferCategory,
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
  requestConfirm,
}) => {
  const [billDate, setBillDate] = useState(bill.billDate);
  const [checkInTime, setCheckInTime] = useState(bill.checkInTime || '');
  const [checkOutTime, setCheckOutTime] = useState(bill.checkOutTime || '');
  const [discountAmount, setDiscountAmount] = useState<number>(bill.discountAmount || 0);
  const [paymentType, setPaymentType] = useState<PaymentType>(bill.paymentType);
  const [debtorName, setDebtorName] = useState(bill.debtorName);
  const [debtStatus, setDebtStatus] = useState<'none' | 'unpaid' | 'paid'>(bill.debtStatus);
  const [note, setNote] = useState(bill.note);
  const [editItems, setEditItems] = useState<BillItemRecord[]>(() =>
    items.map((it) => ({ ...it, note: it.note || '' }))
  );
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = editItems.filter((it) => it.productName.trim() !== '');
    if (valid.length === 0) return;

    requestConfirm({
      title: 'Xác nhận Cập Nhật Hóa Đơn & Giá Món Trong Bill',
      message: `Bạn có chắc chắn muốn lưu thay đổi cho hóa đơn ${bill.billCode} (Tổng mới: ${formatVND(
        computedTotal
      )}) lên Firebase không? (Lưu ý: Giá chỉnh sửa trong bill này không làm thay đổi giá mặc định của sản phẩm trong Menu).`,
      confirmLabel: 'Lưu thay đổi Bill',
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
          const updatedBill: BillRecord = {
            ...bill,
            billDate,
            checkInTime: checkInTime.trim() || undefined,
            checkOutTime: checkOutTime.trim() || undefined,
            paymentType,
            debtorName: paymentType === 'debt' ? debtorName.trim() : bill.debtorName,
            debtStatus:
              paymentType === 'debt'
                ? debtStatus === 'none'
                  ? 'unpaid'
                  : debtStatus
                : bill.debtStatus === 'paid'
                ? 'paid'
                : 'none',
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
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
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
                  if (nextType === 'debt' && debtStatus === 'none') {
                    setDebtStatus('unpaid');
                  }
                }}
                className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="cash">Tiền mặt (Đã thanh toán)</option>
                <option value="transfer">Chuyển khoản (Đã thanh toán)</option>
                <option value="debt">Công nợ (Chưa thanh toán)</option>
              </select>
            </div>

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
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial h-10 px-4 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-initial h-10 px-5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi Bill'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
