import React, { useState, useRef, useMemo } from 'react';
import {
  ArrowDownCircle,
  CheckCircle2,
  Edit3,
  RotateCcw,
  Search,
  UserCheck,
  Trash2,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  PAYMENT_LABELS,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, formatNumber } from '../utils/parser';

interface DebtManagerTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  products: ProductRecord[];
  canWrite: boolean;
  canDelete: boolean;
  onEditBill: (bill: BillRecord) => void;
  onUpdateBillItemPriceInline: (
    bill: BillRecord,
    item: BillItemRecord,
    newUnitPrice: number
  ) => Promise<void>;
  onJumpToReturnForBill: (bill: BillRecord) => void;
  onSettleDebt: (bill: BillRecord, settledVia: 'cash' | 'transfer') => Promise<void>;
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
  canWrite,
  canDelete,
  onEditBill,
  onUpdateBillItemPriceInline,
  onJumpToReturnForBill,
  onSettleDebt,
  onDeleteBill,
  onDeleteAllDebtBills,
  onDeleteAllMenuProducts,
  menuProductsCount,
  requestConfirm,
}) => {
  const detailSectionRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [inlinePrices, setInlinePrices] = useState<Record<string, number>>({});

  const allowDeleteDebt = canDelete || canWrite;

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
  }, [bills, statusFilter, searchQuery]);

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
      .reduce((sum, b) => sum + Math.max(0, b.totalAmount - (b.deductedAmount || 0)), 0);
  }, [bills]);

  const totalCompletedDebt = useMemo(() => {
    return bills
      .filter(
        (b) =>
          b.debtStatus === 'paid' ||
          (b.paymentType !== 'debt' && b.debtorName.trim() !== '')
      )
      .reduce((sum, b) => sum + Math.max(0, b.totalAmount - (b.deductedAmount || 0)), 0);
  }, [bills]);

  const uniqueDebtorsCount = useMemo(() => {
    const names = new Set(
      bills
        .filter((b) => b.paymentType === 'debt' && b.debtStatus !== 'paid')
        .map((b) => b.debtorName.trim().toLowerCase())
        .filter(Boolean)
    );
    return names.size;
  }, [bills]);

  const handleInspectAndScroll = (billId: string) => {
    setSelectedBillId(billId);
    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleSettle = (bill: BillRecord, method: 'cash' | 'transfer') => {
    if (!canWrite) return;
    const netDebt = Math.max(0, bill.totalAmount - (bill.deductedAmount || 0));
    requestConfirm({
      title: 'Xác nhận Tất Toán Công Nợ',
      message: `Bạn có chắc chắn muốn thu nợ ${formatVND(netDebt)} của khách "${
        bill.debtorName || 'Khách ghi nợ'
      }" (Bill ${bill.billCode}) bằng hình thức "${PAYMENT_LABELS[method]}" và cập nhật lên Firebase không?`,
      confirmLabel: `Xác nhận Thu nợ (${PAYMENT_LABELS[method]})`,
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

  const handleDeleteOneDebt = (bill: BillRecord) => {
    if (!allowDeleteDebt) return;
    const isCompleted = bill.debtStatus === 'paid' || bill.paymentType !== 'debt';
    const stateLabel = isCompleted ? 'Đã hoàn tất (Đã tất toán)' : 'Chưa hoàn tất (Đang nợ)';
    requestConfirm({
      title: 'Xác nhận Xóa Hóa Đơn Công Nợ',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn khoản công nợ "${bill.billCode}" của khách "${
        bill.debtorName || 'Khách nợ'
      }" (Trạng thái: ${stateLabel}) khỏi hệ thống Firebase không?`,
      confirmLabel: 'Xóa công nợ ngay',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteBill(bill);
      },
    });
  };

  const handleDeleteAllDebtClick = () => {
    if (!allowDeleteDebt || debtBills.length === 0) return;
    requestConfirm({
      title: 'Xác nhận Xóa Tất Cả Hóa Đơn Công Nợ',
      message: `Bạn có chắc chắn muốn xóa toàn bộ ${debtBills.length} hóa đơn công nợ đang hiển thị khỏi hệ thống Firebase không?`,
      confirmLabel: 'Xóa tất cả công nợ',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteAllDebtBills(debtBills);
      },
    });
  };

  const handleSaveInlinePrice = (item: BillItemRecord) => {
    if (!activeDebtBill || !canWrite) return;
    const newPrice =
      inlinePrices[item.id] !== undefined ? inlinePrices[item.id] : item.unitPrice;
    if (newPrice === item.unitPrice) return;

    requestConfirm({
      title: 'Xác nhận Đổi Giá Sản Phẩm Trong Bill Này',
      message: `Bạn có chắc chắn muốn đổi đơn giá món "${item.productName}" trong bill ${
        activeDebtBill.billCode
      } từ ${formatVND(item.unitPrice)} thành ${formatVND(
        newPrice
      )} không? (Giá mặc định trong Menu giữ nguyên).`,
      confirmLabel: 'Lưu giá mới',
      variant: 'warning',
      onConfirm: async () => {
        await onUpdateBillItemPriceInline(activeDebtBill, item, newPrice);
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
                const netDebt = Math.max(0, bill.totalAmount - (bill.deductedAmount || 0));
                const isPaid = bill.debtStatus === 'paid' || bill.paymentType !== 'debt';
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
                          {formatVND(netDebt)}
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
                            isPaid
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isPaid ? `Đã thu (${PAYMENT_LABELS[bill.paymentType]})` : 'Đang nợ'}
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
                    const netDebt = Math.max(0, bill.totalAmount - (bill.deductedAmount || 0));
                    const isPaid = bill.debtStatus === 'paid' || bill.paymentType !== 'debt';
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
                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                          {formatVND(netDebt)}
                        </td>
                        <td className="py-3 px-3">
                          {isPaid ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Đã tất toán ({PAYMENT_LABELS[bill.paymentType]})
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
                const isModified = draftPrice !== item.unitPrice;

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
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-800">
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
                    <th className="py-2.5 px-3">Tên món</th>
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
                    const isModified = draftPrice !== item.unitPrice;

                    return (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                          {item.productName}
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
                                  Lưu giá
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
              <div className="text-sm">
                <span className="text-slate-600 dark:text-slate-300">Còn nợ: </span>
                <strong className="text-amber-600 dark:text-amber-400">
                  {formatVND(
                    Math.max(0, activeDebtBill.totalAmount - (activeDebtBill.deductedAmount || 0))
                  )}
                </strong>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
