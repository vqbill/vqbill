import React, { useState, useMemo } from 'react';
import {
  Archive,
  Search,
  Eye,
  Trash2,
  Edit,
  CheckCircle2,
  Calendar,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  RotateCcw,
  Package,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  ReturnRecord,
  DeductionRecord,
  ConfirmRequestOptions,
  PaymentType,
} from '../types';
import {
  formatVND,
  formatDateDMY,
  extractBillTableName,
  getBillPaymentBreakdown,
  isOwnerUseBill,
  getCurrentBusinessDate,
  getYesterdayBusinessDate,
} from '../utils/parser';

interface ArchiveManagerTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  products: ProductRecord[];
  returns: ReturnRecord[];
  deductions: DeductionRecord[];
  canWrite: boolean;
  canDelete: boolean;
  onInspectBill: (bill: BillRecord) => void;
  onEditBill: (bill: BillRecord) => void;
  onToggleArchiveBill: (bill: BillRecord) => Promise<void> | void;
  onDeleteBill: (bill: BillRecord) => void;
  onDeleteMultipleBills?: (bills: BillRecord[]) => Promise<void>;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
  hideMoney: boolean;
  formatVND: (n: number) => string;
}

export const ArchiveManagerTab: React.FC<ArchiveManagerTabProps> = ({
  bills,
  billItems,
  products,
  returns,
  deductions,
  canWrite,
  canDelete,
  onInspectBill,
  onEditBill,
  onToggleArchiveBill,
  onDeleteBill,
  onDeleteMultipleBills,
  requestConfirm,
  hideMoney,
  formatVND,
}) => {
  const todayStr = getCurrentBusinessDate();
  const yesterdayStr = getYesterdayBusinessDate();

  // Filter ONLY archived bills
  const archivedBills = useMemo(() => {
    return bills.filter((b) => Boolean(b.isArchived));
  }, [bills]);

  // Search, date filter & payment filter state
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [customStart, setCustomStart] = useState<string>('2026-08-01');
  const [customEnd, setCustomEnd] = useState<string>(todayStr);
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filtered bills
  const filteredBills = useMemo(() => {
    return archivedBills
      .filter((b) => {
        const d = String(b.billDate || '');
        if (dateFilter === 'today') return d === todayStr;
        if (dateFilter === 'yesterday') return d === yesterdayStr;
        if (dateFilter === 'week') {
          const target = new Date(d + 'T00:00:00').getTime();
          const now = new Date(todayStr + 'T00:00:00').getTime();
          const diffDays = (now - target) / 86400000;
          return diffDays >= -1 && diffDays <= 7;
        }
        if (dateFilter === 'month') return d.slice(0, 7) === todayStr.slice(0, 7);
        if (dateFilter === 'custom') {
          const start = customStart || '2000-01-01';
          const end = customEnd || '2099-12-31';
          return d >= start && d <= end;
        }
        return true;
      })
      .filter((b) => {
        if (paymentFilter === 'all') return true;
        if (paymentFilter === 'cash') return b.paymentType === 'cash';
        if (paymentFilter === 'transfer') return b.paymentType === 'transfer';
        if (paymentFilter === 'split') return b.paymentType === 'split';
        if (paymentFilter === 'debt') return b.paymentType === 'debt';
        if (paymentFilter === 'owner_use') return isOwnerUseBill(b);
        return true;
      })
      .filter((b) => {
        if (!searchKeyword.trim()) return true;
        const q = searchKeyword.toLowerCase();
        return (
          String(b.billCode || '').toLowerCase().includes(q) ||
          String(b.billDate || '').includes(q) ||
          String(b.debtorName || '').toLowerCase().includes(q) ||
          String(b.itemsSummary || '').toLowerCase().includes(q) ||
          String(b.note || '').toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          String(b.billDate || '').localeCompare(String(a.billDate || '')) ||
          (b.createdAtMs || 0) - (a.createdAtMs || 0)
      );
  }, [archivedBills, dateFilter, customStart, customEnd, paymentFilter, searchKeyword, todayStr, yesterdayStr]);

  // Pagination (10 bills per page)
  const BILLS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState<number>(1);
  const totalPages = Math.max(1, Math.ceil(filteredBills.length / BILLS_PER_PAGE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedBills = useMemo(() => {
    const start = (safePage - 1) * BILLS_PER_PAGE;
    return filteredBills.slice(start, start + BILLS_PER_PAGE);
  }, [filteredBills, safePage]);

  // Aggregate stats
  const totalGrossAmount = useMemo(() => {
    return filteredBills.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
  }, [filteredBills]);

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllPage = () => {
    const pageIds = paginatedBills.map((b) => b.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Bulk Unarchive
  const handleBulkUnarchive = async () => {
    const billsToUnarchive = filteredBills.filter((b) => selectedIds.has(b.id));
    if (billsToUnarchive.length === 0) return;

    requestConfirm({
      title: 'Xác nhận Bỏ Lưu Trữ Hóa Đơn',
      message: `Bạn có chắc chắn muốn bỏ lưu trữ ${billsToUnarchive.length} hóa đơn đã chọn và khôi phục về bảng Tổng quan & Doanh thu không? (Số liệu doanh thu & công nợ sẽ được tính trở lại bình thường)`,
      confirmLabel: `Khôi phục ${billsToUnarchive.length} hóa đơn`,
      variant: 'primary',
      onConfirm: async () => {
        for (const bill of billsToUnarchive) {
          await onToggleArchiveBill(bill);
        }
        setSelectedIds(new Set());
      },
    });
  };

  // Bulk Delete
  const handleBulkDelete = () => {
    if (!canDelete || !onDeleteMultipleBills) return;
    const billsToDelete = filteredBills.filter((b) => selectedIds.has(b.id));
    if (billsToDelete.length === 0) return;

    requestConfirm({
      title: 'Xác nhận Xóa Hóa Đơn Lưu Trữ',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn ${billsToDelete.length} hóa đơn lưu trữ này khỏi hệ thống không? Thao tác này không thể hoàn tác.`,
      confirmLabel: `Xóa vĩnh viễn ${billsToDelete.length} hóa đơn`,
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteMultipleBills(billsToDelete);
        setSelectedIds(new Set());
      },
    });
  };

  const isAllPageSelected =
    paginatedBills.length > 0 && paginatedBills.every((b) => selectedIds.has(b.id));

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl border border-amber-300/80 dark:border-amber-800/80 bg-gradient-to-r from-amber-50 via-amber-100/50 to-orange-50 dark:from-amber-950/40 dark:via-amber-900/20 dark:to-orange-950/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Kho Bill Lưu Trữ (Ghi Nhớ)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                {archivedBills.length} bill
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 max-w-2xl">
              Các hóa đơn lưu trữ tại đây <strong>không tính vào doanh thu</strong>, <strong>không tính công nợ</strong> và <strong>không tính số lượng món bán ra</strong>. Bấm nút <strong>"Bỏ lưu trữ"</strong> để khôi phục hóa đơn về lại bảng Tổng quan & Doanh thu bất cứ lúc nào.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 bg-white/80 dark:bg-slate-900/80 px-3.5 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 shrink-0">
          <div>
            <div className="text-[10px] text-slate-400 font-medium">Tổng giá trị ghi nhớ</div>
            <div className="text-sm sm:text-base font-bold font-mono text-amber-700 dark:text-amber-300">
              {formatVND(totalGrossAmount)}
            </div>
          </div>
          <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
          <div>
            <div className="text-[10px] text-slate-400 font-medium">Ảnh hưởng doanh thu</div>
            <div className="text-sm sm:text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
              0 ₫ (Đã loại trừ)
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Search box */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm mã bill, số bàn, khách nợ, món ăn..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Quick Date & Payment Selects */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">Toàn bộ thời gian</option>
              <option value="today">Hôm nay ({todayStr})</option>
              <option value="yesterday">Hôm qua ({yesterdayStr})</option>
              <option value="week">7 ngày gần nhất</option>
              <option value="month">Tháng này</option>
              <option value="custom">Khoảng ngày tùy chọn</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">Mọi hình thức</option>
              <option value="cash">Tiền mặt</option>
              <option value="transfer">Chuyển khoản</option>
              <option value="split">Tiền mặt + Chuyển khoản</option>
              <option value="debt">Công nợ</option>
              <option value="owner_use">Chủ / QL dùng</option>
            </select>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1 font-mono text-[11px]">
                  {safePage}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Custom date range inputs */}
        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 font-medium">Từ ngày:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
            <span className="text-slate-500 font-medium">Đến ngày:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
        )}

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
              <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Đang chọn {selectedIds.size} hóa đơn lưu trữ</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBulkUnarchive}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục / Bỏ lưu trữ ({selectedIds.size})</span>
              </button>
              {canDelete && onDeleteMultipleBills && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa ({selectedIds.size})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Table or Empty state */}
      {filteredBills.length === 0 ? (
        <div className="p-8 sm:p-12 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 mx-auto flex items-center justify-center">
            <Archive className="w-7 h-7" />
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-white">
            {archivedBills.length === 0
              ? 'Hiện chưa có hóa đơn nào trong Kho Lưu Trữ'
              : 'Không tìm thấy hóa đơn lưu trữ phù hợp với bộ lọc'}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {archivedBills.length === 0
              ? 'Tại bảng Tổng quan & Doanh thu hoặc khi tạo bill mới, bạn có thể bấm "Lưu trữ" để đưa hóa đơn vào đây nhằm ghi nhớ dữ liệu mà không làm thay đổi doanh thu hay công nợ.'
              : 'Thử đổi từ khóa tìm kiếm hoặc chọn lại khoảng ngày lọc để xem các bill lưu trữ.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs overflow-x-auto">
            <table className="w-full min-w-[850px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/20 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllPageSelected}
                      onChange={handleToggleSelectAllPage}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      title="Chọn / Bỏ chọn toàn bộ trang này"
                    />
                  </th>
                  <th className="py-3 px-3">Mã Bill / Ngày</th>
                  <th className="py-3 px-3">Hình thức & Khách</th>
                  <th className="py-3 px-3">Chi tiết món ăn</th>
                  <th className="py-3 px-3 text-right">Tổng gốc</th>
                  <th className="py-3 px-3 text-right">Khoản trừ</th>
                  <th className="py-3 px-3 text-right">Giá trị lưu trữ</th>
                  <th className="py-3 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedBills.map((bill) => {
                  const isSelected = selectedIds.has(bill.id);
                  const isSplit = bill.paymentType === 'split';
                  const isDebt = bill.paymentType === 'debt';
                  const isOwner = isOwnerUseBill(bill);
                  const bd = getBillPaymentBreakdown(bill);

                  const origSubtotal =
                    bill.subtotalAmount && bill.subtotalAmount > 0
                      ? bill.subtotalAmount
                      : bill.totalAmount + (bill.discountAmount || 0);
                  const billDiscount = Math.max(0, Number(bill.discountAmount) || 0);
                  const billReturnDed = Math.max(0, Number(bill.deductedAmount) || 0);
                  const totalDed = billDiscount + billReturnDed;

                  return (
                    <tr
                      key={bill.id}
                      onClick={() => onInspectBill(bill)}
                      className={`hover:bg-amber-50/40 dark:hover:bg-amber-950/20 cursor-pointer transition-colors border-l-4 border-l-amber-500 ${
                        isSelected ? 'bg-amber-50/80 dark:bg-amber-950/40' : ''
                      }`}
                    >
                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(bill.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(bill.id)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-3 font-mono">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {bill.billCode}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Ca ngày: {bill.billDate}
                        </div>
                        {(bill.checkInTime || bill.checkOutTime) && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400">
                            {bill.checkInTime || '--:--'} → {bill.checkOutTime || '--:--'}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                            📦 Lưu trữ
                          </span>
                          {isSplit ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300">
                              <span>Tiền mặt + CK</span>
                            </span>
                          ) : isDebt ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300">
                              <span>Công nợ</span>
                            </span>
                          ) : isOwner ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300">
                              <span>Chủ/QL</span>
                            </span>
                          ) : bill.paymentType === 'transfer' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-300">
                              <span>Chuyển khoản</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300">
                              <span>Tiền mặt</span>
                            </span>
                          )}
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                            {extractBillTableName(bill, 'Bàn lẻ')}
                          </span>
                        </div>
                        {bill.debtorName && (
                          <div className="text-[11px] text-amber-800 dark:text-amber-300">
                            Khách: <strong>{bill.debtorName}</strong>
                          </div>
                        )}
                        {bill.note && (
                          <div className="text-[11px] text-slate-500 italic truncate max-w-[200px]">
                            {bill.note}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 max-w-[280px]">
                        <div
                          className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2"
                          title={bill.itemsSummary}
                        >
                          {bill.itemsSummary || '—'}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        {formatVND(origSubtotal)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                        {totalDed > 0 ? `-${formatVND(totalDed)}` : '0 ₫'}
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <div className="font-bold tabular-nums text-sm text-amber-600 dark:text-amber-400">
                          {formatVND(bill.totalAmount)}
                        </div>
                        <div className="text-[10px] font-sans font-bold text-amber-600 dark:text-amber-400">
                          (0đ vào DT)
                        </div>
                      </td>

                      <td
                        className="py-3 px-3 text-right whitespace-nowrap space-x-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onInspectBill(bill)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 cursor-pointer align-middle"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Xem Bill</span>
                        </button>

                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => onToggleArchiveBill(bill)}
                            className="px-2.5 py-1 rounded-lg border border-emerald-400 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer align-middle shadow-2xs"
                            title="Bỏ lưu trữ và khôi phục hóa đơn về Tổng quan & Doanh thu"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Bỏ lưu trữ</span>
                          </button>
                        )}

                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => onEditBill(bill)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer align-middle"
                          >
                            Sửa Bill
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeleteBill(bill)}
                            className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-[11px] font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer align-middle"
                            title="Xóa Bill"
                          >
                            <Trash2 className="w-3 h-3" />
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

          {/* Mobile Cards View (< md) */}
          <div className="md:hidden space-y-2.5">
            {paginatedBills.map((bill) => {
              const isSelected = selectedIds.has(bill.id);
              const isSplit = bill.paymentType === 'split';
              const isDebt = bill.paymentType === 'debt';
              const isOwner = isOwnerUseBill(bill);

              return (
                <div
                  key={bill.id}
                  onClick={() => onInspectBill(bill)}
                  className={`p-3.5 rounded-2xl border border-amber-300/80 dark:border-amber-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 cursor-pointer border-l-4 border-l-amber-500 ${
                    isSelected ? 'bg-amber-50/70 dark:bg-amber-950/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(bill.id);
                        }}
                        className="pt-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(bill.id)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{bill.billCode}</span>
                          <span className="text-[11px] text-slate-500 font-normal">
                            · {bill.billDate}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                            📦 Lưu trữ
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                            {extractBillTableName(bill, 'Bàn lẻ')}
                          </span>
                        </div>
                        {bill.debtorName && (
                          <div className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                            Khách: {bill.debtorName}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                        {formatVND(bill.totalAmount)}
                      </div>
                      <div className="text-[10px] font-sans font-bold text-amber-600 dark:text-amber-400">
                        (0đ vào DT)
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {bill.itemsSummary}
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onInspectBill(bill)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem Bill</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => onToggleArchiveBill(bill)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="Bỏ lưu trữ và khôi phục về Tổng quan & Doanh thu"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Bỏ lưu trữ</span>
                        </button>
                      )}

                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => onEditBill(bill)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Sửa
                        </button>
                      )}

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => onDeleteBill(bill)}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
