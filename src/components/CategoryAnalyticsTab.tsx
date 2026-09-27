import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Layers,
  BarChart3,
  Trash2,
  FolderPlus,
  Edit3,
  X,
  Filter,
  ChevronsDownUp,
  ChevronsUpDown,
  Shield,
} from 'lucide-react';
import {
  BillItemRecord,
  ProductRecord,
  ConfirmRequestOptions,
} from '../types';
import { formatVND, formatNumber } from '../utils/parser';

interface CategoryAnalyticsTabProps {
  billItems: BillItemRecord[];
  products: ProductRecord[];
  categories: string[];
  periodLabel: string;
  periodType?: 'day' | 'yesterday' | 'week' | 'month' | 'all';
  selectedDate?: string;
  todayBusinessStr?: string;
  yesterdayBusinessStr?: string;
  onChangePeriod?: (
    type: 'day' | 'yesterday' | 'week' | 'month' | 'all',
    customDate?: string
  ) => void;
  canWrite: boolean;
  isCategoryRestricted?: boolean;
  totalSystemCategoriesCount?: number;
  roleLabel?: string;
  onAddCategory: (categoryName: string) => Promise<void>;
  onRenameCategory: (oldName: string, newName: string) => Promise<void>;
  onDeleteCategory: (categoryName: string) => Promise<void>;
  onDeleteAllMenuProducts: () => void;
  onDeleteCategoryMenuProducts: (category: string) => void;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

interface ProductAgg {
  productName: string;
  category: string;
  unitPrice: number;
  soldQty: number;
  returnedQty: number;
  netQty: number;
  grossRevenue: number;
  netRevenue: number;
}

interface CategoryAgg {
  category: string;
  soldQty: number;
  returnedQty: number;
  netQty: number;
  grossRevenue: number;
  netRevenue: number;
  products: ProductAgg[];
}

export const CategoryAnalyticsTab: React.FC<CategoryAnalyticsTabProps> = ({
  billItems,
  products,
  categories,
  periodLabel,
  periodType = 'day',
  selectedDate,
  todayBusinessStr,
  yesterdayBusinessStr,
  onChangePeriod,
  canWrite,
  isCategoryRestricted = false,
  totalSystemCategoriesCount,
  roleLabel,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onDeleteAllMenuProducts,
  onDeleteCategoryMenuProducts,
  requestConfirm,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(
    categories[0] || 'Bia'
  );
  const [metricMode, setMetricMode] = useState<'quantity' | 'revenue'>('quantity');

  const [newCatInput, setNewCatInput] = useState('');
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Dropdown & Accordion states for mobile-optimized category drilldown
  const [summaryExpandedCats, setSummaryExpandedCats] = useState<Record<string, boolean>>({});
  const [matrixFilterCategory, setMatrixFilterCategory] = useState<string>('all');
  const [matrixExpandedCats, setMatrixExpandedCats] = useState<Record<string, boolean>>({});

  const toggleSummaryCat = (catName: string) => {
    setSelectedCategory(catName);
    setSummaryExpandedCats((prev) => ({
      ...prev,
      [catName]: !(prev[catName] ?? catName === selectedCategory),
    }));
  };

  const isMatrixCatOpen = (catName: string, hasSales: boolean, idx: number) => {
    if (matrixFilterCategory !== 'all') return true;
    if (catName in matrixExpandedCats) return matrixExpandedCats[catName];
    // Default: open active category or first category with sales
    return catName === activeCategoryData.category || (hasSales && idx < 2);
  };

  const toggleMatrixCat = (catName: string, currentOpen: boolean) => {
    setMatrixExpandedCats((prev) => ({
      ...prev,
      [catName]: !currentOpen,
    }));
  };

  const handleExpandAllMatrix = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of categoryStats) {
      next[c.category] = open;
    }
    setMatrixExpandedCats(next);
  };

  const prodCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      const cleanName = (p.productName || (p as any).name || '').trim().toLowerCase();
      const cleanCat = (p.category || '').trim();
      if (cleanName && cleanCat) {
        map.set(cleanName, cleanCat);
      }
    }
    return map;
  }, [products]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) {
      if (c && c.trim()) set.add(c.trim());
    }
    for (const p of products) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    for (const it of billItems) {
      const pKey = (it.productName || '').trim().toLowerCase();
      const resolvedCat = prodCategoryMap.get(pKey) || (it.category || '').trim();
      if (resolvedCat) set.add(resolvedCat);
    }
    return Array.from(set);
  }, [categories, products, billItems, prodCategoryMap]);

  useEffect(() => {
    if (allCategories.length > 0 && !allCategories.includes(selectedCategory)) {
      setSelectedCategory(allCategories[0]);
    }
  }, [allCategories, selectedCategory]);

  const categoryStats = useMemo<CategoryAgg[]>(() => {
    const catMap = new Map<string, Map<string, ProductAgg>>();

    for (const cat of allCategories) {
      catMap.set(cat, new Map());
    }

    // Pre-populate with menu products so newly uploaded categories & products show up immediately
    for (const prod of products) {
      const catName = (prod.category || 'Khác').trim();
      if (!catName) continue;
      if (!catMap.has(catName)) {
        catMap.set(catName, new Map());
      }
      const prodMap = catMap.get(catName)!;
      const cleanProdName = (prod.productName || (prod as any).name || '').trim();
      if (!cleanProdName) continue;
      const pKey = cleanProdName.toLowerCase();
      if (!prodMap.has(pKey)) {
        prodMap.set(pKey, {
          productName: cleanProdName,
          category: catName,
          unitPrice: Number(prod.unitPrice) || 0,
          soldQty: 0,
          returnedQty: 0,
          netQty: 0,
          grossRevenue: 0,
          netRevenue: 0,
        });
      }
    }

    for (const item of billItems) {
      const pKey = item.productName.trim().toLowerCase();
      const catName = prodCategoryMap.get(pKey) || (item.category || 'Khác').trim();
      if (!catMap.has(catName)) {
        catMap.set(catName, new Map());
      }
      const prodMap = catMap.get(catName)!;
      const existing = prodMap.get(pKey);

      const sold = Number(item.quantity) || 0;
      const ret = Number(item.returnedQuantity) || 0;
      const net = Math.max(0, sold - ret);
      const uPrice = Number(item.unitPrice) || 0;
      const grossRev = sold * uPrice;
      const netRev = net * uPrice;

      if (existing) {
        existing.soldQty += sold;
        existing.returnedQty += ret;
        existing.netQty += net;
        existing.grossRevenue += grossRev;
        existing.netRevenue += netRev;
        if (uPrice > 0) existing.unitPrice = uPrice;
      } else {
        prodMap.set(pKey, {
          productName: item.productName.trim(),
          category: catName,
          unitPrice: uPrice,
          soldQty: sold,
          returnedQty: ret,
          netQty: net,
          grossRevenue: grossRev,
          netRevenue: netRev,
        });
      }
    }

    const result: CategoryAgg[] = [];
    for (const [category, prodMap] of catMap.entries()) {
      const prods = Array.from(prodMap.values()).sort((a, b) =>
        metricMode === 'quantity'
          ? b.netQty - a.netQty || b.unitPrice - a.unitPrice
          : b.netRevenue - a.netRevenue || b.unitPrice - a.unitPrice
      );
      const soldQty = prods.reduce((s, p) => s + p.soldQty, 0);
      const returnedQty = prods.reduce((s, p) => s + p.returnedQty, 0);
      const netQty = prods.reduce((s, p) => s + p.netQty, 0);
      const grossRevenue = prods.reduce((s, p) => s + p.grossRevenue, 0);
      const netRevenue = prods.reduce((s, p) => s + p.netRevenue, 0);

      result.push({
        category,
        soldQty,
        returnedQty,
        netQty,
        grossRevenue,
        netRevenue,
        products: prods,
      });
    }

    return result;
  }, [billItems, products, allCategories, metricMode]);

  const totalAllNetRevenue = useMemo(
    () => Math.max(1, categoryStats.reduce((s, c) => s + c.netRevenue, 0)),
    [categoryStats]
  );

  const maxCatMetric = useMemo(() => {
    return Math.max(
      1,
      ...categoryStats.map((c) => (metricMode === 'quantity' ? c.netQty : c.netRevenue))
    );
  }, [categoryStats, metricMode]);

  const activeCategoryData = useMemo(() => {
    return (
      categoryStats.find((c) => c.category === selectedCategory) ||
      categoryStats[0] || {
        category: categories[0] || 'Bia',
        soldQty: 0,
        returnedQty: 0,
        netQty: 0,
        grossRevenue: 0,
        netRevenue: 0,
        products: [],
      }
    );
  }, [categoryStats, selectedCategory, categories]);

  const maxProductMetric = useMemo(() => {
    return Math.max(
      1,
      ...activeCategoryData.products.map((p) =>
        metricMode === 'quantity' ? p.netQty : p.netRevenue
      )
    );
  }, [activeCategoryData, metricMode]);

  const handleQuickAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;

    requestConfirm({
      title: 'Xác nhận Thêm Danh Mục Sản Phẩm',
      message: `Bạn có chắc chắn muốn thêm danh mục "${trimmed}" vào hệ thống không?`,
      confirmLabel: 'Thêm danh mục',
      variant: 'primary',
      onConfirm: async () => {
        await onAddCategory(trimmed);
        setNewCatInput('');
        setSelectedCategory(trimmed);
      },
    });
  };

  const handleConfirmRename = (oldName: string) => {
    if (!canWrite) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === oldName) {
      setRenamingCat(null);
      return;
    }
    requestConfirm({
      title: 'Xác nhận Sửa Tên Danh Mục',
      message: `Bạn có chắc chắn muốn đổi tên danh mục "${oldName}" thành "${trimmed}" không?`,
      confirmLabel: 'Lưu tên mới',
      variant: 'warning',
      onConfirm: async () => {
        await onRenameCategory(oldName, trimmed);
        if (selectedCategory === oldName) setSelectedCategory(trimmed);
        setRenamingCat(null);
      },
    });
  };

  const handleConfirmDeleteCat = (catName: string) => {
    if (!canWrite || categories.length <= 1) return;
    requestConfirm({
      title: 'Xác nhận Xóa Danh Mục Sản Phẩm',
      message: `Bạn có chắc chắn muốn xóa danh mục "${catName}" khỏi hệ thống không?`,
      confirmLabel: 'Xóa danh mục',
      variant: 'danger',
      onConfirm: async () => {
        await onDeleteCategory(catName);
        if (selectedCategory === catName) {
          setSelectedCategory(categories.find((c) => c !== catName) || 'Khác');
        }
      },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Control Header */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Thống Kê Số Lượng Theo Danh Mục & Mặt Hàng
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Kỳ thống kê: <strong className="text-slate-800 dark:text-slate-200">{periodLabel}</strong> · Số lượng sản phẩm bán trong Công nợ vẫn được cộng đầy đủ vào thống kê trong ngày.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onChangePeriod && (
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => onChangePeriod('day', todayBusinessStr)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    periodType === 'day' && (!todayBusinessStr || selectedDate === todayBusinessStr)
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => onChangePeriod('yesterday', yesterdayBusinessStr)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    periodType === 'yesterday' ||
                    (periodType === 'day' && yesterdayBusinessStr && selectedDate === yesterdayBusinessStr)
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Hôm qua
                </button>
                <button
                  type="button"
                  onClick={() => onChangePeriod('week')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    periodType === 'week'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tuần
                </button>
                <button
                  type="button"
                  onClick={() => onChangePeriod('month')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    periodType === 'month'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tháng
                </button>
                <button
                  type="button"
                  onClick={() => onChangePeriod('all')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    periodType === 'all'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tất cả
                </button>
              </div>
            )}

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setMetricMode('quantity')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  metricMode === 'quantity'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Theo Số lượng bán
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('revenue')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  metricMode === 'revenue'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Theo Doanh thu (₫)
              </button>
            </div>

            {canWrite && products.length > 0 && (
              <button
                type="button"
                onClick={onDeleteAllMenuProducts}
                className="w-full sm:w-auto justify-center px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả SP Menu ({products.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Permission Filter Banner when Role/Account has restricted category view */}
        {isCategoryRestricted && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 px-3.5 py-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Phân quyền <strong>{roleLabel || 'Nhân sự'}</strong>: Đang hiển thị{' '}
              <strong>
                {allCategories.length}/{totalSystemCategoriesCount || allCategories.length}
              </strong>{' '}
              danh mục được Admin cấp quyền xem
              {allCategories.length > 0 ? ` (${allCategories.join(' · ')})` : ''}.
            </span>
          </div>
        )}

        {/* Quick Add Category Bar */}
        {canWrite && !isCategoryRestricted && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Danh mục hiện có ({allCategories.length}): {allCategories.join(' · ')}
            </span>
            <form onSubmit={handleQuickAddCategory} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                placeholder="Tên danh mục mới..."
                className="flex-1 sm:w-48 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Thêm danh mục</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Overview Chart: All Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left: Category Column Chart, Dropdown & Collapsible Selector */}
        <div className="lg:col-span-6 p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                1. Tổng hợp theo Danh mục
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Chọn danh mục từ dropdown hoặc bấm vào nhóm để xổ mục con bên dưới
            </span>
          </div>

          {/* Quick Category Dropdown Selector (Optimized for Mobile & Desktop) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Chọn nhanh Danh mục (Dropdown):</span>
              </label>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                {activeCategoryData.products.length} mặt hàng
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={activeCategoryData.category}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedCategory(val);
                  setSummaryExpandedCats((prev) => ({ ...prev, [val]: true }));
                }}
                className="flex-1 px-3 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {categoryStats.map((cat) => (
                  <option key={cat.category} value={cat.category}>
                    {cat.category} — SL: {formatNumber(cat.netQty)} · {formatVND(cat.netRevenue)} ({cat.products.length} món)
                  </option>
                ))}
              </select>

              {canWrite && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingCat(activeCategoryData.category);
                      setRenameValue(activeCategoryData.category);
                    }}
                    className="p-2 text-slate-500 hover:text-emerald-600 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                    title="Đổi tên danh mục đang chọn"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmDeleteCat(activeCategoryData.category)}
                    className="p-2 text-slate-500 hover:text-rose-600 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                    title="Xóa danh mục đang chọn"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Inline rename input when triggered from dropdown or row */}
            {renamingCat === activeCategoryData.category && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Nhập tên danh mục mới..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleConfirmRename(activeCategoryData.category)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Lưu tên
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingCat(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Category Rows with Inline Child Items Dropdown */}
          <div className="space-y-2">
            {categoryStats.map((cat) => {
              const val = metricMode === 'quantity' ? cat.netQty : cat.netRevenue;
              const widthPct = Math.max(2, Math.round((val / maxCatMetric) * 100));
              const isSelected = cat.category === activeCategoryData.category;
              const isExpanded = summaryExpandedCats[cat.category] ?? isSelected;
              const isRenaming = renamingCat === cat.category;

              return (
                <div
                  key={cat.category}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-2xs'
                      : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div
                    onClick={() => toggleSummaryCat(cat.category)}
                    className="w-full text-left p-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs mb-2 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ChevronDown
                          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                            isExpanded
                              ? 'rotate-0 text-emerald-600 dark:text-emerald-400'
                              : '-rotate-90 text-slate-400'
                          }`}
                        />
                        {isRenaming ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="px-2 py-1 text-xs rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white w-28 sm:w-36"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleConfirmRename(cat.category)}
                              className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Lưu
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingCat(null)}
                              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-slate-900 dark:text-white truncate">
                              {cat.category}
                            </span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
                              {cat.products.length} món
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono shrink-0 ml-auto">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          SL: {formatNumber(cat.netQty)}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatVND(cat.netRevenue)}
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${val > 0 ? widthPct : 0}%` }}
                        className={`h-full rounded-full transition-all ${
                          isSelected
                            ? 'bg-emerald-600 dark:bg-emerald-500'
                            : 'bg-slate-400 dark:bg-slate-600'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Dropdown Child Items List right underneath Category */}
                  {isExpanded && (
                    <div className="border-t border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-3 py-2.5 space-y-1.5">
                      {cat.products.length === 0 ? (
                        <div className="py-3 text-center text-xs text-slate-400">
                          Chưa có mặt hàng nào trong danh mục "{cat.category}"
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                          {cat.products.map((prod) => (
                            <div
                              key={prod.productName}
                              className="py-2 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {prod.productName}
                                </p>
                                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                  Đơn giá: {formatVND(prod.unitPrice)} · Bán: {formatNumber(prod.soldQty)}
                                  {prod.returnedQty > 0 ? ` · Trả: -${formatNumber(prod.returnedQty)}` : ''}
                                </p>
                              </div>
                              <div className="text-right font-mono shrink-0">
                                <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                                  SL: {formatNumber(prod.netQty)}
                                </span>
                                <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                                  {formatVND(prod.netRevenue)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Drill-down Column Chart for Items inside Selected Category */}
        <div className="lg:col-span-6 p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    2. Chi tiết nhóm "{activeCategoryData.category}"
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Bán: {formatNumber(activeCategoryData.soldQty)} · Trả:{' '}
                    {formatNumber(activeCategoryData.returnedQty)} · Thực bán:{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {formatNumber(activeCategoryData.netQty)}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 font-mono">
                <div>
                  <span className="text-[11px] text-slate-500 block sm:text-right">Doanh thu nhóm</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {formatVND(activeCategoryData.netRevenue)}
                  </span>
                </div>
                {canWrite &&
                  products.some((p) => p.category === activeCategoryData.category) && (
                    <button
                      type="button"
                      onClick={() =>
                        onDeleteCategoryMenuProducts(activeCategoryData.category)
                      }
                      className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-sans font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa SP nhóm này</span>
                    </button>
                  )}
              </div>
            </div>

            {activeCategoryData.products.length === 0 ? (
              <div className="py-14 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                Chưa phát sinh số lượng bán cho danh mục "{activeCategoryData.category}" trong kỳ này.
              </div>
            ) : (
              <>
                {/* Vertical Column Chart for Individual Products in Category */}
                <div className="pt-4 pb-2 px-3 border border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 overflow-x-auto">
                  <div className="min-w-[300px]">
                    <div className="h-44 flex items-end gap-3 border-b border-slate-200 dark:border-slate-800 pb-2 px-2">
                      {activeCategoryData.products.map((prod) => {
                        const val =
                          metricMode === 'quantity' ? prod.netQty : prod.netRevenue;
                        const colH = Math.max(4, Math.round((val / maxProductMetric) * 135));

                        return (
                          <div
                            key={prod.productName}
                            className="flex-1 flex flex-col items-center justify-end h-full min-w-[44px]"
                          >
                            <span className="text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-300 mb-1 whitespace-nowrap">
                              {metricMode === 'quantity'
                                ? `${formatNumber(prod.netQty)}`
                                : `${formatNumber(Math.round(prod.netRevenue / 1000))}k`}
                            </span>
                            <div
                              style={{ height: `${val > 0 ? colH : 4}px` }}
                              className="w-7 sm:w-10 bg-emerald-600 dark:bg-emerald-500 rounded-t-md transition-all"
                              title={`${prod.productName}: Thực bán ${prod.netQty} (${formatVND(
                                prod.netRevenue
                              )})`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-start gap-3 pt-2 px-2">
                      {activeCategoryData.products.map((prod) => (
                        <div key={prod.productName} className="flex-1 text-center min-w-[44px]">
                          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 line-clamp-2">
                            {prod.productName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Product List inside Category */}
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3">Mặt hàng</th>
                        <th className="py-2.5 px-2 text-right">Bán</th>
                        <th className="py-2.5 px-2 text-right">Trả</th>
                        <th className="py-2.5 px-2 text-right">Thực bán</th>
                        <th className="py-2.5 px-3 text-right">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                      {activeCategoryData.products.map((prod) => (
                        <tr
                          key={prod.productName}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                            {prod.productName}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-600 dark:text-slate-300">
                            {formatNumber(prod.soldQty)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-rose-600 dark:text-rose-400">
                            {prod.returnedQty > 0 ? `-${formatNumber(prod.returnedQty)}` : '0'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {formatNumber(prod.netQty)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                            {formatVND(prod.netRevenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Full Matrix Cards: All Categories & Their Products (Dropdown & Collapsible Accordion) */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Bảng Tổng Hợp Toàn Bộ Danh Mục & Mặt Hàng
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chọn danh mục từ dropdown hoặc bấm vào từng nhóm để xổ xem các mặt hàng con bên dưới
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={matrixFilterCategory}
              onChange={(e) => {
                const val = e.target.value;
                setMatrixFilterCategory(val);
                if (val !== 'all') {
                  setMatrixExpandedCats((prev) => ({ ...prev, [val]: true }));
                }
              }}
              className="flex-1 sm:flex-initial min-w-[210px] px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">
                Tất cả danh mục ({categoryStats.length} nhóm)
              </option>
              {categoryStats.map((cat) => (
                <option key={cat.category} value={cat.category}>
                  {cat.category} ({cat.products.length} món · SL: {formatNumber(cat.netQty)})
                </option>
              ))}
            </select>

            {matrixFilterCategory === 'all' && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleExpandAllMatrix(true)}
                  className="flex-1 sm:flex-initial justify-center px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Mở tất cả</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExpandAllMatrix(false)}
                  className="flex-1 sm:flex-initial justify-center px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500" />
                  <span>Thu gọn</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-start">
          {categoryStats
            .filter(
              (cat) =>
                matrixFilterCategory === 'all' ||
                cat.category === matrixFilterCategory
            )
            .map((cat, idx) => {
              const sharePct = Math.round((cat.netRevenue / totalAllNetRevenue) * 100);
              const isOpen = isMatrixCatOpen(cat.category, cat.netQty > 0, idx);

              return (
                <div
                  key={cat.category}
                  className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleMatrixCat(cat.category, isOpen)}
                    className="w-full px-3.5 py-3 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100/80 dark:hover:bg-slate-800 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs min-w-0">
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                          isOpen
                            ? 'rotate-0 text-emerald-600 dark:text-emerald-400'
                            : '-rotate-90 text-slate-400'
                        }`}
                      />
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {cat.category}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-400 shrink-0">
                        {cat.products.length} món
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        SL: {formatNumber(cat.netQty)}
                      </span>
                    </div>
                    <div className="text-xs font-mono shrink-0 flex items-center gap-1">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatVND(cat.netRevenue)}
                      </span>
                      <span className="text-slate-400 hidden sm:inline">({sharePct}%)</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200 dark:border-slate-800">
                      {cat.products.length === 0 ? (
                        <div className="p-4 text-xs text-slate-400 text-center">
                          Chưa có món bán ra trong nhóm này
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                          {cat.products.map((p) => (
                            <div
                              key={p.productName}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-medium text-slate-800 dark:text-slate-200 block truncate">
                                  {p.productName}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400">
                                  Đ.Giá: {formatVND(p.unitPrice)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5 sm:gap-3 font-mono text-xs shrink-0">
                                <span className="text-slate-500">
                                  SL:{' '}
                                  <strong className="text-slate-900 dark:text-white">
                                    {p.netQty}
                                  </strong>
                                  {p.returnedQty > 0 && (
                                    <span className="text-rose-500 ml-1">
                                      (-{p.returnedQty})
                                    </span>
                                  )}
                                </span>
                                <span className="min-w-[80px] sm:w-24 text-right font-semibold text-slate-900 dark:text-white">
                                  {formatVND(p.netRevenue)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
