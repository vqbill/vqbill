import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Receipt,
  CheckCircle2,
  Edit3,
  RotateCcw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCheck,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  ReturnRecord,
  DeductionRecord,
  PAYMENT_LABELS,
} from '../types';
import {
  formatVND,
  formatNumber,
  formatReceiptMoney,
  formatDateDMY,
  extractReceiptOriginalPrice,
  reconstructBillItemsFromSummary,
} from '../utils/parser';

interface BillCheckModalProps {
  bill: BillRecord;
  items: BillItemRecord[];
  products?: ProductRecord[];
  billReturns: ReturnRecord[];
  billDeductions: DeductionRecord[];
  canWrite: boolean;
  canDelete: boolean;
  canAccessReturns: boolean;
  currentIndex: number;
  totalBills: number;
  onPrevBill?: () => void;
  onNextBill?: () => void;
  onClose: () => void;
  onEditBill: (bill: BillRecord) => void;
  onReturnBill: (bill: BillRecord) => void;
  onDeleteBill: (bill: BillRecord) => void;
}

function extractReceiptTableLabel(note?: string): {
  tableLabel: string;
  extraNote: string;
} {
  const raw = (note || '').trim();
  if (!raw) {
    return { tableLabel: 'BÀN KHÁCH', extraNote: '' };
  }

  // Match "Bàn 18", "Bàn VIP 1 & VIP 2", "VIP 1", "VIP 2", etc.
  const m = raw.match(
    /^(bàn\s+[^\-·|]+|vip\s*\d+(?:\s*&\s*vip\s*\d+)?|phòng\s+[^\-·|]+)(?:\s*[\-·|]\s*(.*))?$/i
  );
  if (m) {
    return {
      tableLabel: m[1].trim().toUpperCase(),
      extraNote: (m[2] || '').trim(),
    };
  }

  if (raw.length <= 24) {
    return {
      tableLabel: raw.toUpperCase(),
      extraNote: '',
    };
  }

  return {
    tableLabel: 'BÀN KHÁCH',
    extraNote: raw,
  };
}

function formatReceiptItemDisplay(item: BillItemRecord): {
  parentLine?: string;
  mainLine: string;
  subNotes: string[];
  originalUnitPrice?: number;
} {
  const originalUnitPrice = extractReceiptOriginalPrice(item);

  // Remove auto-generated "Giá gốc ... giá bán còn lại ..." note text from receipt dish name column
  // because the discount is displayed directly in the Đ.Giá column (179,000 ~319,000~) like Image 2
  const rawNote = (item.note || '')
    .replace(
      /(?:^|\s*[·,|]\s*)giá\s*gốc\s*[\d.,]+\s*(?:đ|vnđ|d)?[^·,|]*(?:giá\s*bán\s*còn\s*lại\s*[\d.,]+\s*(?:đ|vnđ|d)?)?/gi,
      ''
    )
    .trim();

  const pName = (item.productName || '').trim();
  const pLower = pName.toLowerCase();
  const nLower = rawNote.toLowerCase();

  // Case 1: Stored as productName="Rau rừng", note="Rau rừng xào bò" or productName="Gà hấp", note="Gà hấp hành nửa con"
  if (rawNote && nLower.startsWith(pLower) && nLower.length > pLower.length) {
    return {
      parentLine: pName,
      mainLine: rawNote,
      subNotes: [],
      originalUnitPrice,
    };
  }

  // Case 2: Stored as productName="Rau rừng xào bò" or "Gà hấp hành nửa con" without separate parent note
  if (!rawNote && pLower.startsWith('rau rừng ') && pLower !== 'rau rừng') {
    return {
      parentLine: 'Rau rừng',
      mainLine: pName,
      subNotes: [],
      originalUnitPrice,
    };
  }
  if (!rawNote && pLower.startsWith('gà hấp ') && pLower !== 'gà hấp') {
    return {
      parentLine: 'Gà hấp',
      mainLine: pName,
      subNotes: [],
      originalUnitPrice,
    };
  }

  // Case 3: Short variant note like "nhỏ", "lớn", "vàng", "xào tỏi", "20k" -> show inline in parentheses if not already in pName
  if (rawNote) {
    const isComboOrMulti =
      rawNote.includes('>>>') ||
      rawNote.includes('===') ||
      rawNote.split(',').length >= 3;

    if (isComboOrMulti) {
      const cleanedLines = rawNote
        .split(/,|\n/)
        .map((s) => s.replace(/^[=\-\s]+|[=\-\s]+$/g, '').trim())
        .filter(Boolean);
      return {
        mainLine: pName,
        subNotes: cleanedLines,
        originalUnitPrice,
      };
    }

    if (rawNote.length <= 28 && !pLower.includes(`(${nLower})`)) {
      // Check if it's a sub-item line like "Bê" under "Gỏi bò bóp thấu"
      if (nLower === 'bê' || nLower === 'bò') {
        return {
          parentLine: pName,
          mainLine: rawNote,
          subNotes: [],
          originalUnitPrice,
        };
      }
      return {
        mainLine: `${pName} (${rawNote})`,
        subNotes: [],
        originalUnitPrice,
      };
    }

    return {
      mainLine: pName,
      subNotes: [rawNote],
      originalUnitPrice,
    };
  }

  return {
    mainLine: pName,
    subNotes: [],
    originalUnitPrice,
  };
}

export const BillCheckModal: React.FC<BillCheckModalProps> = ({
  bill,
  items,
  products,
  billReturns,
  billDeductions,
  canWrite,
  canDelete,
  canAccessReturns,
  currentIndex,
  totalBills,
  onPrevBill,
  onNextBill,
  onClose,
  onEditBill,
  onReturnBill,
  onDeleteBill,
}) => {
  const effectiveItems = useMemo<BillItemRecord[]>(() => {
    if (items && items.length > 0) {
      return items;
    }
    return reconstructBillItemsFromSummary(bill, products);
  }, [items, bill, products]);

  // Interactive line-by-line check state for auditing a bill
  const [checkedItemIds, setCheckedItemIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCheckedItemIds({});
  }, [bill.id]);

  const toggleCheckItem = (itemId: string) => {
    setCheckedItemIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const checkedCount = effectiveItems.filter((it) => checkedItemIds[it.id]).length;
  const allChecked =
    effectiveItems.length > 0 && checkedCount === effectiveItems.length;

  const handleToggleCheckAll = () => {
    if (allChecked) {
      setCheckedItemIds({});
    } else {
      const next: Record<string, boolean> = {};
      for (const it of effectiveItems) {
        next[it.id] = true;
      }
      setCheckedItemIds(next);
    }
  };

  const totalOrderedQty = effectiveItems.reduce(
    (s, it) => s + (it.quantity || 0),
    0
  );
  const totalReturnedQty = effectiveItems.reduce(
    (s, it) => s + (it.returnedQuantity || 0),
    0
  );
  const totalNetQty = Math.max(0, totalOrderedQty - totalReturnedQty);

  const discountAmount = bill.discountAmount || 0;
  const netBillAmount = Math.max(
    0,
    bill.totalAmount - (bill.deductedAmount || 0)
  );

  const { tableLabel, extraNote } = extractReceiptTableLabel(bill.note);
  const displayDateDMY = formatDateDMY(bill.rawDate || bill.billDate);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-2xl overflow-hidden max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar with Bill Navigation */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              Xem & Kiểm Tra Phiếu Tính Tiền ({bill.billCode})
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {totalBills > 1 && (
              <div className="flex items-center gap-1 mr-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-1.5 py-1 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={onPrevBill}
                  disabled={!onPrevBill}
                  className="p-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  title="Xem bill trước"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 font-semibold text-slate-700 dark:text-slate-300">
                  {currentIndex + 1}/{totalBills}
                </span>
                <button
                  type="button"
                  onClick={onNextBill}
                  disabled={!onNextBill}
                  className="p-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  title="Xem bill tiếp theo"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Audit Status Bar (Outside the receipt paper so receipt matches Image 2) */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={`font-bold ${
                bill.paymentType === 'cash'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : bill.paymentType === 'transfer'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {PAYMENT_LABELS[bill.paymentType]}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
              <User className="w-3.5 h-3.5 text-slate-400" />
              {bill.debtorName
                ? `${bill.debtorName} (${
                    bill.debtStatus === 'paid' ? 'Đã trả' : 'Đang nợ'
                  })`
                : 'Khách lẻ'}
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="font-mono text-slate-600 dark:text-slate-400">
              {effectiveItems.length} món ({formatNumber(totalNetQty)} ĐV)
            </span>
          </div>

          {effectiveItems.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                Đã dò {checkedCount}/{effectiveItems.length}
              </span>
              <button
                type="button"
                onClick={handleToggleCheckAll}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{allChecked ? 'Bỏ tích' : 'Tích đủ'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Thermal Receipt Body */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-slate-200/70 dark:bg-slate-950/80">
          {/* Authentic Thermal Paper Receipt Container (Exact Format of Image 2) */}
          <div className="mx-auto max-w-[440px] bg-white text-slate-950 shadow-xl border border-slate-300 px-4 sm:px-6 py-5 sm:py-6 font-sans select-text">
            {/* Store & Receipt Header */}
            <div className="text-center space-y-0.5 pb-2">
              <div className="text-base sm:text-[17px] font-extrabold tracking-wide uppercase text-black">
                VỊNH QUÁN
              </div>
              <div className="text-xs sm:text-[13px] font-medium text-slate-900">
                ĐC: 131 Chu Huy Mân, Đà nẵng
              </div>
              <div className="text-xs sm:text-[13px] font-medium text-slate-900">
                ĐT: 0702.444.449
              </div>
              <div className="pt-1 text-sm sm:text-[15px] font-extrabold uppercase text-black">
                {tableLabel}
              </div>
              <div className="text-lg sm:text-xl font-extrabold uppercase tracking-tight text-black">
                PHIẾU TÍNH TIỀN
              </div>
              <div className="text-xs sm:text-[13px] font-bold text-slate-900">
                {bill.billCode}
              </div>
            </div>

            {/* Check-in & Print Time Row */}
            <div className="flex items-center justify-between text-xs sm:text-[13px] font-medium text-slate-950 pt-1 pb-2">
              <span>
                Giờ vào: {displayDateDMY}
                {bill.checkInTime ? ` ${bill.checkInTime}` : ''}
              </span>
              <span>Giờ in: {bill.checkOutTime || '--:--'}</span>
            </div>

            {/* Receipt Items Table (Tên hàng | Đ.Giá | SL | Thành tiền) */}
            <table className="w-full border-collapse text-xs sm:text-[13px] text-slate-950">
              <thead>
                <tr className="border-y border-slate-900 font-bold text-black">
                  <th className="py-1.5 text-left font-bold">Tên hàng</th>
                  <th className="py-1.5 px-1 text-right font-bold whitespace-nowrap">
                    Đ.Giá
                  </th>
                  <th className="py-1.5 px-1 text-center font-bold whitespace-nowrap">
                    SL
                  </th>
                  <th className="py-1.5 text-right font-bold whitespace-nowrap">
                    Thành tiền
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 border-b border-slate-900">
                {effectiveItems.map((item) => {
                  const isChecked = Boolean(checkedItemIds[item.id]);
                  const hasReturn = (item.returnedQuantity || 0) > 0;
                  const netItemQty = Math.max(
                    0,
                    (item.quantity || 0) - (item.returnedQuantity || 0)
                  );
                  const grossItemSubtotal =
                    item.subtotal || Math.round(item.quantity * item.unitPrice);
                  const netItemSubtotal = Math.round(
                    netItemQty * item.unitPrice
                  );

                  const {
                    parentLine,
                    mainLine,
                    subNotes,
                    originalUnitPrice,
                  } = formatReceiptItemDisplay(item);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleCheckItem(item.id)}
                      title="Bấm vào dòng món để đánh dấu đã kiểm tra"
                      className={`cursor-pointer transition-colors ${
                        isChecked ? 'bg-emerald-50/90' : 'hover:bg-slate-100/80'
                      }`}
                    >
                      {/* Column 1: Tên hàng */}
                      <td className="py-2 pr-2 align-bottom">
                        {parentLine && (
                          <div className="text-slate-900 font-medium leading-snug">
                            {parentLine}
                          </div>
                        )}
                        <div className="flex items-start gap-1 leading-snug">
                          {isChecked && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`font-medium text-slate-950 ${
                              isChecked
                                ? 'underline decoration-emerald-600 decoration-2'
                                : ''
                            }`}
                          >
                            {mainLine}
                          </span>
                        </div>
                        {subNotes.length > 0 && (
                          <div className="mt-0.5 space-y-0.5 text-[11px] text-slate-700 pl-1">
                            {subNotes.map((sn, sIdx) => (
                              <div key={sIdx}>{sn}</div>
                            ))}
                          </div>
                        )}
                        {hasReturn && (
                          <div className="text-[11px] text-rose-600 font-medium mt-0.5">
                            (Đặt {item.quantity} · Trả {item.returnedQuantity})
                          </div>
                        )}
                      </td>

                      {/* Column 2: Đ.Giá (with strikethrough originalUnitPrice if discounted) */}
                      <td className="py-2 px-1 text-right align-bottom whitespace-nowrap tabular-nums">
                        <span className="font-medium text-slate-950">
                          {formatReceiptMoney(item.unitPrice)}
                        </span>
                        {originalUnitPrice &&
                          originalUnitPrice > item.unitPrice && (
                            <span className="ml-1.5 line-through text-slate-500 decoration-slate-700">
                              {formatReceiptMoney(originalUnitPrice)}
                            </span>
                          )}
                      </td>

                      {/* Column 3: x SL */}
                      <td className="py-2 px-1.5 text-center align-bottom whitespace-nowrap tabular-nums">
                        <span className="text-slate-700 mr-1.5">x</span>
                        <span className="font-medium text-slate-950">
                          {formatNumber(netItemQty)}
                        </span>
                      </td>

                      {/* Column 4: Thành tiền */}
                      <td className="py-2 pl-1 text-right align-bottom whitespace-nowrap tabular-nums">
                        <div className="font-medium text-slate-950">
                          {formatReceiptMoney(netItemSubtotal)}
                        </div>
                        {hasReturn && (
                          <div className="text-[11px] text-slate-400 line-through">
                            {formatReceiptMoney(grossItemSubtotal)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Receipt Totals Section (Chiết khấu & Tổng Cộng) */}
            <div className="pt-2.5 space-y-1 text-xs sm:text-[13px] text-slate-950 tabular-nums">
              <div className="flex items-center justify-between font-semibold">
                <span>Chiết khấu:</span>
                <span>{formatReceiptMoney(discountAmount)}</span>
              </div>

              <div className="flex items-center justify-between text-base sm:text-lg font-extrabold text-black pt-0.5">
                <span>Tổng Cộng:</span>
                <span>{formatReceiptMoney(bill.totalAmount)}</span>
              </div>

              {bill.deductedAmount > 0 && (
                <>
                  <div className="flex items-center justify-between text-rose-700 font-semibold pt-1 border-t border-dashed border-slate-300">
                    <span>Trừ hoàn trả / Khoản trừ:</span>
                    <span>-{formatReceiptMoney(bill.deductedAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm sm:text-base font-extrabold text-emerald-800">
                    <span>Thực thu sau hoàn trả:</span>
                    <span>{formatReceiptMoney(netBillAmount)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Extra note or Return details if any */}
            {(() => {
              const nonReturnDeductions = billDeductions.filter(
                (d) =>
                  d.billCode !== 'HOAN-TRA' &&
                  !billReturns.some(
                    (r) =>
                      d.id === `ded_${r.id}` ||
                      (d.amount === r.amount &&
                        d.productName
                          .toLowerCase()
                          .includes(r.productName.toLowerCase()))
                  )
              );
              if (
                !extraNote &&
                billReturns.length === 0 &&
                nonReturnDeductions.length === 0
              ) {
                return null;
              }
              return (
                <div className="mt-3 pt-2.5 border-t border-dashed border-slate-300 text-[11px] text-slate-700 space-y-1">
                  {extraNote && (
                    <div>
                      <span className="font-bold">Ghi chú: </span>
                      <span>{extraNote}</span>
                    </div>
                  )}
                  {billReturns.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-rose-700"
                    >
                      <span>
                        • Hoàn trả (tính chung 1 dòng Khoản trừ ngày): {r.productName} (x
                        {r.quantity})
                      </span>
                      <span className="font-semibold">
                        -{formatReceiptMoney(r.amount)}
                      </span>
                    </div>
                  ))}
                  {nonReturnDeductions.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between text-rose-700"
                    >
                      <span>
                        • Khoản trừ: {d.productName} (x{d.quantity})
                      </span>
                      <span className="font-semibold">
                        -{formatReceiptMoney(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Footer Actions Bar */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditBill(bill);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Sửa Bill Này</span>
              </button>
            )}

            {canWrite && canAccessReturns && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReturnBill(bill);
                }}
                className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Hoàn trả món</span>
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDeleteBill(bill);
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa Bill</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer ml-auto"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
