import React, { useState, useMemo, useEffect } from 'react';
import {
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
  CheckSquare,
  Square,
  Eye,
  Package,
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
  onOpenInventoryTab?: () => void;
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
  allProducts: ProductAgg[];
  visibleProducts: ProductAgg[];
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
  onOpenInventoryTab,
  requestConfirm,
}) => {
  const [metricMode, setMetricMode] = useState<'quantity' | 'revenue'>('quantity');

  // Display filter checkboxes (tích chọn hiển thị)
  // Default: onlySoldProducts = true (chỉ hiển thị sản phẩm bán được, ẩn món SL = 0)
  const [onlySoldProducts, setOnlySoldProducts] = useState<boolean>(true);
  const [hideEmptyCategories, setHideEmptyCategories] = useState<boolean>(false);
  const [onlyReturnedProducts, setOnlyReturnedProducts] = useState<boolean>(false);
  const [showColumnChart, setShowColumnChart] = useState<boolean>(true);

  // Category CRUD states
  const [newCatInput, setNewCatInput] = useState('');
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Accordion expand states — Strictly collapsed (false) by default, never auto-expanded!
  const [summaryExpandedCats, setSummaryExpandedCats] = useState<Record<string, boolean>>({});
  const [matrixExpandedCats, setMatrixExpandedCats] = useState<Record<string, boolean>>({});

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

  // Multi-category selection state (có thể chọn nhiều danh mục để xem 1 lần)
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    allCategories.length > 0 ? allCategories : []
  );

  // Keep selectedCategories valid when allCategories changes
  useEffect(() => {
    setSelectedCategories((prev) => {
      const validPrev = prev.filter((c) => allCategories.includes(c));
      if (validPrev.length > 0) return validPrev;
      return allCategories;
    });
  }, [allCategories]);

  // Build category & product stats
  const rawCategoryStats = useMemo<CategoryAgg[]>(() => {
    const catMap = new Map<string, Map<string, ProductAgg>>();

    for (const cat of allCategories) {
      catMap.set(cat, new Map());
    }

    // Pre-populate with menu products
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

    const filterProduct = (p: ProductAgg) => {
      if (onlySoldProducts && p.soldQty <= 0 && p.netQty <= 0) return false;
      if (onlyReturnedProducts && p.returnedQty <= 0) return false;
      return true;
    };

    const result: CategoryAgg[] = [];
    for (const [category, prodMap] of catMap.entries()) {
      const allProds = Array.from(prodMap.values()).sort((a, b) =>
        metricMode === 'quantity'
          ? b.netQty - a.netQty || b.soldQty - a.soldQty || b.unitPrice - a.unitPrice
          : b.netRevenue - a.netRevenue || b.soldQty - a.soldQty || b.unitPrice - a.unitPrice
      );
      const visibleProds = allProds.filter(filterProduct);

      const soldQty = allProds.reduce((s, p) => s + p.soldQty, 0);
      const returnedQty = allProds.reduce((s, p) => s + p.returnedQty, 0);
      const netQty = allProds.reduce((s, p) => s + p.netQty, 0);
      const grossRevenue = allProds.reduce((s, p) => s + p.grossRevenue, 0);
      const netRevenue = allProds.reduce((s, p) => s + p.netRevenue, 0);

      result.push({
        category,
        soldQty,
        returnedQty,
        netQty,
        grossRevenue,
        netRevenue,
        allProducts: allProds,
        visibleProducts: visibleProds,
      });
    }

    return result;
  }, [
    billItems,
    products,
    allCategories,
    prodCategoryMap,
    metricMode,
    onlySoldProducts,
    onlyReturnedProducts,
  ]);

  // Categories shown in the left list (filtered if hideEmptyCategories is checked)
  const displayedCategoryStats = useMemo(() => {
    if (!hideEmptyCategories) return rawCategoryStats;
    return rawCategoryStats.filter((c) => c.soldQty > 0 || c.netQty > 0);
  }, [rawCategoryStats, hideEmptyCategories]);

  // Categories currently ticked in multi-select
  const selectedCategoryStats = useMemo(() => {
    const selectedSet = new Set(selectedCategories);
    const matches = displayedCategoryStats.filter((c) => selectedSet.has(c.category));
    return matches;
  }, [displayedCategoryStats, selectedCategories]);

  // Combined / Merged data for all currently selected categories (Danh mục gộp hoặc 1 danh mục)
  const combinedSelectedData = useMemo(() => {
    const soldQty = selectedCategoryStats.reduce((s, c) => s + c.soldQty, 0);
    const returnedQty = selectedCategoryStats.reduce((s, c) => s + c.returnedQty, 0);
    const netQty = selectedCategoryStats.reduce((s, c) => s + c.netQty, 0);
    const grossRevenue = selectedCategoryStats.reduce((s, c) => s + c.grossRevenue, 0);
    const netRevenue = selectedCategoryStats.reduce((s, c) => s + c.netRevenue, 0);

    const mergedVisibleProducts: ProductAgg[] = [];
    let totalAllProductsCount = 0;

    for (const cat of selectedCategoryStats) {
      totalAllProductsCount += cat.allProducts.length;
      mergedVisibleProducts.push(...cat.visibleProducts);
    }

    mergedVisibleProducts.sort((a, b) =>
      metricMode === 'quantity'
        ? b.netQty - a.netQty || b.soldQty - a.soldQty || b.unitPrice - a.unitPrice
        : b.netRevenue - a.netRevenue || b.soldQty - a.soldQty || b.unitPrice - a.unitPrice
    );

    const hiddenZeroCount = Math.max(
      0,
      totalAllProductsCount - mergedVisibleProducts.length
    );

    return {
      categoriesCount: selectedCategoryStats.length,
      categoryNames: selectedCategoryStats.map((c) => c.category),
      soldQty,
      returnedQty,
      netQty,
      grossRevenue,
      netRevenue,
      visibleProducts: mergedVisibleProducts,
      totalAllProductsCount,
      hiddenZeroCount,
    };
  }, [selectedCategoryStats, metricMode]);

  const totalAllNetRevenue = useMemo(
    () => Math.max(1, rawCategoryStats.reduce((s, c) => s + c.netRevenue, 0)),
    [rawCategoryStats]
  );

  const maxCatMetric = useMemo(() => {
    return Math.max(
      1,
      ...rawCategoryStats.map((c) =>
        metricMode === 'quantity' ? c.netQty : c.netRevenue
      )
    );
  }, [rawCategoryStats, metricMode]);

  const maxProductMetric = useMemo(() => {
    return Math.max(
      1,
      ...combinedSelectedData.visibleProducts.map((p) =>
        metricMode === 'quantity' ? p.netQty : p.netRevenue
      )
    );
  }, [combinedSelectedData.visibleProducts, metricMode]);

  // Multi-select helpers
  const toggleCategorySelection = (catName: string) => {
    setSelectedCategories((prev) => {
      const exists = prev.includes(catName);
      if (exists) {
        return prev.filter((c) => c !== catName);
      }
      return [...prev, catName];
    });
  };

  const selectOnlyOneCategory = (catName: string) => {
    setSelectedCategories([catName]);
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories(displayedCategoryStats.map((c) => c.category));
  };

  const handleSelectOnlyCategoriesWithSales = () => {
    const withSales = rawCategoryStats
      .filter((c) => c.soldQty > 0 || c.netQty > 0)
      .map((c) => c.category);
    setSelectedCategories(withSales);
  };

  const handleClearCategorySelection = () => {
    setSelectedCategories([]);
  };

  // Accordion helpers — Strictly manual, never auto-open
  const toggleSummaryCatExpand = (catName: string) => {
    setSummaryExpandedCats((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  const handleExpandAllSummary = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of rawCategoryStats) {
      next[c.category] = open;
    }
    setSummaryExpandedCats(next);
  };

  const toggleMatrixCatExpand = (catName: string) => {
    setMatrixExpandedCats((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  const handleExpandAllMatrix = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of rawCategoryStats) {
      next[c.category] = open;
    }
    setMatrixExpandedCats(next);
  };

  // Category CRUD handlers
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
        setSelectedCategories((prev) =>
          prev.includes(trimmed) ? prev : [...prev, trimmed]
        );
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
        setSelectedCategories((prev) =>
          prev.map((c) => (c === oldName ? trimmed : c))
        );
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
        setSelectedCategories((prev) => prev.filter((c) => c !== catName));
      },
    });
  };

  const singleSelectedCategory =
    selectedCategories.length === 1 ? selectedCategories[0] : null;

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
              Kỳ thống kê: <strong className="text-slate-800 dark:text-slate-200">{periodLabel}</strong> · Có thể tích chọn 1 hoặc nhiều danh mục để gộp xem cùng lúc.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenInventoryTab && (
              <button
                type="button"
                onClick={onOpenInventoryTab}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Package className="w-3.5 h-3.5 shrink-0" />
                <span>Kho Đồ Uống & Tồn Kho</span>
              </button>
            )}
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

        {/* DISPLAY OPTIONS CHECKBOX BAR (Các tích chọn lọc sản phẩm bán được / hiển thị đầy đủ) */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Tùy chọn hiển thị mặt hàng & danh mục:</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {onlySoldProducts
                ? 'Đang ẩn các món chưa bán được (SL = 0)'
                : 'Đang hiển thị đầy đủ mọi món trong thực đơn (kể cả SL = 0)'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Checkbox 1: Chỉ xem các sản phẩm bán được (SL > 0) */}
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
                onlySoldProducts
                  ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <input
                type="checkbox"
                checked={onlySoldProducts}
                onChange={(e) => setOnlySoldProducts(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Chỉ hiện sản phẩm bán được (SL &gt; 0)</span>
            </label>

            {/* Checkbox 2: Hiển thị đầy đủ (bao gồm cả món SL = 0) */}
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
                !onlySoldProducts
                  ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <input
                type="checkbox"
                checked={!onlySoldProducts}
                onChange={(e) => setOnlySoldProducts(!e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Hiển thị đầy đủ (Cả món chưa bán SL = 0)</span>
            </label>

            {/* Checkbox 3: Chỉ hiện danh mục có phát sinh bán */}
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
                hideEmptyCategories
                  ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <input
                type="checkbox"
                checked={hideEmptyCategories}
                onChange={(e) => setHideEmptyCategories(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Ẩn danh mục chưa bán món nào</span>
            </label>

            {/* Checkbox 4: Chỉ hiện món có hoàn trả */}
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
                onlyReturnedProducts
                  ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <input
                type="checkbox"
                checked={onlyReturnedProducts}
                onChange={(e) => setOnlyReturnedProducts(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span>Chỉ hiện món có hoàn trả</span>
            </label>

            {/* Checkbox 5: Hiển thị biểu đồ cột */}
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${
                showColumnChart
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-800 dark:text-slate-200'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400'
              }`}
            >
              <input
                type="checkbox"
                checked={showColumnChart}
                onChange={(e) => setShowColumnChart(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Hiện biểu đồ cột</span>
            </label>
          </div>
        </div>

        {/* MULTI-CATEGORY SELECTOR BAR (Chọn nhiều danh mục để xem 1 lần) */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Chọn Danh Mục Để Xem Cùng Lúc ({selectedCategoryStats.length}/{displayedCategoryStats.length} nhóm đang chọn):
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllCategories}
                className="px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
              >
                Chọn tất cả ({displayedCategoryStats.length})
              </button>
              <button
                type="button"
                onClick={handleSelectOnlyCategoriesWithSales}
                className="px-2.5 py-1 rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-[11px] font-semibold text-blue-700 dark:text-blue-300 cursor-pointer"
              >
                Chỉ nhóm có bán ({rawCategoryStats.filter((c) => c.soldQty > 0).length})
              </button>
              <button
                type="button"
                onClick={handleClearCategorySelection}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Bỏ chọn hết
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {displayedCategoryStats.map((cat) => {
              const isChecked = selectedCategories.includes(cat.category);
              return (
                <label
                  key={cat.category}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all cursor-pointer select-none ${
                    isChecked
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-semibold shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCategorySelection(cat.category)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
                  />
                  <span>{cat.category}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    SL: {formatNumber(cat.netQty)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Quick Add Category Bar */}
        {canWrite && !isCategoryRestricted && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Quản lý nhanh danh mục ({allCategories.length} nhóm)
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

      {/* Main Two-Column Section: 1. Category List (Collapsed by default) & 2. Multi-Category Merged Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left: Category Summary List — Collapsed by default, only expands when user clicks */}
        <div className="lg:col-span-6 p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  1. Tổng hợp theo Danh mục ({selectedCategoryStats.length} nhóm đang chọn)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mặc định thu gọn · Bấm vào dòng danh mục để xổ/đóng danh sách món
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleExpandAllSummary(true)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                title="Xổ tất cả danh mục"
              >
                <ChevronsUpDown className="w-3.5 h-3.5 text-emerald-600" />
                <span>Xổ tất cả</span>
              </button>
              <button
                type="button"
                onClick={() => handleExpandAllSummary(false)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                title="Thu gọn tất cả danh mục"
              >
                <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500" />
                <span>Thu gọn hết</span>
              </button>
            </div>
          </div>

          {displayedCategoryStats.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              Không có danh mục nào khớp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="space-y-2">
              {displayedCategoryStats.map((cat) => {
                const val = metricMode === 'quantity' ? cat.netQty : cat.netRevenue;
                const widthPct = Math.max(2, Math.round((val / maxCatMetric) * 100));
                const isSelected = selectedCategories.includes(cat.category);
                // Strictly collapsed by default unless explicitly toggled open by the user
                const isExpanded = Boolean(summaryExpandedCats[cat.category]);
                const isRenaming = renamingCat === cat.category;

                return (
                  <div
                    key={cat.category}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isSelected
                        ? 'border-emerald-500/80 bg-emerald-50/20 dark:bg-emerald-950/15 shadow-2xs'
                        : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-75'
                    }`}
                  >
                    <div className="w-full text-left p-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center justify-between text-xs mb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Checkbox to select/deselect this category for multi-view */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCategorySelection(cat.category)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer shrink-0"
                            title={`Tích chọn/bỏ chọn danh mục "${cat.category}"`}
                          />

                          {/* Clicking header/chevron toggles accordion open/close */}
                          <button
                            type="button"
                            onClick={() => toggleSummaryCatExpand(cat.category)}
                            className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer"
                          >
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
                                  {onlySoldProducts
                                    ? `${cat.visibleProducts.length}/${cat.allProducts.length} món có bán`
                                    : `${cat.allProducts.length} món`}
                                </span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-2 font-mono shrink-0 ml-auto">
                          <button
                            type="button"
                            onClick={() => selectOnlyOneCategory(cat.category)}
                            className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-500 hover:text-emerald-600 cursor-pointer hidden sm:inline-block"
                            title={`Chỉ xem riêng danh mục "${cat.category}"`}
                          >
                            Chỉ xem nhóm này
                          </button>
                          <span
                            onClick={() => toggleSummaryCatExpand(cat.category)}
                            className="font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer"
                          >
                            SL: {formatNumber(cat.netQty)}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">|</span>
                          <span
                            onClick={() => toggleSummaryCatExpand(cat.category)}
                            className="font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                          >
                            {formatVND(cat.netRevenue)}
                          </span>

                          {canWrite && !isRenaming && (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingCat(cat.category);
                                  setRenameValue(cat.category);
                                }}
                                className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer"
                                title="Đổi tên danh mục"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmDeleteCat(cat.category)}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Xóa danh mục"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        onClick={() => toggleSummaryCatExpand(cat.category)}
                        className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden cursor-pointer"
                      >
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

                    {/* Dropdown Child Items List right underneath Category (Only when user clicks to expand) */}
                    {isExpanded && (
                      <div className="border-t border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-3 py-2.5 space-y-1.5">
                        {cat.visibleProducts.length === 0 ? (
                          <div className="py-3 text-center text-xs text-slate-400">
                            {onlySoldProducts && cat.allProducts.length > 0
                              ? `Chưa có sản phẩm nào bán được trong danh mục "${cat.category}" (Đang ẩn ${cat.allProducts.length} món SL = 0).`
                              : `Chưa có mặt hàng nào trong danh mục "${cat.category}".`}
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                            {cat.visibleProducts.map((prod) => (
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
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md font-bold text-xs ${
                                      prod.netQty > 0
                                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                    }`}
                                  >
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
          )}
        </div>

        {/* Right: Combined / Multi-Category Products Detail & Column Chart */}
        <div className="lg:col-span-6 p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {combinedSelectedData.categoriesCount === 0
                      ? '2. Chưa chọn danh mục nào'
                      : combinedSelectedData.categoriesCount === 1
                      ? `2. Chi tiết nhóm "${combinedSelectedData.categoryNames[0]}"`
                      : combinedSelectedData.categoriesCount === displayedCategoryStats.length
                      ? `2. Gộp tất cả danh mục (${combinedSelectedData.categoriesCount} nhóm)`
                      : `2. Danh mục gộp (${combinedSelectedData.categoriesCount} nhóm: ${combinedSelectedData.categoryNames.join(', ')})`}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Bán: {formatNumber(combinedSelectedData.soldQty)} · Trả:{' '}
                    {formatNumber(combinedSelectedData.returnedQty)} · Thực bán:{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {formatNumber(combinedSelectedData.netQty)}
                    </strong>
                    {' · '}
                    Hiển thị:{' '}
                    <strong>
                      {combinedSelectedData.visibleProducts.length}
                    </strong>
                    /{combinedSelectedData.totalAllProductsCount} món
                    {onlySoldProducts && combinedSelectedData.hiddenZeroCount > 0
                      ? ` (Đã ẩn ${combinedSelectedData.hiddenZeroCount} món SL = 0)`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 font-mono shrink-0">
                <div>
                  <span className="text-[11px] text-slate-500 block sm:text-right">
                    Doanh thu {combinedSelectedData.categoriesCount > 1 ? 'các nhóm chọn' : 'nhóm'}
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {formatVND(combinedSelectedData.netRevenue)}
                  </span>
                </div>
                {canWrite &&
                  singleSelectedCategory &&
                  products.some((p) => p.category === singleSelectedCategory) && (
                    <button
                      type="button"
                      onClick={() =>
                        onDeleteCategoryMenuProducts(singleSelectedCategory)
                      }
                      className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-sans font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa SP nhóm này</span>
                    </button>
                  )}
              </div>
            </div>

            {combinedSelectedData.categoriesCount === 0 ? (
              <div className="py-14 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                <p>Bạn chưa tích chọn danh mục nào để xem.</p>
                <button
                  type="button"
                  onClick={handleSelectAllCategories}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Chọn tất cả danh mục
                </button>
              </div>
            ) : combinedSelectedData.visibleProducts.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
                <p>
                  {onlySoldProducts
                    ? `Không có sản phẩm nào phát sinh số lượng bán (SL > 0) trong ${
                        combinedSelectedData.categoriesCount === 1
                          ? `danh mục "${combinedSelectedData.categoryNames[0]}"`
                          : `${combinedSelectedData.categoriesCount} danh mục đang chọn`
                      } ở kỳ này.`
                    : 'Chưa có sản phẩm nào trong các danh mục đang chọn.'}
                </p>
                {onlySoldProducts && combinedSelectedData.hiddenZeroCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnlySoldProducts(false)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Bật &ldquo;Hiển thị đầy đủ&rdquo; để xem {combinedSelectedData.hiddenZeroCount} món SL = 0
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Vertical Column Chart for Visible Products (when showColumnChart is checked) */}
                {showColumnChart && (
                  <div className="pt-4 pb-2 px-3 border border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 overflow-x-auto">
                    <div
                      style={{
                        minWidth: `${Math.max(
                          280,
                          combinedSelectedData.visibleProducts.length * 56
                        )}px`,
                      }}
                    >
                      <div className="h-44 flex items-end gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-2 px-2">
                        {combinedSelectedData.visibleProducts.map((prod) => {
                          const val =
                            metricMode === 'quantity' ? prod.netQty : prod.netRevenue;
                          const colH = Math.max(
                            4,
                            Math.round((val / maxProductMetric) * 135)
                          );

                          return (
                            <div
                              key={`${prod.category}_${prod.productName}`}
                              className="flex-1 flex flex-col items-center justify-end h-full min-w-[44px]"
                            >
                              <span className="text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-300 mb-1 whitespace-nowrap">
                                {metricMode === 'quantity'
                                  ? `${formatNumber(prod.netQty)}`
                                  : `${formatNumber(Math.round(prod.netRevenue / 1000))}k`}
                              </span>
                              <div
                                style={{ height: `${val > 0 ? colH : 4}px` }}
                                className={`w-7 sm:w-9 rounded-t-md transition-all ${
                                  val > 0
                                    ? 'bg-emerald-600 dark:bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-700'
                                }`}
                                title={`${prod.productName} (${prod.category}): Thực bán ${prod.netQty} (${formatVND(
                                  prod.netRevenue
                                )})`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-start gap-2.5 pt-2 px-2">
                        {combinedSelectedData.visibleProducts.map((prod) => (
                          <div
                            key={`${prod.category}_${prod.productName}`}
                            className="flex-1 text-center min-w-[44px]"
                          >
                            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 line-clamp-2">
                              {prod.productName}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Product List inside Selected / Merged Categories */}
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3">Mặt hàng</th>
                        {combinedSelectedData.categoriesCount > 1 && (
                          <th className="py-2.5 px-2">Danh mục</th>
                        )}
                        <th className="py-2.5 px-2 text-right">Bán</th>
                        <th className="py-2.5 px-2 text-right">Trả</th>
                        <th className="py-2.5 px-2 text-right">Thực bán</th>
                        <th className="py-2.5 px-3 text-right">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                      {combinedSelectedData.visibleProducts.map((prod) => (
                        <tr
                          key={`${prod.category}_${prod.productName}`}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                            {prod.productName}
                          </td>
                          {combinedSelectedData.categoriesCount > 1 && (
                            <td className="py-2.5 px-2 font-sans text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                {prod.category}
                              </span>
                            </td>
                          )}
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

      {/* Section 3: Full Matrix Cards for Selected Categories (Strictly Collapsed by default!) */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              3. Bảng Tổng Hợp Theo Từng Danh Mục Đã Chọn ({selectedCategoryStats.length} nhóm)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tất cả danh mục được thu gọn mặc định · Bấm vào từng nhóm hoặc nút &ldquo;Mở tất cả&rdquo; để xem chi tiết món
            </p>
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleExpandAllMatrix(true)}
              className="flex-1 sm:flex-initial justify-center px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
            >
              <ChevronsUpDown className="w-3.5 h-3.5 text-emerald-600" />
              <span>Mở tất cả</span>
            </button>
            <button
              type="button"
              onClick={() => handleExpandAllMatrix(false)}
              className="flex-1 sm:flex-initial justify-center px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
            >
              <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500" />
              <span>Thu gọn tất cả</span>
            </button>
          </div>
        </div>

        {selectedCategoryStats.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            Chưa có danh mục nào được tích chọn.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-start">
            {selectedCategoryStats.map((cat) => {
              const sharePct = Math.round((cat.netRevenue / totalAllNetRevenue) * 100);
              // Strictly collapsed by default unless user explicitly opens it
              const isOpen = Boolean(matrixExpandedCats[cat.category]);

              return (
                <div
                  key={cat.category}
                  className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleMatrixCatExpand(cat.category)}
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
                        {onlySoldProducts
                          ? `${cat.visibleProducts.length}/${cat.allProducts.length} món có bán`
                          : `${cat.allProducts.length} món`}
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
                      {cat.visibleProducts.length === 0 ? (
                        <div className="p-4 text-xs text-slate-400 text-center">
                          {onlySoldProducts && cat.allProducts.length > 0
                            ? `Chưa có món bán ra trong nhóm này (Đang ẩn ${cat.allProducts.length} món SL = 0)`
                            : 'Chưa có món trong nhóm này'}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                          {cat.visibleProducts.map((p) => (
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
        )}
      </div>
    </div>
  );
};
