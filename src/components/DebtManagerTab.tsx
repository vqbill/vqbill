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
  PAYMENT_LABELS,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, formatNumber } from '../utils/parser';

interface DebtManagerTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  canWrite: boolean;
  canDelete: boolean;
  onEditBill: (bill: BillRecord) => void;
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
  canWrite,
  canDelete,
  onEditBill,
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

  const debtBills = useMemo(() => {
    return bills
      .filter((b) => b.paymentType === 'debt' || b.debtorName.trim() !== '')
      .filter((b) => {
        if (statusFilter === 'unpaid') return b.debtStatus !== 'paid' && b.paymentType === 'debt';
        if (statusFilter === 'paid') return b.debtStatus === 'paid' || b.paymentType !== 'debt';
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
    if (!canDelete) return;
    requestConfirm({
      title: 'Xác nhận Xóa Hóa Đơn Công Nợ',
      message: `Bạn có chắc chắn muốn xóa hóa đơn công nợ "${bill.billCode}" của khách "${
        bill.debtorName || 'Khách nợ'
      }" khỏi Firebase không?`,
      confirmLabel: 'Xóa hóa đơn nợ',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteBill(bill);
      },
    });
  };

  const handleDeleteAllDebtClick = () => {
    if (!canDelete || debtBills.length === 0) return;
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

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tổng công nợ đang ghi nợ (Chưa thu)
          </span>
          <div className="mt-1 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatVND(totalUnpaidDebt)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Đã trừ các khoản hoàn trả món trên bill nợ
          </p>
        </div>

        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Số lượng khách đang nợ
          </span>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatNumber(uniqueDebtorsCount)} khách
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Theo dõi chi tiết tên người nợ & ngày phát sinh
          </p>
        </div>

        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tổng số hóa đơn công nợ
          </span>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatNumber(debtBills.length)} bill
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Bấm vào từng khoản nợ để cuộn xuống xem chi tiết món
          </p>
        </div>
      </div>

      {/* Filter & Debt List */}
      <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Danh Sách Công Nợ Theo Khách Hàng & Theo Ngày
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bấm vào dòng công nợ bất kỳ để tự động cuộn (scroll) xuống xem chi tiết các món ăn trong bill đó
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên người nợ, ngày, món..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'unpaid', 'paid'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {st === 'all' ? 'Tất cả' : st === 'unpaid' ? 'Đang nợ' : 'Đã tất toán'}
                </button>
              ))}
            </div>

            {canDelete && debtBills.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllDebtClick}
                className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả công nợ ({debtBills.length})</span>
              </button>
            )}

            {canWrite && menuProductsCount > 0 && (
              <button
                type="button"
                onClick={onDeleteAllMenuProducts}
                className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả SP trong Menu ({menuProductsCount})</span>
              </button>
            )}
          </div>
        </div>

        {debtBills.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
            Không có khoản công nợ nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[680px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Người nợ (Khách hàng)</th>
                  <th className="py-2.5 px-3">Ngày nợ</th>
                  <th className="py-2.5 px-3">Mã Bill</th>
                  <th className="py-2.5 px-3">Tóm tắt món</th>
                  <th className="py-2.5 px-3 text-right">Số tiền nợ thực</th>
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
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Đã tất toán ({PAYMENT_LABELS[bill.paymentType]})
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Chưa thanh toán
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5 text-amber-500" />
                          <span>Xem bill gồm món gì</span>
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteOneDebt(bill);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer align-middle"
                            title="Xóa bill công nợ"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Target Scroll Section: Detailed Bill Items Inspector */}
      <div
        ref={detailSectionRef}
        className="p-5 border-2 border-amber-500/40 dark:border-amber-500/30 rounded-xl bg-white dark:bg-slate-900 space-y-4 scroll-mt-20"
      >
        {!activeDebtBill ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Chọn một khoản công nợ ở bảng trên để xem chi tiết các món trong hóa đơn.
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-mono">
                  <span>CHI TIẾT HÓA ĐƠN CÔNG NỢ</span>
                  <span>·</span>
                  <span>{activeDebtBill.billCode}</span>
                  <span>·</span>
                  <span>Ngày {activeDebtBill.billDate}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  Khách nợ: {activeDebtBill.debtorName || 'Khách ghi nợ'}
                </h3>
                {activeDebtBill.note && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Ghi chú: {activeDebtBill.note}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canWrite && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEditBill(activeDebtBill)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Chỉnh sửa Bill</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onJumpToReturnForBill(activeDebtBill)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer whitespace-nowrap"
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
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Thu nợ Tiền mặt</span>
                          </button>
                          <button
                            type="button"
                            disabled={isSettling}
                            onClick={() => handleSettle(activeDebtBill, 'transfer')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Thu nợ Chuyển khoản</span>
                          </button>
                        </>
                      )}
                  </>
                )}
              </div>
            </div>

            {/* Items in this Debt Bill */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3">STT</th>
                    <th className="py-2 px-3">Tên món ăn / Nước uống</th>
                    <th className="py-2 px-3">Danh mục</th>
                    <th className="py-2 px-3 text-right">Số lượng</th>
                    <th className="py-2 px-3 text-right">Đã hoàn trả</th>
                    <th className="py-2 px-3 text-right">Đơn giá</th>
                    <th className="py-2 px-3 text-right">Thành tiền gốc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {activeBillItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                        {item.productName}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-400">
                        {item.category}
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatNumber(item.quantity)}</td>
                      <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400">
                        {item.returnedQuantity > 0 ? `-${item.returnedQuantity}` : '0'}
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatVND(item.unitPrice)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                        {formatVND(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-6 pt-2 text-xs font-mono">
              <div>
                <span className="text-slate-500">Tổng bill gốc: </span>
                <strong className="text-slate-900 dark:text-white">
                  {formatVND(activeDebtBill.totalAmount)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Khoản trừ hoàn trả: </span>
                <strong className="text-rose-600 dark:text-rose-400">
                  -{formatVND(activeDebtBill.deductedAmount || 0)}
                </strong>
              </div>
              <div className="text-sm">
                <span className="text-slate-600 dark:text-slate-300">Còn nợ thực tế: </span>
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
