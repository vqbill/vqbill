import React, { useState, useRef, useMemo } from 'react';
import {
  ArrowDownCircle,
  CheckCircle2,
  Edit3,
  RotateCcw,
  Search,
  UserCheck,
  UserPlus,
  Users,
  Trash2,
  MessageSquareText,
  Wallet,
  History,
  PlusCircle,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  DebtPaymentRecord,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, formatNumber, getCurrentBusinessDate } from '../utils/parser';

interface DebtManagerTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  products: ProductRecord[];
  debtors?: string[];
  debtPayments?: DebtPaymentRecord[];
  onAddDebtor?: (name: string) => Promise<void>;
  onDeleteDebtor?: (name: string) => Promise<void>;
  canWrite: boolean;
  canDelete: boolean;
  onEditBill: (bill: BillRecord) => void;
  onUpdateBillItemPriceInline: (
    bill: BillRecord,
    item: BillItemRecord,
    newUnitPrice: number,
    newNote?: string
  ) => Promise<void>;
  onJumpToReturnForBill: (bill: BillRecord) => void;
  onSettleDebt: (bill: BillRecord, settledVia: 'cash' | 'transfer') => Promise<void>;
  onRecordPartialDebtPayment?: (params: {
    bill: BillRecord;
    amount: number;
    paymentMethod: 'cash' | 'transfer';
    paidDate: string;
    note: string;
  }) => Promise<void>;
  onDeletePartialDebtPayment?: (payment: DebtPaymentRecord) => Promise<void>;
  onDeleteBill: (bill: BillRecord) => Promise<void>;
  onDeleteAllDebtBills: (billsToDelete: BillRecord[]) => Promise<void>;
  onDeleteAllMenuProducts: () => void;
  menuProductsCount: number;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

export const DebtManagerTab: React.FC<DebtManagerTabProps> = ({
  bills,
  billItems,
  products,
  debtors = [],
  debtPayments = [],
  onAddDebtor,
  onDeleteDebtor,
  canWrite,
  canDelete,
  onEditBill,
  onUpdateBillItemPriceInline,
  onJumpToReturnForBill,
  onSettleDebt,
  onRecordPartialDebtPayment,
  onDeletePartialDebtPayment,
  onDeleteBill,
  onDeleteAllDebtBills,
  requestConfirm,
}) => {
  const detailSectionRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDebtorFilter, setSelectedDebtorFilter] = useState<string>('ALL');
  const [newDebtorInput, setNewDebtorInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [inlinePrices, setInlinePrices] = useState<Record<string, number>>({});
  const [inlineNotes, setInlineNotes] = useState<Record<string, string>>({});

  // Partial Debt Payment (Trả góp từng đợt) form state
  const [partialAmountInput, setPartialAmountInput] = useState<string>('');
  const [partialMethod, setPartialMethod] = useState<'cash' | 'transfer'>('cash');
  const [partialDate, setPartialDate] = useState<string>(() => getCurrentBusinessDate());
  const [partialNote, setPartialNote] = useState<string>('');

  const allowDeleteDebt = canDelete || canWrite;

  // Map billId -> list of partial payments & total paid so far
  const paymentsByBillId = useMemo(() => {
    const map = new Map<string, DebtPaymentRecord[]>();
    for (const p of debtPayments) {
      if (!p || !p.billId) continue;
      const list = map.get(p.billId) || [];
      list.push(p);
      map.set(p.billId, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      map.set(k, list);
    }
    return map;
  }, [debtPayments]);

  const getBillDebtMetrics = (bill: BillRecord) => {
    const netOriginal = Math.max(0, bill.totalAmount - (bill.deductedAmount || 0));
    const list = paymentsByBillId.get(bill.id) || [];
    const paidInstallments = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const isFullyPaid =
      bill.debtStatus === 'paid' ||
      bill.paymentType !== 'debt' ||
      (netOriginal > 0 && paidInstallments >= netOriginal);
    const remainingDebt = isFullyPaid
      ? 0
      : Math.max(0, netOriginal - paidInstallments);
    const effectivePaid = isFullyPaid
      ? netOriginal
      : Math.min(netOriginal, paidInstallments);
    return {
      netOriginal,
      paidInstallments,
      effectivePaid,
      remainingDebt,
      isFullyPaid,
      paymentsList: list,
    };
  };

  const allDebtorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of debtors) {
      const clean = d.trim();
      if (clean) map.set(clean.toLowerCase(), clean);
    }
    for (const b of bills) {
      const clean = (b.debtorName || '').trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    }
    return Array.from(map.values());
  }, [debtors, bills]);

  const debtBills = useMemo(() => {
    return bills
      .filter(
        (b) =>
          b.paymentType === 'debt' ||
          b.debtStatus === 'unpaid' ||
          b.debtStatus === 'paid' ||
          b.debtorName.trim() !== ''
      )
      .filter((b) => {
        if (selectedDebtorFilter !== 'ALL') {
          return (
            b.debtorName.trim().toLowerCase() ===
            selectedDebtorFilter.trim().toLowerCase()
          );
        }
        return true;
      })
      .filter((b) => {
        const isCompleted = b.debtStatus === 'paid' || b.paymentType !== 'debt';
        if (statusFilter === 'unpaid') return !isCompleted;
        if (statusFilter === 'paid') return isCompleted;
        return true;
      })
      .filter((b) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          b.debtorName.toLowerCase().includes(q) ||
          b.billCode.toLowerCase().includes(q) ||
          b.billDate.includes(q) ||
          b.itemsSummary.toLowerCase().includes(q) ||
          b.note.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.billDate.localeCompare(a.billDate) || b.createdAtMs - a.createdAtMs);
  }, [bills, selectedDebtorFilter, statusFilter, searchQuery]);

  const activeDebtBill = useMemo(() => {
    if (selectedBillId) {
      const found = debtBills.find((b) => b.id === selectedBillId);
      if (found) return found;
    }
    return debtBills[0] || null;
  }, [debtBills, selectedBillId]);

  const activeBillItems = useMemo(() => {
    if (!activeDebtBill) return [];
    return billItems.filter((it) => it.billId === activeDebtBill.id);
  }, [billItems, activeDebtBill]);

  const totalUnpaidDebt = useMemo(() => {
    return bills
      .filter((b) => b.paymentType === 'debt' && b.debtStatus !== 'paid')
      .reduce((sum, b) => sum + getBillDebtMetrics(b).remainingDebt, 0);
  }, [bills, paymentsByBillId]);

  const totalCompletedDebt = useMemo(() => {
    return bills
      .filter(
        (b) =>
          b.paymentType === 'debt' ||
          b.debtStatus === 'unpaid' ||
          b.debtStatus === 'paid' ||
          b.debtorName.trim() !== ''
      )
      .reduce((sum, b) => sum + getBillDebtMetrics(b).effectivePaid, 0);
  }, [bills, paymentsByBillId]);

  const uniqueDebtorsCount = useMemo(() => {
    const names = new Set(
      bills
        .filter((b) => getBillDebtMetrics(b).remainingDebt > 0)
        .map((b) => b.debtorName.trim().toLowerCase())
        .filter(Boolean)
    );
    return names.size;
  }, [bills, paymentsByBillId]);

  const handleInspectAndScroll = (billId: string) => {
    setSelectedBillId(billId);
    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleSettle = (bill: BillRecord, method: 'cash' | 'transfer') => {
    if (!canWrite) return;
    const { remainingDebt } = getBillDebtMetrics(bill);
    requestConfirm({
      title: 'Xác nhận Tất Toán Dư Nợ Còn Lại',
      message: `Bạn có chắc chắn muốn thu dứt điểm số dư nợ còn lại ${formatVND(
        remainingDebt
      )} của khách "${
        bill.debtorName || 'Khách ghi nợ'
      }" (Bill ${bill.billCode}) bằng hình thức "${PAYMENT_LABELS[method]}" không?`,
      confirmLabel: `Xác nhận Thu hết (${PAYMENT_LABELS[method]})`,
      variant: 'primary',
      onConfirm: async () => {
        setIsSettling(true);
        try {
          await onSettleDebt(bill, method);
        } finally {
          setIsSettling(false);
        }
      },
    });
  };

  const handleRecordPartialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDebtBill || !canWrite || !onRecordPartialDebtPayment) return;
    const { remainingDebt } = getBillDebtMetrics(activeDebtBill);
    const cleanAmt = Math.round(Number(partialAmountInput.replace(/[^\d]/g, '')) || 0);
    if (cleanAmt <= 0) return;
    const cappedAmt = Math.min(remainingDebt, cleanAmt);
    if (cappedAmt <= 0) return;

    const afterRemain = Math.max(0, remainingDebt - cappedAmt);
    requestConfirm({
      title: 'Xác nhận Thu Nợ Từng Phần (Trả Góp Công Nợ)',
      message: `Ghi nhận khách "${
        activeDebtBill.debtorName || 'Khách nợ'
      }" trả trước ${formatVND(cappedAmt)} (${PAYMENT_LABELS[partialMethod]}) cho Bill ${
        activeDebtBill.billCode
      }? Dư nợ còn lại sau đợt này: ${formatVND(afterRemain)}.`,
      confirmLabel: `Thu ${formatVND(cappedAmt)}`,
      variant: 'primary',
      onConfirm: async () => {
        setIsSettling(true);
        try {
          await onRecordPartialDebtPayment({
            bill: activeDebtBill,
            amount: cappedAmt,
            paymentMethod: partialMethod,
            paidDate: partialDate || getCurrentBusinessDate(),
            note: partialNote.trim(),
          });
          setPartialAmountInput('');
          setPartialNote('');
        } finally {
          setIsSettling(false);
        }
      },
    });
  };

  const handleDeleteOneDebt = (bill: BillRecord) => {
    if (!allowDeleteDebt) return;
    const isCompleted = bill.debtStatus === 'paid' || bill.paymentType !== 'debt';
    const stateLabel = isCompleted ? 'Đã hoàn tất (Đã tất toán)' : 'Chưa hoàn tất (Đang nợ)';
    requestConfirm({
      title: 'Xác nhận Xóa Hóa Đơn Công Nợ',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn khoản công nợ "${bill.billCode}" của khách "${
        bill.debtorName || 'Khách nợ'
      }" (Trạng thái: ${stateLabel}) khỏi hệ thống không?`,
      confirmLabel: 'Xóa công nợ ngay',
      variant: 'danger',
      onConfirm: async () => {
        if (selectedBillId === bill.id) {
          setSelectedBillId(null);
        }
        await onDeleteBill(bill);
      },
    });
  };

  const handleDeleteAllDebtClick = () => {
    if (!allowDeleteDebt || debtBills.length === 0) return;
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Hóa Đơn Công Nợ',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${debtBills.length} hóa đơn công nợ đang hiển thị khỏi hệ thống không?`,
      confirmLabel: 'Xóa tất cả công nợ',
      variant: 'danger',
      onConfirm: async () => {
        setSelectedBillId(null);
        await onDeleteAllDebtBills(debtBills);
      },
    });
  };

  const handleDeleteDebtorClick = (debtorName: string) => {
    if (!allowDeleteDebt || !onDeleteDebtor) return;
    const clean = debtorName.trim();
    if (!clean) return;
    const matchingBillsCount = bills.filter(
      (b) => (b.debtorName || '').trim().toLowerCase() === clean.toLowerCase()
    ).length;

    requestConfirm({
      title: 'Xác nhận Xóa Khách Nợ & Công Nợ',
      message:
        matchingBillsCount > 0
          ? `Bạn có chắc chắn muốn xóa khách nợ "${clean}" cùng toàn bộ ${matchingBillsCount} hóa đơn công nợ của khách này khỏi hệ thống không?`
          : `Bạn có chắc chắn muốn xóa khách nợ "${clean}" khỏi danh sách Quản lý Công nợ không?`,
      confirmLabel: 'Xóa khách nợ',
      variant: 'danger',
      onConfirm: async () => {
        if (selectedDebtorFilter.trim().toLowerCase() === clean.toLowerCase()) {
          setSelectedDebtorFilter('ALL');
        }
        await onDeleteDebtor(clean);
      },
    });
  };

  const handleAddNewDebtor = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newDebtorInput.trim();
    if (!clean || !onAddDebtor || !canWrite) return;
    await onAddDebtor(clean);
    setNewDebtorInput('');
  };

  const handleSaveInlinePrice = (item: BillItemRecord) => {
    if (!activeDebtBill || !canWrite) return;
    const newPrice =
      inlinePrices[item.id] !== undefined ? inlinePrices[item.id] : item.unitPrice;
    const newNote =
      inlineNotes[item.id] !== undefined ? inlineNotes[item.id] : item.note || '';
    if (newPrice === item.unitPrice && newNote.trim() === (item.note || '').trim()) return;

    requestConfirm({
      title: 'Xác nhận Cập Nhật Giá & Ghi Chú Món Trong Bill Công Nợ',
      message: `Bạn có chắc chắn muốn cập nhật món "${item.productName}" trong bill ${
        activeDebtBill.billCode
      } (Đơn giá: ${formatVND(newPrice)}${
        newNote.trim() ? `, Ghi chú: "${newNote.trim()}"` : ''
      }) không? (Giá mặc định trong Menu giữ nguyên).`,
      confirmLabel: 'Lưu thay đổi',
      variant: 'warning',
      onConfirm: async () => {
        await onUpdateBillItemPriceInline(activeDebtBill, item, newPrice, newNote.trim());
      },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Đang ghi nợ (Chưa tất toán)
          </span>
          <div className="mt-1.5 text-xl sm:text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatVND(totalUnpaidDebt)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {uniqueDebtorsCount} khách hàng đang nợ
          </p>
        </div>

        <div className="p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Đã hoàn tất (Đã tất toán)
          </span>
          <div className="mt-1.5 text-xl sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatVND(totalCompletedDebt)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Đã cộng vào doanh thu thực thu
          </p>
        </div>

        <div className="p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tổng hóa đơn công nợ
          </span>
          <div className="mt-1.5 text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatNumber(debtBills.length)} bill
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Bấm vào bill để xem món & tất toán
          </p>
        </div>
      </div>

      {/* Debtors Directory & Quick Delete/Filter Bar */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Danh Sách Khách Nợ ({allDebtorNames.length})
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Bấm vào tên khách để lọc hóa đơn hoặc bấm biểu tượng thùng rác để xóa khách nợ & công nợ.
              </p>
            </div>
          </div>

          {canWrite && onAddDebtor && (
            <form onSubmit={handleAddNewDebtor} className="flex items-center gap-2">
              <input
                type="text"
                value={newDebtorInput}
                onChange={(e) => setNewDebtorInput(e.target.value)}
                placeholder="Nhập tên khách nợ mới..."
                className="h-9 px-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="h-9 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Thêm khách</span>
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDebtorFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              selectedDebtorFilter === 'ALL'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
            }`}
          >
            Tất cả khách nợ ({allDebtorNames.length})
          </button>

          {allDebtorNames.map((dName) => {
            const isSelected =
              selectedDebtorFilter !== 'ALL' &&
              selectedDebtorFilter.trim().toLowerCase() === dName.trim().toLowerCase();
            const dBills = bills.filter(
              (b) =>
                (b.debtorName || '').trim().toLowerCase() ===
                dName.trim().toLowerCase()
            );
            const unpaidSum = dBills.reduce(
              (s, b) => s + getBillDebtMetrics(b).remainingDebt,
              0
            );

            return (
              <div
                key={dName}
                className={`inline-flex items-center rounded-xl border text-xs transition-colors ${
                  isSelected
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-900 dark:text-amber-200'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDebtorFilter(isSelected ? 'ALL' : dName)
                  }
                  className="px-3 py-1.5 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{dName}</span>
                  <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                    ({dBills.length} bill{unpaidSum > 0 ? ` · ${formatVND(unpaidSum)}` : ''})
                  </span>
                </button>
                {allowDeleteDebt && onDeleteDebtor && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDebtorClick(dName);
                    }}
                    title={`Xóa khách nợ ${dName}`}
                    className="pr-2.5 pl-1 py-1.5 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter & Debt List */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Danh Sách Công Nợ Khách Hàng
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chọn hóa đơn để xem chi tiết món, chỉnh giá riêng hoặc thu nợ tiền mặt / chuyển khoản.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên khách, mã bill, món..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto overflow-x-auto">
              {(['all', 'unpaid', 'paid'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {st === 'all'
                    ? 'Tất cả'
                    : st === 'unpaid'
                    ? 'Đang nợ'
                    : 'Đã tất toán'}
                </button>
              ))}
            </div>

            {allowDeleteDebt && debtBills.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllDebtClick}
                className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả ({debtBills.length})</span>
              </button>
            )}
          </div>
        </div>

        {debtBills.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500 dark:text-slate-400">
            Không có khoản công nợ nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          <>
            {/* Mobile Debt Cards (< md) */}
            <div className="md:hidden space-y-2.5">
              {debtBills.map((bill) => {
                const {
                  netOriginal,
                  paidInstallments,
                  remainingDebt,
                  isFullyPaid: isPaid,
                } = getBillDebtMetrics(bill);
                const isSelected = activeDebtBill?.id === bill.id;

                return (
                  <div
                    key={bill.id}
                    onClick={() => handleInspectAndScroll(bill.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                        : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {bill.debtorName || 'Khách ghi nợ'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {bill.billDate} · {bill.billCode}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                          {isPaid ? formatVND(netOriginal) : `Còn nợ: ${formatVND(remainingDebt)}`}
                        </div>
                        {paidInstallments > 0 && !isPaid && (
                          <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                            Đã trả góp: {formatVND(paidInstallments)} / {formatVND(netOriginal)}
                          </div>
                        )}
                        <div
                          className={`text-[11px] font-semibold ${
                            isPaid
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : paidInstallments > 0
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isPaid
                            ? `Đã thu đủ (${PAYMENT_LABELS[bill.paymentType]})`
                            : paidInstallments > 0
                            ? 'Đang trả góp từng phần'
                            : 'Đang nợ'}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {bill.itemsSummary}
                    </p>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInspectAndScroll(bill.id);
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowDownCircle className="w-3.5 h-3.5 text-amber-500" />
                        <span>Chi tiết & Thu nợ</span>
                      </button>
                      {allowDeleteDebt && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOneDebt(bill);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">Khách nợ</th>
                    <th className="py-2.5 px-3">Ngày nợ</th>
                    <th className="py-2.5 px-3">Mã Bill</th>
                    <th className="py-2.5 px-3">Tóm tắt món</th>
                    <th className="py-2.5 px-3 text-right">Số tiền thực</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {debtBills.map((bill) => {
                    const {
                      netOriginal,
                      paidInstallments,
                      remainingDebt,
                      isFullyPaid: isPaid,
                    } = getBillDebtMetrics(bill);
                    const isSelected = activeDebtBill?.id === bill.id;

                    return (
                      <tr
                        key={bill.id}
                        onClick={() => handleInspectAndScroll(bill.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-50/70 dark:bg-amber-950/25'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                          {bill.debtorName || 'Khách ghi nợ'}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {bill.billDate}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">
                          {bill.billCode}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {bill.itemsSummary}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <div className="font-bold text-amber-600 dark:text-amber-400">
                            {isPaid ? formatVND(netOriginal) : formatVND(remainingDebt)}
                          </div>
                          {paidInstallments > 0 && !isPaid && (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              Đã trả: {formatVND(paidInstallments)} / {formatVND(netOriginal)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {isPaid ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Đã tất toán ({PAYMENT_LABELS[bill.paymentType]})
                            </span>
                          ) : paidInstallments > 0 ? (
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">
                              Đang trả góp (Còn {formatVND(remainingDebt)})
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              Đang nợ
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInspectAndScroll(bill.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <ArrowDownCircle className="w-3.5 h-3.5 text-amber-500" />
                            <span>Xem món</span>
                          </button>
                          {allowDeleteDebt && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOneDebt(bill);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Xóa</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Target Scroll Section: Detailed Bill Items Inspector */}
      <div
        ref={detailSectionRef}
        className="p-4 sm:p-5 border-2 border-amber-500/40 dark:border-amber-500/30 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4 scroll-mt-20"
      >
        {!activeDebtBill ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Chọn một khoản công nợ ở danh sách trên để xem chi tiết các món trong hóa đơn.
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-mono font-semibold">
                  <span>CHI TIẾT BILL CÔNG NỢ</span>
                  <span>·</span>
                  <span>{activeDebtBill.billCode}</span>
                  <span>·</span>
                  <span>{activeDebtBill.billDate}</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                  Khách nợ: {activeDebtBill.debtorName || 'Khách ghi nợ'}
                </h3>
                {activeDebtBill.note && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Ghi chú: {activeDebtBill.note}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                {canWrite && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEditBill(activeDebtBill)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Sửa Bill</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onJumpToReturnForBill(activeDebtBill)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Hoàn trả món</span>
                    </button>

                    {activeDebtBill.paymentType === 'debt' &&
                      activeDebtBill.debtStatus !== 'paid' && (
                        <>
                          <button
                            type="button"
                            disabled={isSettling}
                            onClick={() => handleSettle(activeDebtBill, 'cash')}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Thu Tiền mặt</span>
                          </button>
                          <button
                            type="button"
                            disabled={isSettling}
                            onClick={() => handleSettle(activeDebtBill, 'transfer')}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Thu Chuyển khoản</span>
                          </button>
                        </>
                      )}
                  </>
                )}

                {allowDeleteDebt && (
                  <button
                    type="button"
                    onClick={() => handleDeleteOneDebt(activeDebtBill)}
                    className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa Công Nợ</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Item Cards (< sm) */}
            <div className="sm:hidden space-y-2.5">
              {activeBillItems.map((item, idx) => {
                const draftPrice =
                  inlinePrices[item.id] !== undefined
                    ? inlinePrices[item.id]
                    : item.unitPrice;
                const draftNote =
                  inlineNotes[item.id] !== undefined
                    ? inlineNotes[item.id]
                    : item.note || '';
                const isModified =
                  draftPrice !== item.unitPrice ||
                  draftNote.trim() !== (item.note || '').trim();

                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">
                        #{idx + 1}. {item.productName}
                      </span>
                      <span className="text-[11px] text-slate-500">{item.category}</span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span>
                        SL: <strong>{item.quantity}</strong>
                        {item.returnedQuantity > 0 && (
                          <span className="text-rose-500 ml-1">
                            (Trả {item.returnedQuantity})
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatVND(item.quantity * draftPrice)}
                      </span>
                    </div>
                    {canWrite && (
                      <div className="space-y-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-800">
                        <div className="relative">
                          <MessageSquareText className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={draftNote}
                            onChange={(e) =>
                              setInlineNotes((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            placeholder="Ghi chú món trong bill..."
                            className="w-full h-8 pl-8 pr-2.5 text-[11px] rounded-lg border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900 text-slate-800 dark:text-amber-200"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500">Đơn giá trong bill:</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={draftPrice}
                              onChange={(e) =>
                                setInlinePrices((prev) => ({
                                  ...prev,
                                  [item.id]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                                }))
                              }
                              className="w-28 px-2 py-1 text-right font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                            {isModified && (
                              <button
                                type="button"
                                onClick={() => handleSaveInlinePrice(item)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Lưu
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Items Table (>= sm) */}
            <div className="hidden sm:block border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">STT</th>
                    <th className="py-2.5 px-3">Tên món & Ghi chú</th>
                    <th className="py-2.5 px-3">Danh mục</th>
                    <th className="py-2.5 px-3 text-right">Số lượng</th>
                    <th className="py-2.5 px-3 text-right">Đã trả</th>
                    <th className="py-2.5 px-3 text-right">Đơn giá trong Bill</th>
                    <th className="py-2.5 px-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {activeBillItems.map((item, idx) => {
                    const catalogProd = products.find(
                      (p) =>
                        p.productName.toLowerCase().trim() ===
                        item.productName.toLowerCase().trim()
                    );
                    const draftPrice =
                      inlinePrices[item.id] !== undefined
                        ? inlinePrices[item.id]
                        : item.unitPrice;
                    const draftNote =
                      inlineNotes[item.id] !== undefined
                        ? inlineNotes[item.id]
                        : item.note || '';
                    const isModified =
                      draftPrice !== item.unitPrice ||
                      draftNote.trim() !== (item.note || '').trim();

                    return (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white space-y-1">
                          <div>{item.productName}</div>
                          {canWrite ? (
                            <div className="relative">
                              <MessageSquareText className="w-3 h-3 text-amber-500 absolute left-2 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={draftNote}
                                onChange={(e) =>
                                  setInlineNotes((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder="Ghi chú món..."
                                className="w-full h-7 pl-6 pr-2 font-sans font-normal text-[11px] rounded-md border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-slate-700 dark:text-amber-200"
                              />
                            </div>
                          ) : (
                            item.note && (
                              <div className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                                Ghi chú: {item.note}
                              </div>
                            )
                          )}
                          {catalogProd && (
                            <span className="block text-[10px] font-normal text-slate-400 font-mono">
                              Giá Menu: {formatVND(catalogProd.unitPrice)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-400">
                          {item.category}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatNumber(item.quantity)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400">
                          {item.returnedQuantity > 0 ? `-${item.returnedQuantity}` : '0'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {canWrite ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                value={draftPrice}
                                onChange={(e) =>
                                  setInlinePrices((prev) => ({
                                    ...prev,
                                    [item.id]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                                  }))
                                }
                                className="w-28 px-2 py-1 text-right font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                              />
                              {isModified && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlinePrice(item)}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                                >
                                  Lưu
                                </button>
                              )}
                            </div>
                          ) : (
                            formatVND(item.unitPrice)
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                          {formatVND(item.quantity * draftPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 sm:gap-6 pt-2 text-xs font-mono">
              <div>
                <span className="text-slate-500">Tổng gốc: </span>
                <strong className="text-slate-900 dark:text-white">
                  {formatVND(activeDebtBill.totalAmount)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Khoản trừ: </span>
                <strong className="text-rose-600 dark:text-rose-400">
                  -{formatVND(activeDebtBill.deductedAmount || 0)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Đã trả góp: </span>
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {formatVND(getBillDebtMetrics(activeDebtBill).effectivePaid)}
                </strong>
              </div>
              <div className="text-sm">
                <span className="text-slate-600 dark:text-slate-300">Còn dư nợ: </span>
                <strong className="text-amber-600 dark:text-amber-400">
                  {formatVND(getBillDebtMetrics(activeDebtBill).remainingDebt)}
                </strong>
              </div>
            </div>

            {/* PARTIAL DEBT PAYMENT (TRẢ GÓP CÔNG NỢ TỪNG ĐỢT) & HISTORY PANEL */}
            {(() => {
              const metrics = getBillDebtMetrics(activeDebtBill);
              return (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          Trả Góp Công Nợ Từng Phần & Lịch Sử Trả Nợ ({metrics.paymentsList.length} đợt)
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Cho phép khách trả trước một phần bằng Tiền mặt hoặc Chuyển khoản, hệ thống tự trừ dư nợ và lưu lịch sử từng đợt.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3 Balance Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-[11px] font-sans text-slate-500">
                        1. Tổng nợ gốc (Sau hoàn trả)
                      </div>
                      <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                        {formatVND(metrics.netOriginal)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30">
                      <div className="text-[11px] font-sans text-emerald-700 dark:text-emerald-300">
                        2. Đã thanh toán ({metrics.paymentsList.length} đợt)
                      </div>
                      <div className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {formatVND(metrics.effectivePaid)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/30">
                      <div className="text-[11px] font-sans text-amber-800 dark:text-amber-300">
                        3. Còn dư nợ phải thu
                      </div>
                      <div className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">
                        {formatVND(metrics.remainingDebt)}
                      </div>
                    </div>
                  </div>

                  {/* Form to record a new partial installment */}
                  {canWrite && !metrics.isFullyPaid && onRecordPartialDebtPayment && (
                    <form
                      onSubmit={handleRecordPartialSubmit}
                      className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Nhập Số Tiền Khách Trả Đợt Này:</span>
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                          {[500000, 1000000, Math.round(metrics.remainingDebt / 2), metrics.remainingDebt]
                            .filter((v, i, arr) => v > 0 && v <= metrics.remainingDebt && arr.indexOf(v) === i)
                            .map((presetAmt) => (
                              <button
                                key={presetAmt}
                                type="button"
                                onClick={() => setPartialAmountInput(String(presetAmt))}
                                className="px-2 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-semibold cursor-pointer"
                              >
                                {presetAmt === metrics.remainingDebt
                                  ? `Trả hết (${formatVND(presetAmt)})`
                                  : `+ ${formatVND(presetAmt)}`}
                              </button>
                            ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Số tiền trả (VNĐ):
                          </label>
                          <input
                            type="number"
                            min={1000}
                            max={metrics.remainingDebt}
                            step={1000}
                            value={partialAmountInput}
                            onChange={(e) => setPartialAmountInput(e.target.value)}
                            placeholder={`Tối đa ${metrics.remainingDebt}`}
                            className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-emerald-600 dark:text-emerald-400"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Hình thức thanh toán:
                          </label>
                          <select
                            value={partialMethod}
                            onChange={(e) =>
                              setPartialMethod(e.target.value as 'cash' | 'transfer')
                            }
                            className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                          >
                            <option value="cash">Tiền mặt</option>
                            <option value="transfer">Chuyển khoản</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Ngày thu tiền:
                          </label>
                          <input
                            type="date"
                            value={partialDate}
                            onChange={(e) => setPartialDate(e.target.value)}
                            className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Ghi chú đợt trả:
                          </label>
                          <input
                            type="text"
                            value={partialNote}
                            onChange={(e) => setPartialNote(e.target.value)}
                            placeholder="VD: Trả trước đợt 1..."
                            className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSettling || !partialAmountInput}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Ghi Nhận Trả Góp Đợt Này</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Installment History Table */}
                  {metrics.paymentsList.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                            <th className="py-2 px-3">Đợt trả</th>
                            <th className="py-2 px-3">Ngày thu</th>
                            <th className="py-2 px-3">Hình thức</th>
                            <th className="py-2 px-3 text-right">Số tiền đã trả</th>
                            <th className="py-2 px-3">Ghi chú</th>
                            {allowDeleteDebt && onDeletePartialDebtPayment && (
                              <th className="py-2 px-3 text-right">Xóa</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                          {metrics.paymentsList.map((pmt, pIdx) => (
                            <tr key={pmt.id}>
                              <td className="py-2 px-3 font-bold text-slate-700 dark:text-slate-300">
                                <span className="inline-flex items-center gap-1">
                                  <History className="w-3 h-3 text-emerald-500" />
                                  Đợt #{pIdx + 1}
                                </span>
                              </td>
                              <td className="py-2 px-3">{pmt.paidDate}</td>
                              <td className="py-2 px-3 font-sans font-semibold">
                                <span
                                  className={
                                    pmt.paymentMethod === 'cash'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-blue-600 dark:text-blue-400'
                                  }
                                >
                                  {PAYMENT_LABELS[pmt.paymentMethod]}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                +{formatVND(pmt.amount)}
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                                {pmt.note || 'Thu nợ từng phần'}
                              </td>
                              {allowDeleteDebt && onDeletePartialDebtPayment && (
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      requestConfirm({
                                        title: 'Xác nhận Xóa Đợt Trả Góp Công Nợ',
                                        message: `Bạn có chắc chắn muốn xóa đợt trả nợ ${formatVND(
                                          pmt.amount
                                        )} ngày ${pmt.paidDate} để hoàn lại dư nợ cho Bill ${
                                          activeDebtBill.billCode
                                        } không?`,
                                        confirmLabel: 'Xóa đợt trả này',
                                        variant: 'danger',
                                        onConfirm: async () => {
                                          await onDeletePartialDebtPayment(pmt);
                                        },
                                      });
                                    }}
                                    className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                    title="Xóa đợt trả nợ này"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};
