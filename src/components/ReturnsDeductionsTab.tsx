import React, { useState, useMemo, useEffect } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash2,
  Plus,
  Receipt,
  Calendar,
  MapPin,
  ArrowRight,
  Filter,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  DeductionRecord,
  ReturnRecord,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
} from '../types';
import {
  formatVND,
  formatNumber,
  formatDateDMY,
  getCurrentBusinessDate,
  getYesterdayBusinessDate,
  shiftDateByDays,
  extractBillTableName,
  extractReturnTableName,
  formatReturnDeductionTitle,
} from '../utils/parser';

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
    tableName?: string;
    note: string;
  }) => Promise<void>;
  onDeleteDeductionsBatch: (deductionIds: string[]) => Promise<void>;
  onDeleteReturnsBatch: (returnIds: string[]) => Promise<void>;
  onDeleteAllMenuProducts: () => void;
  menuProductsCount: number;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

type DeductionPeriodMode =
  | 'today'
  | 'yesterday'
  | 'single_day'
  | 'week'
  | 'month'
  | 'custom'
  | 'all';

const EXPENSE_PRESETS = [
  {
    title: 'Mua bánh mì',
    category: 'Mua bánh mì / Rau / Gia vị',
    defaultAmount: 50000,
  },
  {
    title: 'Mua rau & gia vị bếp',
    category: 'Mua bánh mì / Rau / Gia vị',
    defaultAmount: 120000,
  },
  {
    title: 'Trả tiền nguyên liệu tươi sống',
    category: 'Nguyên liệu / Thực phẩm',
    defaultAmount: 500000,
  },
  {
    title: 'Mua đá cây / đá bi / gas',
    category: 'Vật tư / Đá / Gas',
    defaultAmount: 100000,
  },
  {
    title: 'Tiền bồi hoàn cho khách',
    category: 'Bồi hoàn / Hoàn trả khách',
    defaultAmount: 100000,
  },
];

const EXPENSE_CATEGORIES = [
  'Mua bánh mì / Rau / Gia vị',
  'Nguyên liệu / Thực phẩm',
  'Hoàn trả khách',
  'Bồi hoàn / Hoàn trả khách',
  'Vật tư / Đá / Gas',
  'Chi phí vận hành trong ngày',
  'Khác',
];

function isReturnLinkedDeduction(ded: DeductionRecord): boolean {
  return (
    String(ded.id || '').startsWith('ded_ret_') ||
    String(ded.id || '').startsWith('ded_') ||
    String(ded.billCode || '') === 'HOAN-TRA' ||
    String(ded.category || '').toLowerCase() === 'hoàn trả khách' ||
    /\bsl hoàn trả\s*:/i.test(String(ded.productName || ''))
  );
}

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
  const yesterdayStr = getYesterdayBusinessDate();

  // ============================================================================
  // 1. STATE FOR KHOẢN TRỪ (DEDUCTIONS) + PERIOD / DATE FILTERING
  // ============================================================================
  const [deductionDate, setDeductionDate] = useState<string>(todayStr);
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expenseAmount, setExpenseAmount] = useState<number>(50000);
  const [expenseNote, setExpenseNote] = useState<string>('');
  const [searchDeduction, setSearchDeduction] = useState('');

  // Period filter for viewing Khoản trừ (Hôm nay, Hôm qua, Theo ngày, Tuần, Tháng, Khoảng ngày, Tất cả)
  const [dedPeriodMode, setDedPeriodMode] = useState<DeductionPeriodMode>('today');
  const [dedSingleDate, setDedSingleDate] = useState<string>(todayStr);
  const [dedSelectedMonth, setDedSelectedMonth] = useState<string>(todayStr.slice(0, 7));
  const [dedCustomStart, setDedCustomStart] = useState<string>(yesterdayStr);
  const [dedCustomEnd, setDedCustomEnd] = useState<string>(todayStr);
  const [dedTypeFilter, setDedTypeFilter] = useState<'all' | 'direct' | 'return'>('all');

  // ============================================================================
  // 2. STATE FOR HOÀN TRẢ (CUSTOMER ITEM RETURNS)
  // ============================================================================
  const availableBillDates = useMemo(() => {
    const set = new Set(bills.map((b) => String(b.billDate || '')).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [bills]);

  const [selectedBillDate, setSelectedBillDate] = useState<string>('all');
  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [returnTableName, setReturnTableName] = useState<string>('');
  const [returnQty, setReturnQty] = useState<number>(1);
  const [returnDate, setReturnDate] = useState<string>(todayStr);
  const [returnNote, setReturnNote] = useState<string>('');
  const [searchReturn, setSearchReturn] = useState('');
  const [retPeriodMode, setRetPeriodMode] = useState<DeductionPeriodMode>('all');
  const [retSingleDate, setRetSingleDate] = useState<string>(todayStr);

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

  const billMap = useMemo(() => {
    const m = new Map<string, BillRecord>();
    for (const b of bills) {
      m.set(b.id, b);
    }
    return m;
  }, [bills]);

  const filteredBillsForDate = useMemo(() => {
    const list =
      selectedBillDate === 'all'
        ? bills
        : bills.filter((b) => b.billDate === selectedBillDate);
    return [...list].sort(
      (a, b) =>
        String(b.billDate || '').localeCompare(String(a.billDate || '')) ||
        (b.createdAtMs || 0) - (a.createdAtMs || 0)
    );
  }, [bills, selectedBillDate]);

  const activeBill = useMemo(() => {
    if (selectedBillId) {
      const found = filteredBillsForDate.find((b) => b.id === selectedBillId);
      if (found) return found;
    }
    return filteredBillsForDate[0] || null;
  }, [filteredBillsForDate, selectedBillId]);

  // Auto-populate Số bàn when activeBill changes
  useEffect(() => {
    if (activeBill) {
      setReturnTableName(extractBillTableName(activeBill, 'Bàn lẻ'));
      setReturnDate(activeBill.billDate || todayStr);
    } else {
      setReturnTableName('');
    }
  }, [activeBill?.id]);

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

  // Helper to check if a date matches a DeductionPeriodMode
  const matchesPeriodFilter = (
    dateStr: string,
    pMode: DeductionPeriodMode,
    singleD: string,
    monthStr: string,
    cStart: string,
    cEnd: string
  ): boolean => {
    if (!dateStr) return false;
    if (pMode === 'all') return true;
    if (pMode === 'today') return dateStr === todayStr;
    if (pMode === 'yesterday') return dateStr === yesterdayStr;
    if (pMode === 'single_day') return dateStr === singleD;
    if (pMode === 'week') {
      const target = new Date(dateStr + 'T00:00:00').getTime();
      const now = new Date(todayStr + 'T00:00:00').getTime();
      const diffDays = (now - target) / 86400000;
      return diffDays >= -1 && diffDays <= 7;
    }
    if (pMode === 'month') {
      return dateStr.slice(0, 7) === monthStr;
    }
    if (pMode === 'custom') {
      const start = cStart || '2000-01-01';
      const end = cEnd || '2099-12-31';
      return dateStr >= start && dateStr <= end;
    }
    return true;
  };

  const dedPeriodLabel = useMemo(() => {
    if (dedPeriodMode === 'today') return `Hôm nay (${formatDateDMY(todayStr)})`;
    if (dedPeriodMode === 'yesterday') return `Hôm qua (${formatDateDMY(yesterdayStr)})`;
    if (dedPeriodMode === 'single_day')
      return `Ngày ${formatDateDMY(dedSingleDate)}`;
    if (dedPeriodMode === 'week') return '7 ngày gần nhất (Tuần)';
    if (dedPeriodMode === 'month') {
      const [y, m] = dedSelectedMonth.split('-');
      return `Tháng ${m}/${y}`;
    }
    if (dedPeriodMode === 'custom') {
      return `Từ ${formatDateDMY(dedCustomStart)} đến ${formatDateDMY(dedCustomEnd)}`;
    }
    return 'Toàn bộ thời gian';
  }, [
    dedPeriodMode,
    todayStr,
    yesterdayStr,
    dedSingleDate,
    dedSelectedMonth,
    dedCustomStart,
    dedCustomEnd,
  ]);

  // Filtered Deductions for the active period + type + search
  const filteredDeductions = useMemo(() => {
    return deductions
      .filter((d) =>
        matchesPeriodFilter(
          d.deductionDate || d.billDate,
          dedPeriodMode,
          dedSingleDate,
          dedSelectedMonth,
          dedCustomStart,
          dedCustomEnd
        )
      )
      .filter((d) => {
        if (dedTypeFilter === 'direct') return !isReturnLinkedDeduction(d);
        if (dedTypeFilter === 'return') return isReturnLinkedDeduction(d);
        return true;
      })
      .filter((d) => {
        if (!searchDeduction.trim()) return true;
        const q = searchDeduction.toLowerCase();
        const dDate = String(d.deductionDate || d.billDate || '');
        return (
          String(d.productName || '').toLowerCase().includes(q) ||
          String(d.category || '').toLowerCase().includes(q) ||
          dDate.includes(q) ||
          formatDateDMY(dDate).includes(q) ||
          String(d.note || '').toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          String(b.deductionDate || b.billDate || '').localeCompare(
            String(a.deductionDate || a.billDate || '')
          ) || (b.createdAtMs || 0) - (a.createdAtMs || 0)
      );
  }, [
    deductions,
    dedPeriodMode,
    dedSingleDate,
    dedSelectedMonth,
    dedCustomStart,
    dedCustomEnd,
    dedTypeFilter,
    searchDeduction,
  ]);

  const deductionBreakdown = useMemo(() => {
    let totalAmount = 0;
    let directAmount = 0;
    let returnLinkedAmount = 0;
    let directCount = 0;
    let returnLinkedCount = 0;

    for (const d of filteredDeductions) {
      totalAmount += d.amount;
      if (isReturnLinkedDeduction(d)) {
        returnLinkedAmount += d.amount;
        returnLinkedCount++;
      } else {
        directAmount += d.amount;
        directCount++;
      }
    }

    return {
      totalAmount,
      directAmount,
      returnLinkedAmount,
      directCount,
      returnLinkedCount,
    };
  }, [filteredDeductions]);

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
      )}, ngày ${formatDateDMY(
        deductionDate
      )}) vào hệ thống? Khoản này sẽ được trừ trực tiếp vào Doanh thu tổng ngày (Tiền mặt + Chuyển khoản - Khoản trừ).`,
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
          // Switch period view so user immediately sees the newly added deduction if needed
          if (deductionDate === todayStr && dedPeriodMode === 'yesterday') {
            setDedPeriodMode('today');
          } else if (
            deductionDate !== todayStr &&
            dedPeriodMode === 'today'
          ) {
            setDedSingleDate(deductionDate);
            setDedPeriodMode('single_day');
          }
          setStatusMsg({
            type: 'ok',
            text: `Đã lưu khoản trừ "${cleanTitle}" (-${formatVND(
              safeAmt
            )}) vào ngày ${formatDateDMY(deductionDate)}!`,
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
    const isFromReturn = isReturnLinkedDeduction(ded);
    requestConfirm({
      title: isFromReturn
        ? 'Xác nhận Xóa Khoản Trừ Hoàn Trả Khách'
        : 'Xác nhận Xóa Khoản Trừ',
      message: isFromReturn
        ? `Khoản trừ "${ded.productName}" (-${formatVND(
            ded.amount
          )}) được tạo từ giao dịch Hoàn trả khách (1 dòng tiền duy nhất). Khi xóa khoản trừ này, bản ghi Hoàn trả tương ứng cũng sẽ được xóa và hoàn tác số lượng trên Bill. Bạn có chắc chắn muốn xóa?`
        : `Bạn có chắc chắn muốn xóa khoản trừ "${ded.productName}" (-${formatVND(
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
      title: 'Xác nhận Xóa Tất Cả Khoản Trừ Đang Hiển Thị',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${ids.length} khoản trừ đang lọc (${dedPeriodLabel}) khỏi hệ thống không?`,
      confirmLabel: 'Xóa tất cả khoản trừ',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteDeductionsBatch(ids);
      },
    });
  };

  // ============================================================================
  // 3. HANDLERS FOR HOÀN TRẢ (CUSTOMER ITEM RETURNS -> AUTO SYNC SINGLE CASHFLOW)
  // ============================================================================
  const previewDeductionTitle = useMemo(() => {
    const tbl = (
      returnTableName.trim() || extractBillTableName(activeBill, 'Bàn lẻ')
    ).trim();
    const itemName = activeBillItem?.productName || 'Chưa chọn món';
    const safeQty = Math.max(1, Math.round(returnQty || 1));
    return formatReturnDeductionTitle(tbl, itemName, safeQty);
  }, [returnTableName, activeBill, activeBillItem, returnQty]);

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
    const cleanTable = (
      returnTableName.trim() || extractBillTableName(activeBill, 'Bàn lẻ')
    ).trim();
    const dedTitle = formatReturnDeductionTitle(
      cleanTable,
      activeBillItem.productName,
      safeQty
    );

    requestConfirm({
      title: 'Xác nhận Hoàn Trả & Ghi Nhận Khoản Trừ Trong Ngày',
      message: `Ghi nhận hoàn trả tại "${cleanTable}": ${safeQty} × "${
        activeBillItem.productName
      }" (Tiền trả lại khách: ${formatVND(refundAmt)}, ngày ${formatDateDMY(
        returnDate
      )}).\n\nHệ thống sẽ tự động tính luôn vào Khoản trừ trong ngày với nội dung: "${dedTitle}" (-${formatVND(
        refundAmt
      )}). Tiền hoàn trả và khoản trừ này được tính là 1 dòng tiền duy nhất.`,
      confirmLabel: 'Xác nhận Hoàn trả & Trừ doanh thu ngày',
      variant: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onRecordReturn({
            bill: activeBill,
            billItem: activeBillItem,
            returnQty: safeQty,
            returnDate,
            tableName: cleanTable,
            note:
              returnNote.trim() ||
              `[${cleanTable}] Khách trả lại ${safeQty} ${activeBillItem.productName} (Bill ${activeBill.billCode} ngày ${formatDateDMY(activeBill.billDate)})`,
          });
          setStatusMsg({
            type: 'ok',
            text: `Đã hoàn trả & ghi vào Khoản trừ ngày ${formatDateDMY(
              returnDate
            )}: "${dedTitle}" (-${formatVND(
              refundAmt
            )} — tính chung 1 dòng tiền duy nhất)!`,
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
      .filter((r) =>
        matchesPeriodFilter(
          r.returnDate || r.billDate,
          retPeriodMode,
          retSingleDate,
          todayStr.slice(0, 7),
          yesterdayStr,
          todayStr
        )
      )
      .filter((r) => {
        if (!searchReturn.trim()) return true;
        const q = searchReturn.toLowerCase();
        const b = billMap.get(r.billId);
        const tbl = extractReturnTableName(r.note, b, 'Bàn lẻ').toLowerCase();
        const rDate = String(r.returnDate || r.billDate || '');
        return (
          String(r.productName || '').toLowerCase().includes(q) ||
          tbl.includes(q) ||
          String(r.billCode || '').toLowerCase().includes(q) ||
          String(r.billDate || '').includes(q) ||
          rDate.includes(q) ||
          formatDateDMY(rDate).includes(q) ||
          String(r.note || '').toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          String(b.returnDate || b.billDate || '').localeCompare(
            String(a.returnDate || a.billDate || '')
          ) || (b.createdAtMs || 0) - (a.createdAtMs || 0)
      );
  }, [returns, retPeriodMode, retSingleDate, todayStr, yesterdayStr, searchReturn, billMap]);

  const totalReturnsAmount = useMemo(
    () => filteredReturns.reduce((s, r) => s + r.amount, 0),
    [filteredReturns]
  );

  const handleDeleteOneReturn = (ret: ReturnRecord) => {
    if (!canDelete) return;
    const b = billMap.get(ret.billId);
    const tbl = extractReturnTableName(ret.note, b, 'Bàn lẻ');
    requestConfirm({
      title: 'Xác nhận Xóa Bản Ghi Hoàn Trả & Khoản Trừ Tương Ứng',
      message: `Bạn có chắc chắn muốn xóa hoàn trả "${tbl} - ${ret.productName} - SL hoàn trả: ${
        ret.quantity
      }" (${formatVND(
        ret.amount
      )}) không? Khoản trừ liên kết của hoàn trả này (1 dòng tiền duy nhất) cũng sẽ được xóa cùng lúc.`,
      confirmLabel: 'Xóa hoàn trả & khoản trừ',
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
      title: 'Xác nhận Xóa Tất Cả Bản Ghi Hoàn Trả Đang Hiển Thị',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${ids.length} bản ghi hoàn trả đang hiển thị (cùng các khoản trừ liên kết của chúng) khỏi hệ thống không?`,
      confirmLabel: 'Xóa tất cả hoàn trả',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteReturnsBatch(ids);
      },
    });
  };

  // ============================================================================
  // RENDER MODE 1: KHOẢN TRỪ (DAILY EXPENSES + AUTO-SYNCED CUSTOMER RETURNS)
  // ============================================================================
  if (mode === 'deductions') {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Top Form: Add Direct Daily Expense */}
        <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <span>Quản Lý Khoản Trừ (Chi Tiêu Trong Ngày & Hoàn Trả Khách)</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Ghi nhận các khoản tiền chi ra trong ngày (<strong>mua bánh mì, mua rau, nguyên liệu...</strong>) và <strong>tiền hoàn trả cho khách</strong> (tự động đồng bộ từ mục Hoàn trả theo định dạng <strong>Số bàn - Tên món - SL hoàn trả</strong>, tính là <strong>1 dòng tiền duy nhất</strong>). Công thức: <strong>Doanh thu tổng ngày = Tiền mặt + Chuyển khoản - Khoản trừ</strong>.
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
              Chọn nhanh khoản chi trực tiếp phổ biến trong ngày:
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

        {/* Deductions Filter & History Section */}
        <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
          {/* Period Filter Bar: Hôm nay, Hôm qua, Theo ngày, Tuần, Tháng, Khoảng ngày, Tất cả */}
          <div className="pb-3.5 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  Xem Khoản Trừ Theo Thời Gian:
                </span>
                <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
                  {dedPeriodLabel}
                </span>
              </div>

              {/* Period Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDedPeriodMode('today')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    dedPeriodMode === 'today'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Hôm nay ({formatDateDMY(todayStr).slice(0, 5)})
                </button>

                <button
                  type="button"
                  onClick={() => setDedPeriodMode('yesterday')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    dedPeriodMode === 'yesterday'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Hôm qua ({formatDateDMY(yesterdayStr).slice(0, 5)})
                </button>

                <button
                  type="button"
                  onClick={() => setDedPeriodMode('single_day')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    dedPeriodMode === 'single_day'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Theo ngày
                </button>

                <button
                  type="button"
                  onClick={() => setDedPeriodMode('week')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    dedPeriodMode === 'week'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Tuần (7 ngày)
                </button>

                <button
                  type="button"
                  onClick={() => setDedPeriodMode('month')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    dedPeriodMode === 'month'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Tháng
                </button>

                <button
                  type="button"
                  onClick={() => setDedPeriodMode('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    dedPeriodMode === 'custom'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Từ ngày - Đến ngày
                </button>

                <button
                  type="button"
                  onClick={() => setDedPeriodMode('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    dedPeriodMode === 'all'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Tất cả ({deductions.length})
                </button>
              </div>
            </div>

            {/* Extra Date Inputs when single_day, month, or custom is active */}
            {dedPeriodMode === 'single_day' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Chọn ngày cần xem:
                </span>
                <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDedSingleDate(shiftDateByDays(dedSingleDate, -1))}
                    className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-mono font-bold cursor-pointer"
                    title="Ngày hôm trước"
                  >
                    ←
                  </button>
                  <input
                    type="date"
                    value={dedSingleDate}
                    onChange={(e) => {
                      if (e.target.value) setDedSingleDate(e.target.value);
                    }}
                    className="px-2 py-1 text-xs font-mono font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setDedSingleDate(shiftDateByDays(dedSingleDate, 1))}
                    className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-mono font-bold cursor-pointer"
                    title="Ngày tiếp theo"
                  >
                    →
                  </button>
                </div>
              </div>
            )}

            {dedPeriodMode === 'month' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Chọn tháng:
                </span>
                <input
                  type="month"
                  value={dedSelectedMonth}
                  onChange={(e) => {
                    if (e.target.value) setDedSelectedMonth(e.target.value);
                  }}
                  className="px-3 py-1.5 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            {dedPeriodMode === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Từ ngày:</span>
                <input
                  type="date"
                  value={dedCustomStart}
                  onChange={(e) => setDedCustomStart(e.target.value)}
                  className="px-2.5 py-1.5 font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <span className="text-slate-600 dark:text-slate-300 font-medium">Đến ngày:</span>
                <input
                  type="date"
                  value={dedCustomEnd}
                  onChange={(e) => setDedCustomEnd(e.target.value)}
                  className="px-2.5 py-1.5 font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* Summary KPI Strip for Selected Period */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Tổng Khoản Trừ ({dedPeriodLabel})
              </div>
              <div className="mt-1 text-lg sm:text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                -{formatVND(deductionBreakdown.totalAmount)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {filteredDeductions.length} khoản trừ trong kỳ
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Chi Tiêu Trực Tiếp (Mua hàng / Bếp)
              </div>
              <div className="mt-1 text-base sm:text-lg font-bold font-mono text-slate-900 dark:text-white">
                -{formatVND(deductionBreakdown.directAmount)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {deductionBreakdown.directCount} khoản chi trực tiếp
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Hoàn Trả Khách (1 Dòng Tiền Duy Nhất)
              </div>
              <div className="mt-1 text-base sm:text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
                -{formatVND(deductionBreakdown.returnLinkedAmount)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {deductionBreakdown.returnLinkedCount} khoản từ mục Hoàn trả (Số bàn - Tên món - SL)
              </div>
            </div>
          </div>

          {/* Search & Type Filter Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
              <button
                type="button"
                onClick={() => setDedTypeFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  dedTypeFilter === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Tất cả loại ({filteredDeductions.length})
              </button>
              <button
                type="button"
                onClick={() => setDedTypeFilter('direct')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  dedTypeFilter === 'direct'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Chỉ Chi tiêu trực tiếp
              </button>
              <button
                type="button"
                onClick={() => setDedTypeFilter('return')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  dedTypeFilter === 'return'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Chỉ Khoản trừ từ Hoàn trả khách
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDeduction}
                  onChange={(e) => setSearchDeduction(e.target.value)}
                  placeholder="Tìm số bàn, tên món, khoản chi, ngày..."
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
                  <span>Xóa đang lọc ({filteredDeductions.length})</span>
                </button>
              )}
            </div>
          </div>

          {filteredDeductions.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              Không có khoản trừ nào trong kỳ <strong>{dedPeriodLabel}</strong>. Bạn có thể bấm chọn <strong>Hôm qua</strong>, <strong>Tuần</strong>, <strong>Tháng</strong> hoặc <strong>Tất cả</strong> ở thanh lọc phía trên để xem các ngày khác.
            </div>
          ) : (
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">Ngày tháng</th>
                    <th className="py-2.5 px-3">
                      Nội dung Khoản trừ (Số bàn - Tên món - SL hoàn trả / Khoản chi)
                    </th>
                    <th className="py-2.5 px-3">Nhóm khoản trừ</th>
                    <th className="py-2.5 px-3 text-right">Số tiền trừ</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                    {canDelete && <th className="py-2.5 px-3 text-right">Xóa</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredDeductions.map((ded) => {
                    const fromReturn = isReturnLinkedDeduction(ded);
                    return (
                      <tr
                        key={ded.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                          fromReturn ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <div>{formatDateDMY(ded.deductionDate)}</div>
                          <div className="text-[10px] text-slate-400">{ded.deductionDate}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
                            <span>{ded.productName}</span>
                            {fromReturn && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                                Hoàn trả khách (1 dòng tiền)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {ded.category}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER MODE 2: HOÀN TRẢ (CUSTOMER ITEM RETURNS - BEER / DISHES)
  // ============================================================================
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
              Chọn hóa đơn theo trình tự <strong>Ngày tháng — Số bàn — Mã Bill</strong>. Khi xác nhận hoàn trả, <strong>tiền trả lại cho khách sẽ tự động tính luôn vào Khoản trừ trong ngày</strong> với nội dung <strong>Số bàn - Tên món - Số lượng hoàn trả</strong>. Tiền hoàn trả và khoản trừ của hoàn trả đó được tính là <strong>1 dòng tiền duy nhất</strong>.
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

        {/* Step 1: Quick Date Picker Chips */}
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
                {formatDateDMY(d)}
                {d === todayStr ? ' (Hôm nay)' : d === yesterdayStr ? ' (Hôm qua)' : ''}
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
          {/* Step 2 & 3: Select Bill (ordered: Ngày tháng — Số bàn — Mã Bill — ...) & Item */}
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bước 2: Chọn Hóa Đơn (Trình tự: Ngày tháng — Số bàn — Mã Bill — Hình thức — Các món)
              </label>
              <select
                value={activeBill?.id || ''}
                onChange={(e) => {
                  setSelectedBillId(e.target.value);
                  setSelectedItemId('');
                }}
                className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {filteredBillsForDate.map((b) => {
                  const tableLabel = extractBillTableName(b, 'Bàn lẻ');
                  const dateDMY = formatDateDMY(b.billDate);
                  return (
                    <option key={b.id} value={b.id}>
                      {dateDMY} — {tableLabel} — {b.billCode} — {PAYMENT_LABELS[b.paymentType]} (
                      {formatVND(b.totalAmount)}) — {b.itemsSummary.slice(0, 50)}
                    </option>
                  );
                })}
              </select>

              {/* Quick Interactive Bill Cards ordered by Ngày tháng -> Số bàn -> ... */}
              {filteredBillsForDate.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
                  {filteredBillsForDate.slice(0, 8).map((b) => {
                    const isPickedBill = activeBill?.id === b.id;
                    const tableLabel = extractBillTableName(b, 'Bàn lẻ');
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setSelectedBillId(b.id);
                          setSelectedItemId('');
                        }}
                        className={`px-3 py-2 rounded-xl border text-left transition-all shrink-0 cursor-pointer ${
                          isPickedBill
                            ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 shadow-2xs'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-indigo-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-mono">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {formatDateDMY(b.billDate)}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-sans font-bold text-[10px]">
                            {tableLabel}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                          {b.billCode} · {formatVND(b.totalAmount)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bước 3: Chọn bia / món khách trả lại trong Bill{' '}
                {activeBill && (
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono">
                    ({formatDateDMY(activeBill.billDate)} —{' '}
                    {extractBillTableName(activeBill, 'Bàn lẻ')} — {activeBill.billCode})
                  </span>
                )}
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

          {/* Step 4: Table Number, Quantity & Single Cashflow Preview */}
          <div className="lg:col-span-5 p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="pb-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] text-slate-500 block">
                    Món / Bia đang chọn hoàn trả:
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeBillItem ? activeBillItem.productName : 'Chưa chọn món'}
                  </span>
                </div>
                {activeBill && (
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-bold">
                    {formatDateDMY(activeBill.billDate)}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Số bàn hoàn trả (Tự động lấy từ Bill hoặc nhập bổ sung) *
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={returnTableName}
                    onChange={(e) => setReturnTableName(e.target.value)}
                    placeholder="VD: Bàn 08, Bàn VIP 1..."
                    className="w-full pl-8 pr-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
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
                    Ngày hoàn trả (Tính vào Khoản trừ)
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Live Preview of Khoản Trừ Content (Số bàn - Tên món - SL hoàn trả) */}
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  <span>Tự động ghi vào Khoản trừ ngày {formatDateDMY(returnDate)}:</span>
                  <span className="font-mono">1 dòng tiền duy nhất</span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{previewDeductionTitle}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú thêm (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="Ví dụ: Khách trả lại bia chưa khui cuối buổi..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500">
                  Tiền hoàn trả (= Khoản trừ trong ngày):
                </span>
                <span className="text-base font-bold text-rose-600 dark:text-rose-400">
                  -{formatVND((activeBillItem?.unitPrice || 0) * (returnQty || 0))}
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
                    ? 'Đang lưu hoàn trả & khoản trừ...'
                    : 'Xác Nhận Hoàn Trả & Tính Vào Khoản Trừ Ngày'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Returns History */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Lịch Sử Hoàn Trả Bia Thừa / Món Thừa ({filteredReturns.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tổng tiền hoàn trả (Đã tính chung 1 dòng tiền duy nhất vào Khoản trừ ngày):{' '}
              <strong className="font-mono text-rose-600 dark:text-rose-400">
                -{formatVND(totalReturnsAmount)}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setRetPeriodMode('today')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  retPeriodMode === 'today'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => setRetPeriodMode('yesterday')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  retPeriodMode === 'yesterday'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Hôm qua
              </button>
              <button
                type="button"
                onClick={() => setRetPeriodMode('week')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  retPeriodMode === 'week'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Tuần
              </button>
              <button
                type="button"
                onClick={() => setRetPeriodMode('month')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  retPeriodMode === 'month'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Tháng
              </button>
              <button
                type="button"
                onClick={() => setRetPeriodMode('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  retPeriodMode === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Tất cả
              </button>
              <input
                type="date"
                value={retPeriodMode === 'single_day' ? retSingleDate : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    setRetSingleDate(e.target.value);
                    setRetPeriodMode('single_day');
                  } else {
                    setRetPeriodMode('all');
                  }
                }}
                className="px-2 py-0.5 text-xs font-mono bg-transparent text-slate-800 dark:text-slate-200 cursor-pointer"
                title="Chọn ngày xem hoàn trả"
              />
            </div>

            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchReturn}
                onChange={(e) => setSearchReturn(e.target.value)}
                placeholder="Tìm số bàn, tên món, mã bill..."
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
            Chưa có bản ghi hoàn trả bia thừa / món thừa nào trong kỳ đang chọn.
          </div>
        ) : (
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Ngày tháng</th>
                  <th className="py-2.5 px-3">Số bàn</th>
                  <th className="py-2.5 px-3">Nội dung Khoản trừ (Số bàn - Tên món - SL)</th>
                  <th className="py-2.5 px-3 text-right">SL hoàn trả</th>
                  <th className="py-2.5 px-3 text-right">Tiền hoàn trả (Khoản trừ)</th>
                  <th className="py-2.5 px-3">Bill gốc</th>
                  <th className="py-2.5 px-3">Ghi chú</th>
                  {canDelete && <th className="py-2.5 px-3 text-right">Xóa</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredReturns.map((ret) => {
                  const sourceBill = billMap.get(ret.billId);
                  const tableLabel = extractReturnTableName(
                    ret.note,
                    sourceBill,
                    'Bàn lẻ'
                  );
                  const deductionContent = formatReturnDeductionTitle(
                    tableLabel,
                    ret.productName,
                    ret.quantity
                  );
                  return (
                    <tr key={ret.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{formatDateDMY(ret.returnDate)}</div>
                        <div className="text-[10px] text-slate-400">{ret.returnDate}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                          {tableLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {deductionContent}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {formatNumber(ret.quantity)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        -{formatVND(ret.amount)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {ret.billCode} ({formatDateDMY(ret.billDate)})
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
                            title="Xóa hoàn trả & khoản trừ"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
