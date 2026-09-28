import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  Plus,
  Minus,
  Search,
  Trash2,
  CheckCircle2,
  Calendar,
  Beer,
  Utensils,
  PackageCheck,
  Eye,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  ExtractedBillItem,
  ConfirmRequestOptions,
} from '../types';
import {
  formatVND,
  formatDateDMY,
  getCurrentBusinessDate,
  getYesterdayBusinessDate,
  shiftDateByDays,
  inferCategory,
  inferUnit,
  isOwnerUseBill,
  extractOwnerUseTarget,
} from '../utils/parser';

interface OwnerConsumptionTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  products: ProductRecord[];
  categories: string[];
  canWrite: boolean;
  canDelete: boolean;
  onSaveOwnerUseBill: (payload: {
    billDate: string;
    targetUser: string;
    note: string;
    items: ExtractedBillItem[];
  }) => Promise<void>;
  onInspectBill?: (bill: BillRecord) => void;
  onDeleteBill: (bill: BillRecord) => Promise<void>;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

type FilterPeriodMode =
  | 'today'
  | 'yesterday'
  | 'single_date'
  | 'week'
  | 'month'
  | 'custom_range'
  | 'all';

interface DraftOwnerItem {
  id: string;
  productName: string;
  category: string;
  unit: string;
  quantity: number;
  referenceUnitPrice: number;
  note: string;
}

const PRESET_TARGETS = [
  'Chủ quán',
  'Quản lý',
  'Chủ tiếp khách',
  'Quản lý tiếp khách',
  'Nội bộ quán',
];

export const OwnerConsumptionTab: React.FC<OwnerConsumptionTabProps> = ({
  bills,
  billItems,
  products,
  categories,
  canWrite,
  canDelete,
  onSaveOwnerUseBill,
  onInspectBill,
  onDeleteBill,
  requestConfirm,
}) => {
  const todayStr = useMemo(() => getCurrentBusinessDate(), []);
  const yesterdayStr = useMemo(() => getYesterdayBusinessDate(), []);

  // Form states for creating a new Owner/Manager consumption entry
  const [useDate, setUseDate] = useState<string>(todayStr);
  const [targetUser, setTargetUser] = useState<string>('Chủ quán');
  const [generalNote, setGeneralNote] = useState<string>('');
  const [draftItems, setDraftItems] = useState<DraftOwnerItem[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccessPopup, setSavedSuccessPopup] = useState<{
    targetUser: string;
    useDate: string;
    totalQty: number;
    itemsText: string;
  } | null>(null);

  // Menu picker states
  const [menuSearch, setMenuSearch] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Custom item input states (when adding an item not in catalog or typing manually)
  const [customItemName, setCustomItemName] = useState<string>('');
  const [customItemCategory, setCustomItemCategory] = useState<string>('Bia');
  const [customItemQty, setCustomItemQty] = useState<string>('1');
  const [customItemNote, setCustomItemNote] = useState<string>('');

  // History filter states
  const [periodMode, setPeriodMode] = useState<FilterPeriodMode>('all');
  const [singleDate, setSingleDate] = useState<string>(todayStr);
  const [rangeStart, setRangeStart] = useState<string>(shiftDateByDays(todayStr, -7));
  const [rangeEnd, setRangeEnd] = useState<string>(todayStr);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyViewMode, setHistoryViewMode] = useState<'by_item' | 'by_slip'>('by_slip');

  const allCategories = useMemo(() => {
    const set = new Set<string>(['Bia', 'Nước ngọt']);
    for (const c of categories) {
      if (c && c.trim()) set.add(c.trim());
    }
    for (const p of products) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set);
  }, [categories, products]);

  const isBeverageCategory = (cat: string, name: string) => {
    const combined = `${cat} ${name}`.toLowerCase();
    return /(bia|nước ngọt|nuoc ngot|đồ uống|do uong|tiger|heineken|larue|budweiser|huda|sài gòn|saigon|pepsi|coca|7up|sting|redbull|bò húc|nước suối|aqua|dasani)/i.test(
      combined
    );
  };

  // Filtered catalog products for quick picking
  const filteredCatalogProducts = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return products
      .filter((p) => {
        if (
          selectedCategoryFilter !== 'all' &&
          p.category.toLowerCase() !== selectedCategoryFilter.toLowerCase()
        ) {
          return false;
        }
        if (!q) return true;
        return (
          p.productName.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Put Bia and Nước ngọt first when 'all' is selected
        const aBev = isBeverageCategory(a.category, a.productName) ? 0 : 1;
        const bBev = isBeverageCategory(b.category, b.productName) ? 0 : 1;
        if (aBev !== bBev) return aBev - bBev;
        return (b.totalSold || 0) - (a.totalSold || 0) || a.productName.localeCompare(b.productName);
      });
  }, [products, menuSearch, selectedCategoryFilter]);

  const handleQuickAddCatalogItem = (prod: ProductRecord, addQty: number) => {
    if (!canWrite) return;
    const cleanQty = Math.max(1, Math.round(addQty));
    setDraftItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.productName.toLowerCase().trim() === prod.productName.toLowerCase().trim()
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + cleanQty,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          productName: prod.productName.trim(),
          category: (prod.category || inferCategory(prod.productName)).trim(),
          unit: (prod.unit || inferUnit(prod.productName, prod.category)).trim(),
          quantity: cleanQty,
          referenceUnitPrice: Number(prod.unitPrice) || 0,
          note: '',
        },
      ];
    });
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const cleanName = customItemName.trim();
    if (!cleanName) return;
    const qty = Math.max(1, Math.round(Number(customItemQty) || 1));

    const matchedCatalog = products.find(
      (p) => p.productName.toLowerCase().trim() === cleanName.toLowerCase()
    );
    const cat = matchedCatalog?.category || customItemCategory || inferCategory(cleanName);
    const unit = matchedCatalog?.unit || inferUnit(cleanName, cat);
    const refPrice = Number(matchedCatalog?.unitPrice) || 0;

    setDraftItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) =>
          it.productName.toLowerCase().trim() === cleanName.toLowerCase() &&
          (it.note || '').trim() === customItemNote.trim()
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + qty,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          productName: matchedCatalog?.productName || cleanName,
          category: cat,
          unit,
          quantity: qty,
          referenceUnitPrice: refPrice,
          note: customItemNote.trim(),
        },
      ];
    });

    setCustomItemName('');
    setCustomItemQty('1');
    setCustomItemNote('');
  };

  const handleUpdateDraftQty = (id: string, nextQty: number) => {
    if (nextQty <= 0) {
      setDraftItems((prev) => prev.filter((it) => it.id !== id));
      return;
    }
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: Math.round(nextQty) } : it))
    );
  };

  const handleUpdateDraftNote = (id: string, note: string) => {
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, note } : it))
    );
  };

  const handleRemoveDraftItem = (id: string) => {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  };

  const draftSummary = useMemo(() => {
    let totalQty = 0;
    let bevQty = 0;
    let foodQty = 0;
    let referenceValue = 0;

    for (const it of draftItems) {
      totalQty += it.quantity;
      if (isBeverageCategory(it.category, it.productName)) {
        bevQty += it.quantity;
      } else {
        foodQty += it.quantity;
      }
      referenceValue += it.quantity * (it.referenceUnitPrice || 0);
    }

    return {
      totalQty,
      bevQty,
      foodQty,
      referenceValue,
    };
  }, [draftItems]);

  const handleSaveSlip = async () => {
    if (!canWrite || draftItems.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const cleanTarget = targetUser.trim() || 'Chủ / Quản lý';
      const itemsPayload: ExtractedBillItem[] = draftItems.map((it) => ({
        productName: it.productName,
        category: it.category,
        quantity: it.quantity,
        unitPrice: 0, // Không tính thành tiền (0đ)
        subtotal: 0, // Không tính thành tiền (0đ)
        originalUnitPrice: it.referenceUnitPrice > 0 ? it.referenceUnitPrice : undefined,
        note: it.note
          ? `${it.note} (${cleanTarget} sử dụng · 0đ)`
          : `${cleanTarget} sử dụng · 0đ`,
      }));

      const summaryText = draftItems
        .map((it) => `${it.productName} x${it.quantity}`)
        .join(', ');
      const totalQty = draftItems.reduce((s, it) => s + it.quantity, 0);

      await onSaveOwnerUseBill({
        billDate: useDate,
        targetUser: cleanTarget,
        note: generalNote.trim()
          ? `[CHỦ/QL SỬ DỤNG] ${cleanTarget} - ${generalNote.trim()}`
          : `[CHỦ/QL SỬ DỤNG] ${cleanTarget}`,
        items: itemsPayload,
      });

      // Clear form and display confirmation popup
      setDraftItems([]);
      setGeneralNote('');
      setSavedSuccessPopup({
        targetUser: cleanTarget,
        useDate,
        totalQty,
        itemsText: summaryText,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Date filter matching for history
  const isDateInSelectedPeriod = (dateStr: string): boolean => {
    if (!dateStr) return false;
    if (periodMode === 'all') return true;
    if (periodMode === 'today') return dateStr === todayStr;
    if (periodMode === 'yesterday') return dateStr === yesterdayStr;
    if (periodMode === 'single_date') return dateStr === singleDate;
    if (periodMode === 'week') {
      const target = new Date(dateStr + 'T00:00:00').getTime();
      const now = new Date(todayStr + 'T00:00:00').getTime();
      const diffDays = (now - target) / 86400000;
      return diffDays >= -1 && diffDays <= 7;
    }
    if (periodMode === 'month') {
      return dateStr.slice(0, 7) === todayStr.slice(0, 7);
    }
    if (periodMode === 'custom_range') {
      const s = rangeStart || '2000-01-01';
      const e = rangeEnd || '2099-12-31';
      return dateStr >= s && dateStr <= e;
    }
    return true;
  };

  // All Owner/Manager use bills in period
  const ownerUseBills = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return bills
      .filter((b) => isOwnerUseBill(b) && isDateInSelectedPeriod(b.billDate))
      .filter((b) => {
        if (!q) return true;
        const target = extractOwnerUseTarget(b).toLowerCase();
        return (
          target.includes(q) ||
          b.billCode.toLowerCase().includes(q) ||
          b.itemsSummary.toLowerCase().includes(q) ||
          b.note.toLowerCase().includes(q) ||
          b.billDate.includes(q)
        );
      })
      .sort((a, b) => b.billDate.localeCompare(a.billDate) || b.createdAtMs - a.createdAtMs);
  }, [
    bills,
    periodMode,
    todayStr,
    yesterdayStr,
    singleDate,
    rangeStart,
    rangeEnd,
    historySearch,
  ]);

  const ownerUseBillIds = useMemo(
    () => new Set(ownerUseBills.map((b) => b.id)),
    [ownerUseBills]
  );

  const prodCatalogPriceMap = useMemo(() => {
    const map = new Map<string, { price: number; category: string; unit: string }>();
    for (const p of products) {
      map.set(p.productName.toLowerCase().trim(), {
        price: Number(p.unitPrice) || 0,
        category: p.category || 'Khác',
        unit: p.unit || inferUnit(p.productName, p.category),
      });
    }
    return map;
  }, [products]);

  const ownerUseItems = useMemo(() => {
    return billItems.filter((it) => ownerUseBillIds.has(it.billId));
  }, [billItems, ownerUseBillIds]);

  // Aggregated item stats for Owner/Manager consumption
  const aggregatedItems = useMemo(() => {
    const map = new Map<
      string,
      {
        productName: string;
        category: string;
        unit: string;
        totalQty: number;
        refUnitPrice: number;
        refTotalValue: number;
        slipsCount: number;
      }
    >();

    for (const it of ownerUseItems) {
      const cleanName = it.productName.trim();
      const key = cleanName.toLowerCase();
      const catInfo = prodCatalogPriceMap.get(key);
      const refPrice =
        Number(it.originalUnitPrice) || catInfo?.price || Number(it.unitPrice) || 0;
      const category = catInfo?.category || it.category || inferCategory(cleanName);
      const unit = catInfo?.unit || inferUnit(cleanName, category);
      const netQty = Math.max(0, (Number(it.quantity) || 0) - (Number(it.returnedQuantity) || 0));
      if (netQty <= 0) continue;

      const cur = map.get(key) || {
        productName: cleanName,
        category,
        unit,
        totalQty: 0,
        refUnitPrice: refPrice,
        refTotalValue: 0,
        slipsCount: 0,
      };
      cur.totalQty += netQty;
      cur.refTotalValue += netQty * refPrice;
      cur.slipsCount += 1;
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [ownerUseItems, prodCatalogPriceMap]);

  const historyStats = useMemo(() => {
    let bevQty = 0;
    let foodQty = 0;
    let totalQty = 0;
    let refTotalMoney = 0;

    for (const row of aggregatedItems) {
      totalQty += row.totalQty;
      refTotalMoney += row.refTotalValue;
      if (isBeverageCategory(row.category, row.productName)) {
        bevQty += row.totalQty;
      } else {
        foodQty += row.totalQty;
      }
    }

    return {
      slipsCount: ownerUseBills.length,
      bevQty,
      foodQty,
      totalQty,
      refTotalMoney,
    };
  }, [aggregatedItems, ownerUseBills.length]);

  return (
    <div className="space-y-5">
      {/* Success Popup Modal after saving */}
      {savedSuccessPopup && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Đã Lưu Phiếu Chủ / Quản Lý Sử Dụng!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ngày {formatDateDMY(savedSuccessPopup.useDate)} · {savedSuccessPopup.targetUser}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Món & Bia đã xuất:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {savedSuccessPopup.totalQty} phần/lon
                </span>
              </div>
              <div className="text-slate-700 dark:text-slate-300 font-medium">
                {savedSuccessPopup.itemsText}
              </div>
              <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-500">Cộng vào Số lượng bán & Trừ kho:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  +{savedSuccessPopup.totalQty} (Đã tính SL bán)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Thành tiền tính vào Doanh thu:</span>
                <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  0đ (Không tính tiền)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSavedSuccessPopup(null)}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Đóng & Nhập Phiếu Tiếp Theo
            </button>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Chủ Quán & Quản Lý Sử Dụng (Bia · Nước Ngọt · Món Ăn)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nhập riêng bia, nước ngọt, món ăn do <strong>Chủ quán hoặc Quản lý</strong> sử dụng
            (tiếp khách, dùng nội bộ). Các món này <strong>vẫn cộng vào Số lượng bán & trừ Tồn kho</strong>{' '}
            nhưng <strong>thành tiền = 0đ</strong> (không cộng vào doanh thu).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono shrink-0">
          <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300">
            Số lượng bán & Tồn kho: <strong>CÓ TÍNH (+SL)</strong>
          </div>
          <div className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-indigo-800 dark:text-indigo-300">
            Giá tiền & Doanh thu: <strong>0đ (KHÔNG TÍNH TIỀN)</strong>
          </div>
        </div>
      </div>

      {/* Main 2-Column Creation Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5">
        {/* Left Column (7 cols): Quick Pick from Menu + Custom Item Entry */}
        <div className="xl:col-span-7 p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                1. Chọn Bia, Nước Ngọt Hoặc Món Ăn Sử Dụng
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bấm chọn nhanh số lượng lon/thùng bia hoặc phần món ăn từ thực đơn bên dưới
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {filteredCatalogProducts.length} mặt hàng
            </span>
          </div>

          {/* Search & Category Tabs */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Tìm nhanh Bia Tiger, Heineken, Nước ngọt, Gà, Hải sản..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Tất cả nhóm
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    selectedCategoryFilter.toLowerCase() === cat.toLowerCase()
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid List */}
          <div className="max-h-[380px] overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredCatalogProducts.map((prod) => {
              const isBev = isBeverageCategory(prod.category, prod.productName);
              const inDraft = draftItems.find(
                (d) =>
                  d.productName.toLowerCase().trim() ===
                  prod.productName.toLowerCase().trim()
              );
              return (
                <div
                  key={prod.id}
                  className={`p-3 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 ${
                    inDraft
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {prod.productName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>{prod.category}</span>
                        <span>·</span>
                        <span className="line-through opacity-75">
                          {formatVND(prod.unitPrice)}/{prod.unit || 'phần'}
                        </span>
                        <span>→</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          0đ
                        </span>
                      </div>
                    </div>
                    {inDraft && (
                      <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                        Đã chọn: {inDraft.quantity}
                      </span>
                    )}
                  </div>

                  {/* Quick Add Quantity Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isBev ? (
                      <>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => handleQuickAddCatalogItem(prod, 1)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          +1 {prod.unit || 'lon'}
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => handleQuickAddCatalogItem(prod, 6)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          +6
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => handleQuickAddCatalogItem(prod, 12)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          +12
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => handleQuickAddCatalogItem(prod, 24)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          +24 (1 thùng)
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => handleQuickAddCatalogItem(prod, 1)}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          +1 {prod.unit || 'phần'}
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => handleQuickAddCatalogItem(prod, 2)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          +2
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => handleQuickAddCatalogItem(prod, 5)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          +5
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Manual Custom Item Input Bar */}
          <form
            onSubmit={handleAddCustomItem}
            className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
          >
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Hoặc tự nhập tên bia / món ăn ngoài menu:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                value={customItemName}
                onChange={(e) => setCustomItemName(e.target.value)}
                placeholder="Tên bia / món ăn (VD: Bia Tiger bạc, Mực hấp...)"
                className="sm:col-span-5 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <select
                value={customItemCategory}
                onChange={(e) => setCustomItemCategory(e.target.value)}
                className="sm:col-span-3 px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={customItemQty}
                onChange={(e) => setCustomItemQty(e.target.value)}
                placeholder="SL"
                className="sm:col-span-2 px-2.5 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={!canWrite || !customItemName.trim()}
                className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column (5 cols): Active Slip Info & Selected Items to Save */}
        <div className="xl:col-span-5 p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                2. Thông Tin Phiếu Chủ / Quản Lý Sử Dụng
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn ngày, người sử dụng và kiểm tra số lượng trước khi lưu
              </p>
            </div>

            {/* Date & Target User Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                  Ngày sử dụng (Ca bán):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={useDate}
                    onChange={(e) => setUseDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setUseDate(todayStr)}
                    className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                      useDate === todayStr
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Hôm nay
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                  Người sử dụng / Bàn:
                </label>
                <input
                  type="text"
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  placeholder="VD: Chủ quán, Quản lý, Bàn VIP..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Quick Target Preset Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500 mr-1">Chọn nhanh:</span>
              {PRESET_TARGETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetUser(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    targetUser === preset
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Optional Note */}
            <div>
              <input
                type="text"
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
                placeholder="Ghi chú thêm (VD: Chủ tiếp khách Bàn 05, Họp nhân viên...)"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {/* Selected Items List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Danh sách Bia & Món đã chọn ({draftItems.length} món · Tổng SL:{' '}
                  {draftSummary.totalQty})
                </span>
                {draftItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraftItems([])}
                    className="text-xs text-rose-600 hover:underline cursor-pointer"
                  >
                    Xóa hết
                  </button>
                )}
              </div>

              {draftItems.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-xs text-slate-500">
                  Chưa có bia hoặc món ăn nào trong phiếu. Hãy bấm chọn món ở cột bên trái.
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                  {draftItems.map((it) => (
                    <div
                      key={it.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {it.productName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {it.category} · Thành tiền:{' '}
                            <strong className="text-indigo-600 dark:text-indigo-400">
                              0đ (Không tính tiền)
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateDraftQty(it.id, it.quantity - 1)}
                            className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) =>
                              handleUpdateDraftQty(
                                it.id,
                                Math.max(1, parseInt(e.target.value, 10) || 1)
                              )
                            }
                            className="w-14 py-1 text-center text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateDraftQty(it.id, it.quantity + 1)}
                            className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftItem(it.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Xóa món"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={it.note}
                        onChange={(e) => handleUpdateDraftNote(it.id, e.target.value)}
                        placeholder="Ghi chú riêng cho món này (tùy chọn)..."
                        className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Summary & Submit Action */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tổng số lượng cộng vào SL Bán:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +{draftSummary.totalQty} (Đồ uống: {draftSummary.bevQty} · Món ăn:{' '}
                  {draftSummary.foodQty})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Giá trị menu tham khảo:</span>
                <span className="font-mono text-slate-500 line-through">
                  {formatVND(draftSummary.referenceValue)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200 dark:border-slate-800 text-sm font-bold">
                <span className="text-slate-900 dark:text-white">
                  Thành tiền tính vào Doanh thu:
                </span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">
                  0đ (Không tính tiền)
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={!canWrite || draftItems.length === 0 || isSaving}
              onClick={handleSaveSlip}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Đang lưu phiếu...'
                  : `Lưu Phiếu Chủ / Quản Lý Sử Dụng (+${draftSummary.totalQty} SL bán · 0đ)`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Period Filter & History / Analytics of Owner & Manager Use */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Thống Kê & Lịch Sử Bia / Món Chủ & Quản Lý Đã Sử Dụng
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Toàn bộ số lượng bên dưới đã được cộng vào mục <strong>Số lượng theo Danh mục</strong>{' '}
              và trừ trực tiếp vào <strong>Kho Đồ Uống</strong> với giá trị doanh thu = 0đ
            </p>
          </div>

          {/* Period Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'today', label: 'Hôm nay' },
                { id: 'yesterday', label: 'Hôm qua' },
                { id: 'single_date', label: 'Theo ngày' },
                { id: 'week', label: 'Tuần này' },
                { id: 'month', label: 'Tháng này' },
                { id: 'custom_range', label: 'Khoảng ngày' },
                { id: 'all', label: 'Tất cả' },
              ] as { id: FilterPeriodMode; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodMode(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  periodMode === p.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conditional Date Inputs */}
        {periodMode === 'single_date' && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-slate-500">Chọn ngày xem:</span>
            <button
              type="button"
              onClick={() => setSingleDate(shiftDateByDays(singleDate, -1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer"
            >
              ◀ Hôm trước
            </button>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={() => setSingleDate(shiftDateByDays(singleDate, 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer"
            >
              Hôm sau ▶
            </button>
          </div>
        )}

        {periodMode === 'custom_range' && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span>Từ ngày:</span>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <span>Đến ngày:</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        )}

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
            <div className="text-xs text-slate-500">Số phiếu Chủ / QL dùng</div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white">
              {historyStats.slipsCount} phiếu
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Tổng {historyStats.totalQty} phần/lon đã xuất
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
            <div className="text-xs text-slate-500">SL Bia & Nước ngọt đã dùng</div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {historyStats.bevQty} lon/chai
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Đã cộng SL bán & trừ Tồn kho
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
            <div className="text-xs text-slate-500">SL Món ăn đã dùng</div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {historyStats.foodQty} phần/món
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Đã cộng vào Số lượng bán
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20">
            <div className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              Thành tiền tính Doanh thu
            </div>
            <div className="mt-1 text-lg sm:text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              0 ₫
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-slate-500">
              Giá menu tham khảo: {formatVND(historyStats.refTotalMoney)}
            </div>
          </div>
        </div>

        {/* View Switcher + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setHistoryViewMode('by_slip')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                historyViewMode === 'by_slip'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Danh sách Phiếu ({ownerUseBills.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryViewMode('by_item')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                historyViewMode === 'by_item'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tổng hợp theo Món ({aggregatedItems.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Tìm tên món, người dùng, ngày..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Table Content */}
        {historyViewMode === 'by_slip' ? (
          ownerUseBills.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              Chưa có phiếu Chủ / Quản lý sử dụng nào trong kỳ đang chọn.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Ngày sử dụng</th>
                    <th className="py-2.5 px-3">Người dùng / Đối tượng</th>
                    <th className="py-2.5 px-3">Chi tiết Bia & Món ăn (Tính vào SL bán)</th>
                    <th className="py-2.5 px-3 text-right">Tổng SL</th>
                    <th className="py-2.5 px-3 text-right">Thành tiền</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  {ownerUseBills.map((b) => {
                    const bItems = billItems.filter((it) => it.billId === b.id);
                    const totalQty = bItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
                    const targetName = extractOwnerUseTarget(b);
                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {formatDateDMY(b.billDate)}
                          </div>
                          <div className="text-[11px] text-slate-500">{b.billCode}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300">
                            {targetName}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {b.itemsSummary}
                          </div>
                          {b.note && (
                            <div className="text-[11px] text-slate-500 mt-0.5">{b.note}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          +{totalQty}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                          0 ₫
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {onInspectBill && (
                              <button
                                type="button"
                                onClick={() => onInspectBill(b)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer inline-flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem</span>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() =>
                                  requestConfirm({
                                    title: 'Xóa Phiếu Chủ / Quản Lý Sử Dụng',
                                    message: `Bạn có chắc chắn muốn xóa phiếu "${b.billCode}" (${b.itemsSummary}) không? Số lượng bán và tồn kho sẽ được hoàn lại tự động.`,
                                    confirmLabel: 'Xóa phiếu này',
                                    variant: 'danger',
                                    onConfirm: async () => {
                                      await onDeleteBill(b);
                                    },
                                  })
                                }
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                title="Xóa phiếu"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : aggregatedItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            Chưa có dữ liệu mặt hàng Chủ / Quản lý sử dụng trong kỳ đang chọn.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">Tên Bia / Món ăn</th>
                  <th className="py-2.5 px-3">Danh mục</th>
                  <th className="py-2.5 px-3 text-right">Số lần xuất</th>
                  <th className="py-2.5 px-3 text-right">Tổng SL đã dùng (Tính vào SL bán)</th>
                  <th className="py-2.5 px-3 text-right">Giá trị tham khảo</th>
                  <th className="py-2.5 px-3 text-right">Thành tiền Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {aggregatedItems.map((row) => (
                  <tr
                    key={row.productName}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                      {row.productName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      {row.category}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {row.slipsCount} lần
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {row.totalQty} {row.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400 line-through">
                      {formatVND(row.refTotalValue)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      0 ₫
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
