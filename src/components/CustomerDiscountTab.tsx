import React, { useState, useMemo } from 'react';
import {
  Percent,
  Search,
  Calendar,
  Eye,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  ShoppingBag,
  Receipt,
  UtensilsCrossed,
  Sparkles,
  Info,
  DollarSign,
  Tag,
  Filter,
  CheckCircle2,
  Package,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  PeriodPreset,
} from '../types';
import {
  formatVND,
  formatDateDMY,
  getCurrentBusinessDate,
  getYesterdayBusinessDate,
  shiftDateByDays,
  reconstructBillItemsFromSummary,
  extractReceiptOriginalPrice,
  extractBillTableName,
} from '../utils/parser';

interface CustomerDiscountTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  products: ProductRecord[];
  categories: string[];
  canWrite?: boolean;
  onInspectBill: (bill: BillRecord) => void;
  onEditBill?: (bill: BillRecord) => void;
  hideMoney?: boolean;
  formatVND: (n: number) => string;
}

export interface DiscountedItemRow {
  rowId: string;
  billId: string;
  billCode: string;
  billDate: string;
  checkInTime?: string;
  tableName: string;
  paymentType: string;
  isArchived: boolean;
  productName: string;
  note?: string;
  category: string;
  quantity: number;
  originalUnitPrice: number;
  unitPrice: number;
  unitDiscountAmount: number;
  discountPercent: number;
  totalDiscountAmount: number;
  totalSoldAmount: number;
  totalOriginalAmount: number;
  billRef: BillRecord;
}

export const CustomerDiscountTab: React.FC<CustomerDiscountTabProps> = ({
  bills,
  billItems,
  products,
  categories,
  canWrite = true,
  onInspectBill,
  onEditBill,
  hideMoney = false,
  formatVND,
}) => {
  const todayStr = getCurrentBusinessDate();
  const yesterdayStr = getYesterdayBusinessDate();

  // Filters
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [unitDisplayMode, setUnitDisplayMode] = useState<'both' | 'percent' | 'amount'>('both');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 15;

  // Extract all discounted items from all bills
  const allDiscountedItems = useMemo<DiscountedItemRow[]>(() => {
    const rows: DiscountedItemRow[] = [];

    // Map bill items by billId for quick lookup
    const itemsByBillId = new Map<string, BillItemRecord[]>();
    for (const bi of billItems) {
      const arr = itemsByBillId.get(bi.billId) || [];
      arr.push(bi);
      itemsByBillId.set(bi.billId, arr);
    }

    for (const bill of bills) {
      const candidateItems =
        itemsByBillId.get(bill.id) && itemsByBillId.get(bill.id)!.length > 0
          ? itemsByBillId.get(bill.id)!
          : reconstructBillItemsFromSummary(bill, products);

      const tableName = extractBillTableName(bill);

      for (let idx = 0; idx < candidateItems.length; idx++) {
        const it = candidateItems[idx];
        const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
        const sellPrice = Math.max(0, Math.round(Number(it.unitPrice) || 0));

        let origPrice = 0;
        if (it.originalUnitPrice && it.originalUnitPrice > sellPrice) {
          origPrice = Math.round(it.originalUnitPrice);
        } else {
          const extractedOrig = extractReceiptOriginalPrice(it);
          if (extractedOrig && extractedOrig > sellPrice) {
            origPrice = Math.round(extractedOrig);
          }
        }

        // Check if there is a detected discount
        let unitDiscount = 0;
        let discountPct = 0;

        if (origPrice > sellPrice && sellPrice > 0) {
          unitDiscount = origPrice - sellPrice;
          discountPct =
            it.discountPercent && it.discountPercent > 0
              ? it.discountPercent
              : Number(((unitDiscount / origPrice) * 100).toFixed(2));
        } else if (it.discountAmount && it.discountAmount > 0) {
          unitDiscount = Math.round(it.discountAmount);
          origPrice = sellPrice + unitDiscount;
          discountPct =
            it.discountPercent && it.discountPercent > 0
              ? it.discountPercent
              : Number(((unitDiscount / origPrice) * 100).toFixed(2));
        }

        // Only include if there is an actual discount for this dish!
        if (unitDiscount > 0 && origPrice > sellPrice) {
          const totalDiscount = unitDiscount * qty;
          const totalSold = sellPrice * qty;
          const totalOriginal = origPrice * qty;

          rows.push({
            rowId: `${bill.id}_disc_${idx}_${it.id || idx}`,
            billId: bill.id,
            billCode: bill.billCode || 'HD-001',
            billDate: bill.billDate,
            checkInTime: bill.checkInTime,
            tableName,
            paymentType: bill.paymentType,
            isArchived: Boolean(bill.isArchived),
            productName: it.productName,
            note: it.note || '',
            category: it.category || 'Món ăn',
            quantity: qty,
            originalUnitPrice: origPrice,
            unitPrice: sellPrice,
            unitDiscountAmount: unitDiscount,
            discountPercent: discountPct,
            totalDiscountAmount: totalDiscount,
            totalSoldAmount: totalSold,
            totalOriginalAmount: totalOriginal,
            billRef: bill,
          });
        }
      }
    }

    return rows;
  }, [bills, billItems, products]);

  // Filter rows based on selected time period, search keyword, category, and archived toggle
  const filteredRows = useMemo(() => {
    return allDiscountedItems.filter((row) => {
      // 1. Archive filter
      if (!includeArchived && row.isArchived) {
        return false;
      }

      // 2. Date filter
      const d = row.billDate;
      if (periodPreset === 'today') {
        if (d !== todayStr) return false;
      } else if (periodPreset === 'yesterday') {
        if (d !== yesterdayStr) return false;
      } else if (periodPreset === 'week') {
        const target = new Date(d + 'T00:00:00').getTime();
        const now = new Date(todayStr + 'T00:00:00').getTime();
        const diffDays = (now - target) / 86400000;
        if (diffDays < -1 || diffDays > 7) return false;
      } else if (periodPreset === 'month') {
        const mTarget = d.slice(0, 7);
        const mNow = todayStr.slice(0, 7);
        if (mTarget !== mNow) return false;
      } else if (periodPreset === 'custom') {
        if (customStartDate && d < customStartDate) return false;
        if (customEndDate && d > customEndDate) return false;
      }

      // 3. Category filter
      if (categoryFilter !== 'all' && row.category !== categoryFilter) {
        return false;
      }

      // 4. Search keyword filter
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase().trim();
        const match =
          row.productName.toLowerCase().includes(q) ||
          (row.note && row.note.toLowerCase().includes(q)) ||
          row.tableName.toLowerCase().includes(q) ||
          row.billCode.toLowerCase().includes(q) ||
          row.category.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [
    allDiscountedItems,
    periodPreset,
    customStartDate,
    customEndDate,
    todayStr,
    yesterdayStr,
    categoryFilter,
    searchKeyword,
    includeArchived,
  ]);

  // KPI Calculations
  const stats = useMemo(() => {
    let totalDiscount = 0;
    let totalSold = 0;
    let totalOriginal = 0;
    let totalItemsCount = 0;
    const uniqueBillIds = new Set<string>();

    for (const r of filteredRows) {
      totalDiscount += r.totalDiscountAmount;
      totalSold += r.totalSoldAmount;
      totalOriginal += r.totalOriginalAmount;
      totalItemsCount += r.quantity;
      uniqueBillIds.add(r.billId);
    }

    const avgDiscountPercent =
      totalOriginal > 0 ? Number(((totalDiscount / totalOriginal) * 100).toFixed(2)) : 0;

    return {
      totalDiscount,
      totalSold,
      totalOriginal,
      totalItemsCount,
      uniqueBillsCount: uniqueBillIds.size,
      avgDiscountPercent,
    };
  }, [filteredRows]);

  // Top discounted dishes ranking
  const topDiscountedDishes = useMemo(() => {
    const dishMap = new Map<
      string,
      {
        productName: string;
        category: string;
        quantity: number;
        totalDiscount: number;
        totalSold: number;
        avgPercent: number;
      }
    >();

    for (const r of filteredRows) {
      const key = r.productName.toLowerCase().trim();
      const existing = dishMap.get(key);
      if (existing) {
        existing.quantity += r.quantity;
        existing.totalDiscount += r.totalDiscountAmount;
        existing.totalSold += r.totalSoldAmount;
      } else {
        dishMap.set(key, {
          productName: r.productName,
          category: r.category,
          quantity: r.quantity,
          totalDiscount: r.totalDiscountAmount,
          totalSold: r.totalSoldAmount,
          avgPercent: r.discountPercent,
        });
      }
    }

    return Array.from(dishMap.values())
      .sort((a, b) => b.totalDiscount - a.totalDiscount)
      .slice(0, 5);
  }, [filteredRows]);

  // Pagination slicing
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, safeCurrentPage]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredRows.length === 0) return;
    const headers = [
      'STT',
      'Ngày',
      'Giờ',
      'Bàn / Phòng',
      'Mã Bill',
      'Tên món ăn',
      'Ghi chú món',
      'Danh mục',
      'Số lượng',
      'Giá niêm yết (₫)',
      'Mức giảm (%)',
      'Tiền giảm mỗi món (₫)',
      'Đơn giá bán (₫)',
      'Tổng tiền giảm (₫)',
      'Tổng thực thu (₫)',
    ];

    const csvLines = [headers.join(',')];
    filteredRows.forEach((r, idx) => {
      csvLines.push(
        [
          idx + 1,
          `"${r.billDate}"`,
          `"${r.checkInTime || ''}"`,
          `"${r.tableName.replace(/"/g, '""')}"`,
          `"${r.billCode}"`,
          `"${r.productName.replace(/"/g, '""')}"`,
          `"${(r.note || '').replace(/"/g, '""')}"`,
          `"${r.category}"`,
          r.quantity,
          r.originalUnitPrice,
          `"${r.discountPercent}%"`,
          r.unitDiscountAmount,
          r.unitPrice,
          r.totalDiscountAmount,
          r.totalSoldAmount,
        ].join(',')
      );
    });

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `giam_gia_mon_an_${periodPreset}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Percent className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Giảm Giá Món Ăn Cho Khách
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                Tab Độc Lập
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Thống kê tất cả các khoản chiết khấu, giảm giá món ăn & đồ uống trực tiếp cho khách hàng ghé quán theo ngày, tuần, tháng hoặc kỳ lọc.
              <strong className="text-emerald-700 dark:text-emerald-300 font-semibold ml-1">
                Tiền giảm giá hoàn toàn KHÔNG tính vào Khoản trừ
              </strong>{' '}
              để đảm bảo sổ quỹ thu chi và chi phí vận hành minh bạch.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredRows.length === 0}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
            title="Xuất file CSV / Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={filteredRows.length === 0}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
            title="In báo cáo giảm giá"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>In</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Tổng tiền giảm */}
        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-medium">
            <span>Tổng tiền đã giảm cho khách</span>
            <Tag className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {hideMoney ? '••••••' : `-${formatVND(stats.totalDiscount)}`}
          </div>
          <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80">
            Trung bình giảm <strong>{stats.avgDiscountPercent}%</strong> / giá niêm yết
          </div>
        </div>

        {/* Card 2: Số món được giảm */}
        <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <span>Số món & Bill áp dụng</span>
            <UtensilsCrossed className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
            {stats.totalItemsCount} <span className="text-xs font-normal">phần món</span>
          </div>
          <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
            Nằm trong <strong>{stats.uniqueBillsCount}</strong> hóa đơn ăn uống
          </div>
        </div>

        {/* Card 3: Doanh thu thực thu từ món giảm */}
        <div className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-400 font-medium">
            <span>Doanh thu thực thu từ món giảm</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {hideMoney ? '••••••' : formatVND(stats.totalSold)}
          </div>
          <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
            Khách thực tế đã thanh toán sau giảm
          </div>
        </div>

        {/* Card 4: Tổng giá trị niêm yết */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Tổng giá trị niêm yết (Gốc)</span>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {hideMoney ? '••••••' : formatVND(stats.totalOriginal)}
          </div>
          <div className="text-[11px] text-slate-500">
            Giá bán tiêu chuẩn theo Menu
          </div>
        </div>
      </div>

      {/* Filter & Controls Panel */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-xs">
        {/* Row 1: Period Presets & Date Navigation */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 shrink-0">
              Kỳ thống kê:
            </span>
            {(
              [
                { id: 'today', label: 'Hôm nay' },
                { id: 'yesterday', label: 'Hôm qua' },
                { id: 'week', label: 'Theo Tuần' },
                { id: 'month', label: 'Theo Tháng' },
                { id: 'all', label: 'Tất cả' },
                { id: 'custom', label: 'Chọn kỳ ngày' },
              ] as { id: PeriodPreset; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPeriodPreset(p.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  periodPreset === p.id
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Stepper with Single Day Shift */}
          <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Ngày xem:
            </span>
            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  const currentSelected =
                    periodPreset === 'today'
                      ? todayStr
                      : periodPreset === 'yesterday'
                      ? yesterdayStr
                      : customStartDate;
                  const prev = shiftDateByDays(currentSelected, -1);
                  setCustomStartDate(prev);
                  setCustomEndDate(prev);
                  if (prev === todayStr) {
                    setPeriodPreset('today');
                  } else if (prev === yesterdayStr) {
                    setPeriodPreset('yesterday');
                  } else {
                    setPeriodPreset('custom');
                  }
                  setCurrentPage(1);
                }}
                className="px-2 py-0.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-mono font-bold cursor-pointer transition-colors"
                title="Lùi 1 ngày"
              >
                ←
              </button>
              <input
                type="date"
                value={
                  periodPreset === 'today'
                    ? todayStr
                    : periodPreset === 'yesterday'
                    ? yesterdayStr
                    : customStartDate
                }
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomStartDate(e.target.value);
                    setCustomEndDate(e.target.value);
                    if (e.target.value === todayStr) {
                      setPeriodPreset('today');
                    } else if (e.target.value === yesterdayStr) {
                      setPeriodPreset('yesterday');
                    } else {
                      setPeriodPreset('custom');
                    }
                    setCurrentPage(1);
                  }
                }}
                className="px-2 py-0.5 text-xs font-mono font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  const currentSelected =
                    periodPreset === 'today'
                      ? todayStr
                      : periodPreset === 'yesterday'
                      ? yesterdayStr
                      : customStartDate;
                  const next = shiftDateByDays(currentSelected, 1);
                  setCustomStartDate(next);
                  setCustomEndDate(next);
                  if (next === todayStr) {
                    setPeriodPreset('today');
                  } else if (next === yesterdayStr) {
                    setPeriodPreset('yesterday');
                  } else {
                    setPeriodPreset('custom');
                  }
                  setCurrentPage(1);
                }}
                className="px-2 py-0.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-mono font-bold cursor-pointer transition-colors"
                title="Tiến 1 ngày"
              >
                →
              </button>
            </div>

            {periodPreset === 'custom' && (
              <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span>đến</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Search, Category Filter, Unit Mode Switch & Archive Toggle */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm món giảm giá, bàn, mã bill..."
                className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">Mọi nhóm danh mục</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Switch Mode: %, ₫ or Both */}
            <div className="inline-flex items-center p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setUnitDisplayMode('both')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  unitDisplayMode === 'both'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Hiển thị cả mức % và số tiền ₫"
              >
                Cả % & ₫
              </button>
              <button
                type="button"
                onClick={() => setUnitDisplayMode('percent')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  unitDisplayMode === 'percent'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Hiển thị theo tỷ lệ %"
              >
                Chỉ %
              </button>
              <button
                type="button"
                onClick={() => setUnitDisplayMode('amount')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  unitDisplayMode === 'amount'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Hiển thị theo số tiền ₫ trực tiếp"
              >
                Chỉ ₫
              </button>
            </div>

            {/* Include Archived Bills Checkbox */}
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => {
                  setIncludeArchived(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <Package className="w-3.5 h-3.5 text-amber-500" />
              <span>Gồm Bill lưu trữ</span>
            </label>
          </div>
        </div>
      </div>

      {/* Top 5 Most Discounted Dishes Strip */}
      {topDiscountedDishes.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Top món được giảm giá nhiều nhất trong kỳ lọc</span>
            </span>
            <span className="text-[11px] font-normal text-amber-700 dark:text-amber-300">
              {topDiscountedDishes.length} món tiêu biểu
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {topDiscountedDishes.map((dish, i) => (
              <div
                key={dish.productName}
                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/40 text-xs space-y-1 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                    #{i + 1}
                  </span>
                  <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 font-mono">
                    -{dish.avgPercent}%
                  </span>
                </div>
                <div className="font-semibold text-slate-900 dark:text-white truncate" title={dish.productName}>
                  {dish.productName}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-0.5">
                  <span>{dish.quantity} phần</span>
                  <strong className="text-rose-600 dark:text-rose-400">
                    -{formatVND(dish.totalDiscount)}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Table: Granular Discount Rows */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Chi Tiết Danh Sách Món Giảm Giá
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-md font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {filteredRows.length} dòng món
            </span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono font-semibold">
                {safeCurrentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {filteredRows.length === 0 ? (
          <div className="py-16 px-4 text-center text-xs text-slate-500 space-y-2">
            <Percent className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Không có món ăn nào được giảm giá trong kỳ lọc này.
            </p>
            <p className="text-slate-400 max-w-sm mx-auto">
              Khi quét hóa đơn hoặc nhập bill có món chiết khấu (như Chíp hấp sả giảm 10.07%, Cá lị um chuối giảm 10.05%), hệ thống sẽ tự động tổng hợp chi tiết vào tab này.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-12 text-center">STT</th>
                    <th className="py-2.5 px-3 w-28">Ngày giờ</th>
                    <th className="py-2.5 px-3 w-32">Bàn / Hóa đơn</th>
                    <th className="py-2.5 px-3">Tên món & Ghi chú</th>
                    <th className="py-2.5 px-2 w-24">Danh mục</th>
                    <th className="py-2.5 px-2 w-14 text-center">SL</th>
                    <th className="py-2.5 px-3 w-28 text-right">Giá gốc (Niêm yết)</th>
                    <th className="py-2.5 px-3 w-32 text-center">Mức giảm giá</th>
                    <th className="py-2.5 px-3 w-28 text-right">Đơn giá thực bán</th>
                    <th className="py-2.5 px-3 w-32 text-right">Tổng tiền giảm</th>
                    <th className="py-2.5 px-3 w-28 text-right">Tổng thực thu</th>
                    <th className="py-2.5 px-2 w-20 text-center">Tác vụ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {paginatedRows.map((row, idx) => {
                    const rowNumber = (safeCurrentPage - 1) * ITEMS_PER_PAGE + idx + 1;

                    return (
                      <tr
                        key={row.rowId}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">
                          {rowNumber}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {formatDateDMY(row.billDate)}
                          </div>
                          {row.checkInTime && (
                            <div className="text-slate-400">{row.checkInTime}</div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-emerald-700 dark:text-emerald-300">
                            {row.tableName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            #{row.billCode}
                            {row.isArchived && (
                              <span className="ml-1 text-amber-600 font-bold">[Lưu trữ]</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {row.productName}
                          </div>
                          {row.note && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-300">
                              {row.note}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-slate-500 text-[11px]">
                          {row.category}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold">
                          {row.quantity}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500 line-through">
                          {formatVND(row.originalUnitPrice)}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold text-xs">
                            {unitDisplayMode === 'percent' ? (
                              <span>-{row.discountPercent}%</span>
                            ) : unitDisplayMode === 'amount' ? (
                              <span>-{formatVND(row.unitDiscountAmount)}</span>
                            ) : (
                              <span>
                                -{row.discountPercent}% ({formatVND(row.unitDiscountAmount)})
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">
                          {formatVND(row.unitPrice)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          -{formatVND(row.totalDiscountAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {formatVND(row.totalSoldAmount)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => onInspectBill(row.billRef)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer transition-colors"
                            title="Xem chi tiết hóa đơn này"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {paginatedRows.map((row, idx) => (
                <div key={row.rowId} className="p-3.5 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">
                        {row.productName}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          {row.tableName}
                        </span>
                        <span>·</span>
                        <span className="font-mono">#{row.billCode}</span>
                        <span>·</span>
                        <span className="font-mono">{formatDateDMY(row.billDate)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onInspectBill(row.billRef)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-emerald-600 flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Bill</span>
                    </button>
                  </div>

                  {row.note && (
                    <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300">
                      {row.note}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
                    <div>
                      <span className="text-[11px] text-slate-400 block font-sans">
                        SL & Giá gốc:
                      </span>
                      <span>
                        {row.quantity} phần × <span className="line-through">{formatVND(row.originalUnitPrice)}</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block font-sans">
                        Đơn giá thực bán:
                      </span>
                      <strong className="text-emerald-700 dark:text-emerald-300">
                        {formatVND(row.unitPrice)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800 font-mono text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[11px]">
                      Giảm {row.discountPercent}% (-{formatVND(row.totalDiscountAmount)})
                    </span>
                    <span className="text-slate-900 dark:text-white font-bold">
                      Thu: {formatVND(row.totalSoldAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Pagination & Summary Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="font-mono text-slate-500">
                Tổng cộng:{' '}
                <strong className="text-rose-600 dark:text-rose-400 font-bold">
                  -{formatVND(stats.totalDiscount)}
                </strong>{' '}
                đã giảm cho <strong>{stats.totalItemsCount}</strong> phần món ({stats.uniqueBillsCount} hóa đơn)
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Trước
                  </button>
                  <span className="px-2 font-mono font-bold">
                    Trang {safeCurrentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Sau
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
