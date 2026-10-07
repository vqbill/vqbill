import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Plus,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Check,
  Settings2,
  Trash2,
  ArrowRight,
  Calendar,
  FileText,
  X,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  BillRecord,
  BillItemRecord,
  ProductRecord,
  ReturnRecord,
  WorkspaceInventoryData,
  InventoryItemConfig,
  DailyInventoryEntry,
  InventoryImportLog,
  ConfirmRequestOptions,
} from '../types';
import {
  formatVND,
  formatNumber,
  formatDateDMY,
  shiftDateByDays,
  inferUnit,
} from '../utils/parser';

interface BeverageInventoryTabProps {
  bills: BillRecord[];
  billItems: BillItemRecord[];
  products: ProductRecord[];
  returns: ReturnRecord[];
  categories: string[];
  inventoryData: WorkspaceInventoryData;
  todayBusinessStr: string;
  yesterdayBusinessStr: string;
  canWrite: boolean;
  canDelete: boolean;
  currentUsername: string;
  onSaveInventoryData: (nextData: WorkspaceInventoryData, toastMsg?: string) => Promise<void>;
  onAddOrUpdateProduct?: (prod: {
    id?: string;
    productName: string;
    category: string;
    unitPrice: number;
    unit: string;
  }) => Promise<void>;
  onAddExpenseDeduction?: (payload: {
    deductionDate: string;
    productName: string;
    category: string;
    amount: number;
    note: string;
  }) => Promise<void>;
  requestConfirm: (opts: ConfirmRequestOptions) => void;
}

interface ComputedInventoryRow {
  productKey: string;
  productName: string;
  category: string;
  unit: string;
  unitPrice: number;
  packSize: number;
  minStockThreshold: number;
  costPrice: number;
  openingStock: number;
  importedQty: number;
  grossSoldQty: number;
  returnedQty: number;
  netSoldQty: number;
  damagedQty: number;
  expectedClosingStock: number;
  actualClosingStock: number | null;
  discrepancy: number | null;
  discrepancyValue: number;
  stockRetailValue: number;
  stockCostValue: number;
  isOutOfStock: boolean;
  isLowStock: boolean;
  hasActivity: boolean;
  note: string;
}

function formatPackBreakdown(qty: number, packSize: number, unit: string): string {
  if (!packSize || packSize <= 1 || qty === 0) {
    return `${formatNumber(qty)} ${unit}`;
  }
  const absQty = Math.abs(qty);
  const sign = qty < 0 ? '-' : '';
  const packs = Math.floor(absQty / packSize);
  const remainder = absQty % packSize;
  const packLabel = unit.toLowerCase() === 'cái' ? 'bịch' : 'thùng';
  if (packs === 0) {
    return `${sign}${remainder} ${unit}`;
  }
  if (remainder === 0) {
    return `${sign}${packs} ${packLabel} (${formatNumber(absQty)} ${unit})`;
  }
  return `${sign}${packs} ${packLabel} + ${remainder} ${unit}`;
}

export const BeverageInventoryTab: React.FC<BeverageInventoryTabProps> = ({
  bills,
  billItems,
  products,
  returns,
  categories,
  inventoryData,
  todayBusinessStr,
  yesterdayBusinessStr,
  canWrite,
  canDelete,
  currentUsername,
  onSaveInventoryData,
  onAddOrUpdateProduct,
  onAddExpenseDeduction,
  requestConfirm,
}) => {
  // Date filter state (defaults to today's business shift date)
  const [selectedDate, setSelectedDate] = useState<string>(todayBusinessStr);

  // Filter & display options
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyActiveItems, setOnlyActiveItems] = useState<boolean>(false);
  const [onlyAlertOrDiscrepancy, setOnlyAlertOrDiscrepancy] = useState<boolean>(false);
  const [showPackConversion, setShowPackConversion] = useState<boolean>(true);
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
  const [showAllLogDates, setShowAllLogDates] = useState<boolean>(false);

  // Category collapse states (expanded by default in Inventory for quick counting, with collapse/expand all buttons)
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  // Quick Import Modal / Drawer state
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importProductKey, setImportProductKey] = useState<string>('');
  const [isNewBeverageMode, setIsNewBeverageMode] = useState<boolean>(false);
  const [newBevName, setNewBevName] = useState<string>('');
  const [newBevCategory, setNewBevCategory] = useState<string>('Bia');
  const [newBevUnitPrice, setNewBevUnitPrice] = useState<string>('22000');
  const [newBevUnit, setNewBevUnit] = useState<string>('Lon');
  const [importType, setImportType] = useState<'import' | 'damaged' | 'adjust_opening'>('import');
  const [importPacks, setImportPacks] = useState<string>('2');
  const [importLoose, setImportLoose] = useState<string>('0');
  const [importTotalCost, setImportTotalCost] = useState<string>('');
  const [importNote, setImportNote] = useState<string>('');
  const [autoRecordExpense, setAutoRecordExpense] = useState<boolean>(false);

  // Item Config Edit Modal state (packSize, minStockThreshold, costPrice)
  const [editingConfigRow, setEditingConfigRow] = useState<ComputedInventoryRow | null>(null);
  const [cfgPackSize, setCfgPackSize] = useState<string>('24');
  const [cfgMinStock, setCfgMinStock] = useState<string>('24');
  const [cfgCostPrice, setCfgCostPrice] = useState<string>('0');

  // Zalo Report Modal state
  const [showZaloReportModal, setShowZaloReportModal] = useState<boolean>(false);
  const [copiedZalo, setCopiedZalo] = useState<boolean>(false);

  // All available categories
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

  // Selected tracked categories (defaults to inventoryData.trackedCategories or ['Bia', 'Nước ngọt'])
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    const saved = inventoryData?.trackedCategories;
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return ['Bia', 'Nước ngọt'];
  });

  useEffect(() => {
    if (
      Array.isArray(inventoryData?.trackedCategories) &&
      inventoryData.trackedCategories.length > 0
    ) {
      setSelectedCategories((prev) => {
        const merged = Array.from(
          new Set([...prev, ...inventoryData.trackedCategories])
        ).filter((c) => allCategories.some((ac) => ac.toLowerCase() === c.toLowerCase()));
        return merged.length > 0 ? merged : inventoryData.trackedCategories;
      });
    }
  }, [inventoryData?.trackedCategories, allCategories]);

  const handleToggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const exists = prev.includes(cat);
      const next = exists ? prev.filter((c) => c !== cat) : [...prev, cat];
      const finalCats = next.length > 0 ? next : ['Bia', 'Nước ngọt'];
      onSaveInventoryData({
        ...inventoryData,
        trackedCategories: finalCats,
        updatedAtMs: Date.now(),
      });
      return finalCats;
    });
  };

  const handleSelectBeverageOnly = () => {
    const bevCats = allCategories.filter((c) =>
      /(bia|nước ngọt|nuoc ngot|đồ uống|do uong|rượu|ruou|nước)/i.test(c)
    );
    const next = bevCats.length > 0 ? bevCats : ['Bia', 'Nước ngọt'];
    setSelectedCategories(next);
    onSaveInventoryData({
      ...inventoryData,
      trackedCategories: next,
      updatedAtMs: Date.now(),
    });
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories(allCategories);
    onSaveInventoryData({
      ...inventoryData,
      trackedCategories: allCategories,
      updatedAtMs: Date.now(),
    });
  };

  const prevDateStr = useMemo(() => shiftDateByDays(selectedDate, -1), [selectedDate]);
  const nextDateStr = useMemo(() => shiftDateByDays(selectedDate, 1), [selectedDate]);

  // Map product name -> category & metadata from catalog
  const productCatalogMap = useMemo(() => {
    const map = new Map<
      string,
      {
        productName: string;
        category: string;
        unitPrice: number;
        unit: string;
      }
    >();
    for (const p of products) {
      const cleanName = (p.productName || '').trim();
      if (!cleanName) continue;
      map.set(cleanName.toLowerCase(), {
        productName: cleanName,
        category: (p.category || 'Khác').trim(),
        unitPrice: Number(p.unitPrice) || 0,
        unit: (p.unit || inferUnit(cleanName, p.category || 'Khác')).trim(),
      });
    }
    return map;
  }, [products]);

  // Compute sold & returned quantities per product for any given date
  const computeSalesForDate = useMemo(() => {
    return (targetDate: string) => {
      const dateBillIds = new Set(
        bills.filter((b) => b.billDate === targetDate).map((b) => b.id)
      );
      const soldMap = new Map<
        string,
        {
          productName: string;
          category: string;
          unitPrice: number;
          grossSold: number;
          itemReturned: number;
        }
      >();

      for (const item of billItems) {
        if (!dateBillIds.has(item.billId) && item.billDate !== targetDate) continue;
        const cleanName = (item.productName || '').trim();
        if (!cleanName) continue;
        const pKey = cleanName.toLowerCase();
        const catInfo = productCatalogMap.get(pKey);
        const category = catInfo?.category || (item.category || 'Khác').trim();
        const cur = soldMap.get(pKey) || {
          productName: catInfo?.productName || cleanName,
          category,
          unitPrice: Number(item.unitPrice) || catInfo?.unitPrice || 0,
          grossSold: 0,
          itemReturned: 0,
        };
        cur.grossSold += Number(item.quantity) || 0;
        cur.itemReturned += Number(item.returnedQuantity) || 0;
        if (item.unitPrice > 0) cur.unitPrice = Number(item.unitPrice);
        soldMap.set(pKey, cur);
      }

      // Also check explicit return records for targetDate in case returnedQuantity wasn't synced on item
      const explicitReturnMap = new Map<string, number>();
      for (const ret of returns) {
        if (ret.billDate === targetDate || ret.returnDate === targetDate) {
          const pKey = (ret.productName || '').trim().toLowerCase();
          if (!pKey) continue;
          explicitReturnMap.set(
            pKey,
            (explicitReturnMap.get(pKey) || 0) + (Number(ret.quantity) || 0)
          );
        }
      }

      const finalMap = new Map<
        string,
        {
          productName: string;
          category: string;
          unitPrice: number;
          grossSold: number;
          returnedQty: number;
          netSold: number;
        }
      >();

      for (const [pKey, val] of soldMap.entries()) {
        const retQty = Math.max(val.itemReturned, explicitReturnMap.get(pKey) || 0);
        const netSold = Math.max(0, val.grossSold - retQty);
        finalMap.set(pKey, {
          productName: val.productName,
          category: val.category,
          unitPrice: val.unitPrice,
          grossSold: val.grossSold,
          returnedQty: retQty,
          netSold,
        });
      }

      return finalMap;
    };
  }, [bills, billItems, returns, productCatalogMap]);

  const salesForSelectedDate = useMemo(
    () => computeSalesForDate(selectedDate),
    [computeSalesForDate, selectedDate]
  );

  // Build all inventory rows for selectedCategories on selectedDate
  // STRICT RULE: Only products that exist in Upload Sản phẩm / Menu (`products` / `productCatalogMap`) are allowed in Inventory!
  const allInventoryRows = useMemo<ComputedInventoryRow[]>(() => {
    const selectedCatSet = new Set(
      selectedCategories.map((c) => c.trim().toLowerCase())
    );
    const dailyMap = inventoryData?.dailyEntries?.[selectedDate] || {};
    const configMap = inventoryData?.itemConfigs || {};

    const candidateKeys = new Set<string>();

    // Strictly include ONLY products present in Upload sản phẩm / Menu (`productCatalogMap`)
    for (const [pKey, prod] of productCatalogMap.entries()) {
      if (selectedCatSet.has(prod.category.toLowerCase())) {
        candidateKeys.add(pKey);
      }
    }

    const rows: ComputedInventoryRow[] = [];

    for (const pKey of candidateKeys) {
      const catProd = productCatalogMap.get(pKey);
      // Never allow an item in inventory if it is not in Upload sản phẩm / Menu
      if (!catProd) continue;

      const cfg = configMap[pKey];
      const sale = salesForSelectedDate.get(pKey);
      const entry = dailyMap[pKey];

      const productName = catProd.productName;
      const category = catProd.category;
      const unit = catProd.unit || cfg?.unit || inferUnit(productName, category);
      const unitPrice = catProd.unitPrice || sale?.unitPrice || 0;

      const isKetchupOrTowel = productName.toLowerCase().includes('khăn lạnh');
      const defaultPack =
        category === 'Bia' || category === 'Nước ngọt'
          ? isKetchupOrTowel
            ? 50
            : 24
          : 1;
      const packSize = Math.max(1, Number(cfg?.packSize) || defaultPack);
      const minStockThreshold =
        cfg?.minStockThreshold !== undefined
          ? Math.max(0, Number(cfg.minStockThreshold))
          : packSize;
      const costPrice = Math.max(
        0,
        Number(cfg?.costPrice) || Math.round(unitPrice * 0.72)
      );

      let openingStock = -1;

      // If current day has explicitly entered positive openingStock, use it
      if (
        entry?.openingStock !== undefined &&
        entry?.openingStock !== null &&
        Number(entry.openingStock) > 0
      ) {
        openingStock = Math.max(0, Number(entry.openingStock));
      }

      if (openingStock < 0) {
        // Auto-inherit from most recent recorded prior date (ClosingStock(D-1) -> OpeningStock(D))
        const allPriorDates = Object.keys(inventoryData?.dailyEntries || {})
          .filter((d) => d < selectedDate)
          .sort()
          .reverse();

        let foundPriorDate: string | null = null;
        let inheritedClosing = -1;

        for (const pDate of allPriorDates) {
          const pe = inventoryData?.dailyEntries?.[pDate]?.[pKey];
          if (
            pe &&
            ((pe.openingStock !== undefined && pe.openingStock !== null) ||
              (pe.importedQty !== undefined &&
                pe.importedQty !== null &&
                Number(pe.importedQty) > 0) ||
              (pe.actualClosingStock !== undefined && pe.actualClosingStock !== null))
          ) {
            foundPriorDate = pDate;
            if (pe.actualClosingStock !== null && pe.actualClosingStock !== undefined) {
              inheritedClosing = Math.max(0, Number(pe.actualClosingStock));
            } else {
              const peOpen = Math.max(0, Number(pe.openingStock) || 0);
              const peImp = Math.max(0, Number(pe.importedQty) || 0);
              const peDmg = Math.max(0, Number(pe.damagedQty) || 0);
              const peSale = computeSalesForDate(pDate).get(pKey);
              const peNetSold = peSale?.netSold || 0;
              inheritedClosing = Math.max(0, peOpen + peImp - peNetSold - peDmg);
            }
            break;
          }
        }

        if (inheritedClosing >= 0 && foundPriorDate) {
          // Deduct net sales on intermediate dates between foundPriorDate and selectedDate
          let intermediateSold = 0;
          for (const d of allPriorDates) {
            if (d > foundPriorDate && d < selectedDate) {
              const intSale = computeSalesForDate(d).get(pKey);
              intermediateSold += intSale?.netSold || 0;
            }
          }
          const finalInherited = Math.max(0, inheritedClosing - intermediateSold);

          // If entry has openingStock === 0, but finalInherited > 0 and was created by telegram or not manually entered, use finalInherited
          if (
            entry?.openingStock !== undefined &&
            entry?.openingStock !== null &&
            Number(entry.openingStock) === 0 &&
            finalInherited > 0 &&
            entry.updatedBy === 'Telegram User'
          ) {
            openingStock = finalInherited;
          } else if (entry?.openingStock !== undefined && entry?.openingStock !== null) {
            openingStock = Math.max(0, Number(entry.openingStock));
          } else {
            openingStock = finalInherited;
          }
        } else if (entry?.openingStock !== undefined && entry?.openingStock !== null) {
          openingStock = Math.max(0, Number(entry.openingStock));
        } else {
          openingStock = 0;
        }
      }

      const importedQty = Math.max(0, Number(entry?.importedQty) || 0);
      const damagedQty = Math.max(0, Number(entry?.damagedQty) || 0);
      const grossSoldQty = sale?.grossSold || 0;
      const returnedQty = sale?.returnedQty || 0;
      const netSoldQty = sale?.netSold || 0;

      // Công thức tồn kho chuẩn: Tồn đầu + Nhập mới - Thực bán (Đã bán - Hoàn trả) - Vỡ/Nội bộ
      const expectedClosingStock =
        openingStock + importedQty - netSoldQty - damagedQty;

      const actualClosingStock =
        entry?.actualClosingStock !== undefined &&
        entry?.actualClosingStock !== null
          ? Number(entry.actualClosingStock)
          : null;

      const discrepancy =
        actualClosingStock !== null
          ? actualClosingStock - expectedClosingStock
          : null;

      const discrepancyValue =
        discrepancy !== null ? discrepancy * unitPrice : 0;

      const effectiveStockForValue =
        actualClosingStock !== null ? actualClosingStock : expectedClosingStock;
      const stockRetailValue = Math.max(0, effectiveStockForValue) * unitPrice;
      const stockCostValue = Math.max(0, effectiveStockForValue) * costPrice;

      const isOutOfStock = effectiveStockForValue <= 0;
      const isLowStock =
        !isOutOfStock &&
        minStockThreshold > 0 &&
        effectiveStockForValue <= minStockThreshold;
      const hasActivity =
        openingStock > 0 ||
        importedQty > 0 ||
        grossSoldQty > 0 ||
        returnedQty > 0 ||
        damagedQty > 0 ||
        actualClosingStock !== null;

      rows.push({
        productKey: pKey,
        productName,
        category,
        unit,
        unitPrice,
        packSize,
        minStockThreshold,
        costPrice,
        openingStock,
        importedQty,
        grossSoldQty,
        returnedQty,
        netSoldQty,
        damagedQty,
        expectedClosingStock,
        actualClosingStock,
        discrepancy,
        discrepancyValue,
        stockRetailValue,
        stockCostValue,
        isOutOfStock,
        isLowStock,
        hasActivity,
        note: entry?.note || '',
      });
    }

    return rows.sort((a, b) => {
      if (a.category !== b.category) {
        if (a.category === 'Bia') return -1;
        if (b.category === 'Bia') return 1;
        if (a.category === 'Nước ngọt') return -1;
        if (b.category === 'Nước ngọt') return 1;
        return a.category.localeCompare(b.category);
      }
      return b.netSoldQty - a.netSoldQty || a.productName.localeCompare(b.productName);
    });
  }, [
    selectedCategories,
    inventoryData,
    selectedDate,
    productCatalogMap,
    salesForSelectedDate,
  ]);

  // Filtered rows based on checkboxes & search query
  const filteredRows = useMemo(() => {
    return allInventoryRows.filter((row) => {
      if (onlyActiveItems && !row.hasActivity) return false;
      if (
        onlyAlertOrDiscrepancy &&
        !row.isOutOfStock &&
        !row.isLowStock &&
        (row.discrepancy === null || row.discrepancy === 0)
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          row.productName.toLowerCase().includes(q) ||
          row.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allInventoryRows, onlyActiveItems, onlyAlertOrDiscrepancy, searchQuery]);

  // Overall KPI metrics for the selected categories on selectedDate
  const summaryStats = useMemo(() => {
    let totalOpening = 0;
    let totalImported = 0;
    let totalGrossSold = 0;
    let totalReturned = 0;
    let totalNetSold = 0;
    let totalDamaged = 0;
    let totalExpectedClosing = 0;
    let totalRetailValue = 0;
    let totalCostValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let countedItemsCount = 0;
    let matchedItemsCount = 0;
    let discrepancyItemsCount = 0;
    let netDiscrepancyUnits = 0;
    let netDiscrepancyMoney = 0;

    for (const r of allInventoryRows) {
      totalOpening += r.openingStock;
      totalImported += r.importedQty;
      totalGrossSold += r.grossSoldQty;
      totalReturned += r.returnedQty;
      totalNetSold += r.netSoldQty;
      totalDamaged += r.damagedQty;
      totalExpectedClosing += r.expectedClosingStock;
      totalRetailValue += r.stockRetailValue;
      totalCostValue += r.stockCostValue;
      if (r.isOutOfStock) outOfStockCount++;
      else if (r.isLowStock) lowStockCount++;

      if (r.actualClosingStock !== null) {
        countedItemsCount++;
        if (r.discrepancy === 0) {
          matchedItemsCount++;
        } else if (r.discrepancy !== null) {
          discrepancyItemsCount++;
          netDiscrepancyUnits += r.discrepancy;
          netDiscrepancyMoney += r.discrepancyValue;
        }
      }
    }

    return {
      totalOpening,
      totalImported,
      totalSupply: totalOpening + totalImported,
      totalGrossSold,
      totalReturned,
      totalNetSold,
      totalDamaged,
      totalExpectedClosing,
      totalRetailValue,
      totalCostValue,
      lowStockCount,
      outOfStockCount,
      countedItemsCount,
      matchedItemsCount,
      discrepancyItemsCount,
      netDiscrepancyUnits,
      netDiscrepancyMoney,
    };
  }, [allInventoryRows]);

  // Update a single daily field for a product
  const handleUpdateDailyField = (
    row: ComputedInventoryRow,
    field: 'openingStock' | 'importedQty' | 'damagedQty' | 'actualClosingStock',
    rawValue: number | null
  ) => {
    if (!canWrite) return;
    const now = Date.now();
    const curDateMap = { ...(inventoryData.dailyEntries?.[selectedDate] || {}) };
    const existing: DailyInventoryEntry = curDateMap[row.productKey] || {
      openingStock: row.openingStock,
      importedQty: row.importedQty,
      damagedQty: row.damagedQty,
      actualClosingStock: row.actualClosingStock,
      updatedAtMs: now,
    };

    const updatedEntry: DailyInventoryEntry = {
      ...existing,
      [field]:
        field === 'actualClosingStock'
          ? rawValue === null || Number.isNaN(rawValue)
            ? null
            : Math.max(0, Math.round(rawValue))
          : Math.max(0, Math.round(Number(rawValue) || 0)),
      updatedAtMs: now,
      updatedBy: currentUsername,
    };

    curDateMap[row.productKey] = updatedEntry;

    onSaveInventoryData({
      ...inventoryData,
      dailyEntries: {
        ...(inventoryData.dailyEntries || {}),
        [selectedDate]: curDateMap,
      },
      updatedAtMs: now,
    });
  };

  // Quick "+1 Pack" button on row
  const handleQuickAddPack = (
    row: ComputedInventoryRow,
    targetField: 'openingStock' | 'importedQty'
  ) => {
    if (!canWrite) return;
    const addQty = row.packSize || 24;
    const nextVal =
      targetField === 'openingStock'
        ? row.openingStock + addQty
        : row.importedQty + addQty;

    const now = Date.now();
    const curDateMap = { ...(inventoryData.dailyEntries?.[selectedDate] || {}) };
    const existing: DailyInventoryEntry = curDateMap[row.productKey] || {
      openingStock: row.openingStock,
      importedQty: row.importedQty,
      damagedQty: row.damagedQty,
      actualClosingStock: row.actualClosingStock,
      updatedAtMs: now,
    };

    curDateMap[row.productKey] = {
      ...existing,
      [targetField]: nextVal,
      updatedAtMs: now,
      updatedBy: currentUsername,
    };

    const nextLogs = [...(inventoryData.importLogs || [])];
    if (targetField === 'importedQty') {
      nextLogs.unshift({
        id: `inv_log_${now}_${Math.random().toString(36).slice(2, 6)}`,
        date: selectedDate,
        createdAtMs: now,
        productName: row.productName,
        category: row.category,
        type: 'import',
        quantity: addQty,
        packCount: 1,
        packSize: row.packSize,
        unitCost: row.costPrice,
        totalCost: addQty * row.costPrice,
        supplierOrNote: `Nhập nhanh +1 thùng (${addQty} ${row.unit})`,
        createdBy: currentUsername,
      });
    }

    onSaveInventoryData(
      {
        ...inventoryData,
        dailyEntries: {
          ...(inventoryData.dailyEntries || {}),
          [selectedDate]: curDateMap,
        },
        importLogs: nextLogs,
        updatedAtMs: now,
      },
      targetField === 'importedQty'
        ? `Đã cộng nhanh +1 thùng (${addQty} ${row.unit}) ${row.productName} vào Nhập kho ngày ${formatDateDMY(selectedDate)}!`
        : `Đã cộng +${addQty} ${row.unit} vào Tồn đầu của ${row.productName}!`
    );
  };

  // Carry over yesterday's closing stock -> today's opening stock
  const handleCarryOverFromPrevDay = () => {
    if (!canWrite) return;
    requestConfirm({
      title: `Kế Thừa Tồn Cuối Ngày ${formatDateDMY(prevDateStr)} Sang Tồn Đầu Ngày ${formatDateDMY(selectedDate)}`,
      message: `Hệ thống sẽ lấy Tồn cuối thực tế (hoặc Tồn cuối sổ sách nếu chưa kiểm đếm tay) của ngày ${formatDateDMY(prevDateStr)} để điền tự động vào cột "Tồn Đầu Ca" ngày ${formatDateDMY(selectedDate)} cho ${allInventoryRows.length} mặt hàng đang theo dõi. Bạn có chắc chắn muốn thực hiện không?`,
      confirmLabel: 'Xác nhận Kế thừa Tồn đầu',
      variant: 'primary',
      onConfirm: async () => {
        const now = Date.now();
        const prevSalesMap = computeSalesForDate(prevDateStr);
        const prevEntriesMap = inventoryData.dailyEntries?.[prevDateStr] || {};
        const curDateMap = { ...(inventoryData.dailyEntries?.[selectedDate] || {}) };

        let updatedCount = 0;
        for (const row of allInventoryRows) {
          const prevEntry = prevEntriesMap[row.productKey];
          const prevSale = prevSalesMap.get(row.productKey);
          const prevOpen = Number(prevEntry?.openingStock) || 0;
          const prevImp = Number(prevEntry?.importedQty) || 0;
          const prevDmg = Number(prevEntry?.damagedQty) || 0;
          const prevNetSold = prevSale?.netSold || 0;
          const prevExpectedClosing = Math.max(
            0,
            prevOpen + prevImp - prevNetSold - prevDmg
          );
          const prevClosing =
            prevEntry?.actualClosingStock !== undefined &&
            prevEntry?.actualClosingStock !== null
              ? Math.max(0, Number(prevEntry.actualClosingStock))
              : prevExpectedClosing;

          const existingCur = curDateMap[row.productKey] || {
            openingStock: 0,
            importedQty: 0,
            damagedQty: 0,
            actualClosingStock: null,
            updatedAtMs: now,
          };

          curDateMap[row.productKey] = {
            ...existingCur,
            openingStock: prevClosing,
            updatedAtMs: now,
            updatedBy: currentUsername,
          };
          updatedCount++;
        }

        await onSaveInventoryData(
          {
            ...inventoryData,
            dailyEntries: {
              ...(inventoryData.dailyEntries || {}),
              [selectedDate]: curDateMap,
            },
            updatedAtMs: now,
          },
          `Đã kế thừa tồn cuối ngày ${formatDateDMY(prevDateStr)} sang Tồn đầu ngày ${formatDateDMY(selectedDate)} cho ${updatedCount} mặt hàng!`
        );
      },
    });
  };

  // Match all actual closing stock = expected closing stock
  const handleMatchAllActualToExpected = () => {
    if (!canWrite) return;
    requestConfirm({
      title: 'Xác Nhận Khớp Toàn Bộ Kiểm Thực Tế = Tồn Sổ Sách',
      message: `Điền tự động cột "Kiểm thực tế cuối ca" bằng đúng số "Tồn cuối sổ sách" cho toàn bộ ${filteredRows.length} mặt hàng đang hiển thị trong ngày ${formatDateDMY(selectedDate)}?`,
      confirmLabel: 'Khớp tất cả tồn kho',
      variant: 'primary',
      onConfirm: async () => {
        const now = Date.now();
        const curDateMap = { ...(inventoryData.dailyEntries?.[selectedDate] || {}) };
        for (const row of filteredRows) {
          const existing = curDateMap[row.productKey] || {
            openingStock: row.openingStock,
            importedQty: row.importedQty,
            damagedQty: row.damagedQty,
            actualClosingStock: null,
            updatedAtMs: now,
          };
          curDateMap[row.productKey] = {
            ...existing,
            actualClosingStock: Math.max(0, row.expectedClosingStock),
            updatedAtMs: now,
            updatedBy: currentUsername,
          };
        }

        await onSaveInventoryData(
          {
            ...inventoryData,
            dailyEntries: {
              ...(inventoryData.dailyEntries || {}),
              [selectedDate]: curDateMap,
            },
            updatedAtMs: now,
          },
          `Đã chốt khớp tồn kho thực tế cuối ca cho ${filteredRows.length} mặt hàng!`
        );
      },
    });
  };

  // Open Quick Import Modal
  const handleOpenImportModal = (preselectRow?: ComputedInventoryRow) => {
    const firstRow = preselectRow || allInventoryRows[0];
    setIsNewBeverageMode(false);
    setImportProductKey(firstRow ? firstRow.productKey : '');
    setImportType('import');
    setImportPacks('2');
    setImportLoose('0');
    const packSz = firstRow?.packSize || 24;
    const defaultCost = firstRow?.costPrice ? String(2 * packSz * firstRow.costPrice) : '';
    setImportTotalCost(defaultCost);
    setImportNote('');
    setAutoRecordExpense(false);
    setShowImportModal(true);
  };

  const selectedImportRow = useMemo(
    () => allInventoryRows.find((r) => r.productKey === importProductKey) || null,
    [allInventoryRows, importProductKey]
  );

  // Submit Quick Import / Stock Adjustment Form
  const handleSubmitImportModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;

    let targetKey = importProductKey;
    let targetName = selectedImportRow?.productName || '';
    let targetCategory = selectedImportRow?.category || 'Bia';
    let targetUnit = selectedImportRow?.unit || 'Lon';
    let targetPackSize = selectedImportRow?.packSize || 24;
    let targetCostPrice = selectedImportRow?.costPrice || 0;

    if (isNewBeverageMode) {
      const cleanNewName = newBevName.trim();
      if (!cleanNewName) return;
      targetKey = cleanNewName.toLowerCase();
      targetName = cleanNewName;
      targetCategory = newBevCategory.trim() || 'Bia';
      targetUnit = newBevUnit.trim() || 'Lon';
      targetPackSize = 24;
      const sellPrice = Math.max(0, Number(newBevUnitPrice) || 20000);
      targetCostPrice = Math.round(sellPrice * 0.72);

      if (onAddOrUpdateProduct) {
        await onAddOrUpdateProduct({
          productName: targetName,
          category: targetCategory,
          unitPrice: sellPrice,
          unit: targetUnit,
        });
      }
    }

    if (!targetKey || !targetName) return;

    const packs = Math.max(0, Math.round(Number(importPacks) || 0));
    const loose = Math.max(0, Math.round(Number(importLoose) || 0));
    const totalQty = packs * targetPackSize + loose;
    if (totalQty <= 0) return;

    const totalCostNum = Math.max(0, Math.round(Number(importTotalCost) || 0));
    const unitCostNum =
      totalCostNum > 0 ? Math.round(totalCostNum / totalQty) : targetCostPrice;

    const now = Date.now();
    const curDateMap = { ...(inventoryData.dailyEntries?.[selectedDate] || {}) };
    const existingEntry: DailyInventoryEntry = curDateMap[targetKey] || {
      openingStock: selectedImportRow?.openingStock || 0,
      importedQty: selectedImportRow?.importedQty || 0,
      damagedQty: selectedImportRow?.damagedQty || 0,
      actualClosingStock: selectedImportRow?.actualClosingStock ?? null,
      updatedAtMs: now,
    };

    const nextEntry: DailyInventoryEntry = {
      ...existingEntry,
      updatedAtMs: now,
      updatedBy: currentUsername,
    };

    if (importType === 'import') {
      nextEntry.importedQty = (existingEntry.importedQty || 0) + totalQty;
    } else if (importType === 'damaged') {
      nextEntry.damagedQty = (existingEntry.damagedQty || 0) + totalQty;
    } else if (importType === 'adjust_opening') {
      nextEntry.openingStock = (existingEntry.openingStock || 0) + totalQty;
    }

    curDateMap[targetKey] = nextEntry;

    const nextConfigs = { ...(inventoryData.itemConfigs || {}) };
    if (!nextConfigs[targetKey]) {
      nextConfigs[targetKey] = {
        productName: targetName,
        category: targetCategory,
        unit: targetUnit,
        packSize: targetPackSize,
        minStockThreshold: targetPackSize,
        costPrice: unitCostNum,
      };
    } else if (unitCostNum > 0) {
      nextConfigs[targetKey] = {
        ...nextConfigs[targetKey],
        costPrice: unitCostNum,
      };
    }

    const newLog: InventoryImportLog = {
      id: `inv_log_${now}_${Math.random().toString(36).slice(2, 6)}`,
      date: selectedDate,
      createdAtMs: now,
      productName: targetName,
      category: targetCategory,
      type: importType,
      quantity: totalQty,
      packCount: packs > 0 ? packs : undefined,
      packSize: targetPackSize,
      unitCost: unitCostNum,
      totalCost: totalCostNum,
      supplierOrNote:
        importNote.trim() ||
        (importType === 'import'
          ? `Nhập kho ${packs > 0 ? `${packs} thùng ` : ''}${loose > 0 ? `+ ${loose} ${targetUnit}` : ''}`.trim()
          : importType === 'damaged'
          ? `Xuất hủy / Vỡ / Nội bộ (${totalQty} ${targetUnit})`
          : `Bổ sung tồn đầu ca (${totalQty} ${targetUnit})`),
      createdBy: currentUsername,
    };

    const nextTrackedCats = selectedCategories.includes(targetCategory)
      ? selectedCategories
      : [...selectedCategories, targetCategory];

    await onSaveInventoryData(
      {
        ...inventoryData,
        trackedCategories: nextTrackedCats,
        itemConfigs: nextConfigs,
        dailyEntries: {
          ...(inventoryData.dailyEntries || {}),
          [selectedDate]: curDateMap,
        },
        importLogs: [newLog, ...(inventoryData.importLogs || [])],
        updatedAtMs: now,
      },
      `Đã lưu phiếu ${
        importType === 'import'
          ? 'Nhập kho'
          : importType === 'damaged'
          ? 'Báo vỡ/Nội bộ'
          : 'Bổ sung tồn đầu'
      }: +${totalQty} ${targetUnit} ${targetName}!`
    );

    if (
      importType === 'import' &&
      autoRecordExpense &&
      totalCostNum > 0 &&
      onAddExpenseDeduction
    ) {
      await onAddExpenseDeduction({
        deductionDate: selectedDate,
        productName: `Nhập kho ${targetName} (${totalQty} ${targetUnit})`,
        category: 'Nhập đồ uống / Kho',
        amount: totalCostNum,
        note:
          importNote.trim() ||
          `Chi tiền mặt trả tiền nhập ${totalQty} ${targetUnit} ${targetName}`,
      });
    }

    setShowImportModal(false);
  };

  // Delete an import log and roll back its quantity on that date
  const handleDeleteImportLog = (log: InventoryImportLog) => {
    if (!canDelete && !canWrite) return;
    requestConfirm({
      title: 'Xóa Phiếu Nhập / Xuất Kho',
      message: `Bạn có chắc chắn muốn xóa phiếu "${log.productName} (${formatNumber(log.quantity)})" ngày ${formatDateDMY(log.date)}? Số lượng tương ứng sẽ được hoàn tác khỏi bảng tồn kho ngày ${formatDateDMY(log.date)}.`,
      confirmLabel: 'Xóa phiếu & Hoàn tác SL',
      variant: 'danger',
      onConfirm: async () => {
        const now = Date.now();
        const pKey = log.productName.trim().toLowerCase();
        const dateMap = { ...(inventoryData.dailyEntries?.[log.date] || {}) };
        const curEntry = dateMap[pKey];

        if (curEntry) {
          const updated: DailyInventoryEntry = { ...curEntry, updatedAtMs: now };
          if (log.type === 'import') {
            updated.importedQty = Math.max(0, (curEntry.importedQty || 0) - log.quantity);
          } else if (log.type === 'damaged') {
            updated.damagedQty = Math.max(0, (curEntry.damagedQty || 0) - log.quantity);
          } else if (log.type === 'adjust_opening') {
            updated.openingStock = Math.max(0, (curEntry.openingStock || 0) - log.quantity);
          }
          dateMap[pKey] = updated;
        }

        await onSaveInventoryData(
          {
            ...inventoryData,
            dailyEntries: {
              ...(inventoryData.dailyEntries || {}),
              [log.date]: dateMap,
            },
            importLogs: (inventoryData.importLogs || []).filter((l) => l.id !== log.id),
            updatedAtMs: now,
          },
          `Đã xóa phiếu kho ${log.productName} và cập nhật lại số tồn!`
        );
      },
    });
  };

  // Save per-item packSize, minStockThreshold, costPrice config
  const handleSaveItemConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConfigRow || !canWrite) return;
    const now = Date.now();
    const packSize = Math.max(1, Math.round(Number(cfgPackSize) || 24));
    const minStockThreshold = Math.max(0, Math.round(Number(cfgMinStock) || 0));
    const costPrice = Math.max(0, Math.round(Number(cfgCostPrice) || 0));

    const nextConfigs: Record<string, InventoryItemConfig> = {
      ...(inventoryData.itemConfigs || {}),
      [editingConfigRow.productKey]: {
        productName: editingConfigRow.productName,
        category: editingConfigRow.category,
        unit: editingConfigRow.unit,
        packSize,
        minStockThreshold,
        costPrice,
      },
    };

    await onSaveInventoryData(
      {
        ...inventoryData,
        itemConfigs: nextConfigs,
        updatedAtMs: now,
      },
      `Đã lưu quy cách (${packSize} ${editingConfigRow.unit}/thùng) & định mức cảnh báo cho ${editingConfigRow.productName}!`
    );
    setEditingConfigRow(null);
  };

  // Logs for selected date (strictly only for products present in Upload sản phẩm / Menu)
  const logsForSelectedDate = useMemo(() => {
    return (inventoryData.importLogs || [])
      .filter((l) => {
        if (!showAllLogDates && l.date !== selectedDate) return false;
        const pKey = (l.productName || '').trim().toLowerCase();
        return productCatalogMap.has(pKey);
      })
      .map((l) => {
        const pKey = (l.productName || '').trim().toLowerCase();
        const catProd = productCatalogMap.get(pKey);
        if (catProd && (catProd.category !== l.category || catProd.productName !== l.productName)) {
          return {
            ...l,
            productName: catProd.productName,
            category: catProd.category,
          };
        }
        return l;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [inventoryData.importLogs, selectedDate, productCatalogMap, showAllLogDates]);

  // Group filtered rows by category
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, ComputedInventoryRow[]>();
    for (const c of selectedCategories) {
      map.set(c, []);
    }
    for (const r of filteredRows) {
      if (!map.has(r.category)) {
        map.set(r.category, []);
      }
      map.get(r.category)!.push(r);
    }
    return Array.from(map.entries()).filter(([, rows]) => rows.length > 0);
  }, [filteredRows, selectedCategories]);

  // Build formatted Zalo text report
  const zaloReportText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`📋 BÁO CÁO KIỂM KHO ĐỒ UỐNG & TỒN KHO`);
    lines.push(`📅 Ca ngày: ${formatDateDMY(selectedDate)}`);
    lines.push(`Danh mục: ${selectedCategories.join(', ')}`);
    lines.push(`--------------------------------`);
    lines.push(
      `• Tổng Nguồn (Tồn đầu + Nhập): ${formatNumber(summaryStats.totalSupply)} (${formatNumber(summaryStats.totalOpening)} + ${formatNumber(summaryStats.totalImported)})`
    );
    lines.push(
      `• Thực Xuất Bán: ${formatNumber(summaryStats.totalNetSold)} (Bán ${formatNumber(summaryStats.totalGrossSold)} - Trả lại ${formatNumber(summaryStats.totalReturned)})`
    );
    if (summaryStats.totalDamaged > 0) {
      lines.push(`• Vỡ / Hủy / Nội bộ: ${formatNumber(summaryStats.totalDamaged)}`);
    }
    lines.push(`• Tồn Cuối Sổ Sách: ${formatNumber(summaryStats.totalExpectedClosing)}`);
    lines.push(`--------------------------------`);

    for (const [cat, rows] of groupedByCategory) {
      lines.push(`🔹 [${cat.toUpperCase()}]`);
      for (const r of rows) {
        const closingText = showPackConversion
          ? formatPackBreakdown(r.expectedClosingStock, r.packSize, r.unit)
          : `${r.expectedClosingStock} ${r.unit}`;
        const diffPart =
          r.actualClosingStock !== null
            ? r.discrepancy === 0
              ? ` | Thực tế: ${r.actualClosingStock} (Khớp)`
              : ` | Thực tế: ${r.actualClosingStock} (Lệch ${r.discrepancy! > 0 ? `+${r.discrepancy}` : r.discrepancy})`
            : '';
        const alertPart = r.isOutOfStock
          ? ' ⚠️ HẾT HÀNG'
          : r.isLowStock
          ? ' ⚠️ SẮP HẾT'
          : '';
        lines.push(
          `- ${r.productName}: Đầu ${r.openingStock} + Nhập ${r.importedQty} - Thực bán ${r.netSoldQty}${
            r.returnedQty > 0 ? ` (Trả ${r.returnedQty})` : ''
          } = Tồn ${closingText}${diffPart}${alertPart}`
        );
      }
    }

    const lowOrOutItems = allInventoryRows.filter((r) => r.isOutOfStock || r.isLowStock);
    if (lowOrOutItems.length > 0) {
      lines.push(`--------------------------------`);
      lines.push(`🚨 CẦN NHẬP THÊM (${lowOrOutItems.length} món):`);
      for (const item of lowOrOutItems) {
        lines.push(
          `• ${item.productName}: còn ${item.expectedClosingStock} ${item.unit} (Định mức tối thiểu: ${item.minStockThreshold} ${item.unit})`
        );
      }
    }

    return lines.join('\n');
  }, [
    selectedDate,
    selectedCategories,
    summaryStats,
    groupedByCategory,
    showPackConversion,
    allInventoryRows,
  ]);

  const handleCopyZaloReport = async () => {
    try {
      await navigator.clipboard.writeText(zaloReportText);
      setCopiedZalo(true);
      setTimeout(() => setCopiedZalo(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* SECTION 1: HEADER, DATE SELECTOR & CATEGORY FILTER */}
      <div className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Quản Lý Kho Đồ Uống & Tồn Kho Cơ Bản
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tự động đối soát: <strong className="text-slate-700 dark:text-slate-200">Tồn đầu + Nhập mới - Thực bán (Đã bán trừ Hoàn trả bia/món thừa) = Tồn cuối</strong> · Quy đổi Thùng/Két & Cảnh báo hết hàng
            </p>
          </div>

          {/* Date Selector Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedDate(todayBusinessStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                selectedDate === todayBusinessStr
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Hôm nay ({formatDateDMY(todayBusinessStr).slice(0, 5)})
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayBusinessStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                selectedDate === yesterdayBusinessStr
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Hôm qua ({formatDateDMY(yesterdayBusinessStr).slice(0, 5)})
            </button>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedDate(prevDateStr)}
                className="px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Ngày trước"
              >
                ←
              </button>
              <div className="flex items-center gap-1 px-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(nextDateStr)}
                className="px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Ngày kế tiếp"
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Multi-Category Selection + Display Checkboxes */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Danh mục theo dõi tồn kho (Chọn nhiều danh mục cùng lúc):</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectBeverageOnly}
                className="px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
              >
                Chỉ Bia & Nước ngọt
              </button>
              <button
                type="button"
                onClick={handleSelectAllCategories}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Chọn tất cả ({allCategories.length})
              </button>
            </div>
          </div>

          {/* Category toggle buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {allCategories.map((cat) => {
              const isSelected = selectedCategories.includes(cat);
              const itemCount = allInventoryRows.filter((r) => r.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleToggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  )}
                  <span>{cat}</span>
                  {isSelected && (
                    <span className="text-[10px] font-mono opacity-90">
                      ({itemCount})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Display Filter Checkboxes */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-medium">
                <input
                  type="checkbox"
                  checked={showPackConversion}
                  onChange={(e) => setShowPackConversion(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Quy đổi Thùng / Két (VD: 24 lon = 1 thùng)</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-medium">
                <input
                  type="checkbox"
                  checked={onlyActiveItems}
                  onChange={(e) => setOnlyActiveItems(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Chỉ hiện món có tồn / nhập / bán</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-medium">
                <input
                  type="checkbox"
                  checked={onlyAlertOrDiscrepancy}
                  onChange={(e) => setOnlyAlertOrDiscrepancy(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Chỉ hiện món Sắp hết hoặc Lệch kho</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-medium">
                <input
                  type="checkbox"
                  checked={groupByCategory}
                  onChange={(e) => setGroupByCategory(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Nhóm theo Danh mục</span>
              </label>
            </div>

            {groupByCategory && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    for (const c of selectedCategories) next[c] = true;
                    setCollapsedCats(next);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronsDownUp className="w-3 h-3" />
                  <span>Thu gọn danh mục</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsedCats({})}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronsUpDown className="w-3 h-3" />
                  <span>Mở rộng tất cả</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: 4 KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            1. Tổng Nguồn Trong Ngày (Đầu + Nhập)
          </div>
          <div className="mt-1 text-base sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatNumber(summaryStats.totalSupply)} đơn vị
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Tồn đầu: {formatNumber(summaryStats.totalOpening)} · Nhập mới: +{formatNumber(summaryStats.totalImported)}
          </div>
        </div>

        <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            2. Thực Xuất Bán (Đã bán - Khách trả)
          </div>
          <div className="mt-1 text-base sm:text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
            -{formatNumber(summaryStats.totalNetSold)} đơn vị
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Bán trên Bill: {formatNumber(summaryStats.totalGrossSold)} · Trả lại: {formatNumber(summaryStats.totalReturned)}
          </div>
        </div>

        <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            3. Tồn Cuối Sổ Sách (Lý thuyết)
          </div>
          <div className="mt-1 text-base sm:text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatNumber(summaryStats.totalExpectedClosing)} đơn vị
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Giá trị bán ước tính: {formatVND(summaryStats.totalRetailValue)}
          </div>
        </div>

        <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            4. Cảnh Báo Kho & Kiểm Thực Tế
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
            <span
              className={`text-base sm:text-2xl font-bold ${
                summaryStats.outOfStockCount + summaryStats.lowStockCount > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {summaryStats.outOfStockCount + summaryStats.lowStockCount} cần nhập
            </span>
            {summaryStats.discrepancyItemsCount > 0 && (
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                · {summaryStats.discrepancyItemsCount} lệch kho
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Đã kiểm đếm: {summaryStats.countedItemsCount}/{allInventoryRows.length} món
            {summaryStats.netDiscrepancyMoney !== 0 &&
              ` · Lệch: ${formatVND(summaryStats.netDiscrepancyMoney)}`}
          </div>
        </div>
      </div>

      {/* SECTION 3: QUICK INVENTORY ACTIONS BAR */}
      <div className="p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm nhanh Bia Tiger, Heineken, Sài Gòn, Redbull, Nước suối..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <>
              <button
                type="button"
                onClick={() => handleOpenImportModal()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>+ Nhập Kho Bia / Nước Ngọt</span>
              </button>

              <button
                type="button"
                onClick={handleCarryOverFromPrevDay}
                className="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                title={`Lấy Tồn cuối ngày ${formatDateDMY(prevDateStr)} làm Tồn đầu ngày ${formatDateDMY(selectedDate)}`}
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Kế thừa Tồn cuối hôm trước ({formatDateDMY(prevDateStr).slice(0, 5)})</span>
              </button>

              <button
                type="button"
                onClick={handleMatchAllActualToExpected}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                title="Điền nhanh cột Kiểm thực tế = Tồn cuối sổ sách cho tất cả món"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Khớp tất cả Thực tế = Sổ sách</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowZaloReportModal(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Báo cáo Kiểm kho Zalo</span>
          </button>
        </div>
      </div>

      {/* LOW STOCK / DISCREPANCY BANNER ALERT IF ANY */}
      {(summaryStats.outOfStockCount > 0 || summaryStats.lowStockCount > 0) && (
        <div className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">Cảnh báo tồn kho thấp cần gọi hàng: </span>
              <span>
                {allInventoryRows
                  .filter((r) => r.isOutOfStock || r.isLowStock)
                  .map(
                    (r) =>
                      `${r.productName} (còn ${r.expectedClosingStock} ${r.unit})`
                  )
                  .join(' · ')}
              </span>
            </div>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                const firstLow = allInventoryRows.find(
                  (r) => r.isOutOfStock || r.isLowStock
                );
                handleOpenImportModal(firstLow);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0 cursor-pointer self-start sm:self-auto"
            >
              + Nhập bổ sung ngay
            </button>
          )}
        </div>
      )}

      {/* SECTION 4: MAIN INVENTORY TABLE */}
      {filteredRows.length === 0 ? (
        <div className="p-8 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 text-center space-y-3">
          <Package className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Không có mặt hàng nào khớp với bộ lọc hiện tại
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Bạn có thể tắt bộ lọc &ldquo;Chỉ hiện món Sắp hết hoặc Lệch kho&rdquo; hoặc bấm thêm mặt hàng đồ uống mới vào kho.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOnlyActiveItems(false);
                setOnlyAlertOrDiscrepancy(false);
                setSearchQuery('');
              }}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Hiển thị tất cả mặt hàng
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={() => handleOpenImportModal()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                + Nhập Kho Đồ Uống Mới
              </button>
            )}
          </div>
        </div>
      ) : groupByCategory ? (
        <div className="space-y-4">
          {groupedByCategory.map(([categoryName, rows]) => {
            const isCollapsed = Boolean(collapsedCats[categoryName]);
            const catOpening = rows.reduce((s, r) => s + r.openingStock, 0);
            const catImported = rows.reduce((s, r) => s + r.importedQty, 0);
            const catGrossSold = rows.reduce((s, r) => s + r.grossSoldQty, 0);
            const catReturned = rows.reduce((s, r) => s + r.returnedQty, 0);
            const catNetSold = rows.reduce((s, r) => s + r.netSoldQty, 0);
            const catExpectedClosing = rows.reduce(
              (s, r) => s + r.expectedClosingStock,
              0
            );
            const catLowCount = rows.filter(
              (r) => r.isOutOfStock || r.isLowStock
            ).length;

            return (
              <div
                key={categoryName}
                className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs overflow-hidden"
              >
                {/* Category Header Bar */}
                <div
                  onClick={() =>
                    setCollapsedCats((prev) => ({
                      ...prev,
                      [categoryName]: !prev[categoryName],
                    }))
                  }
                  className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none hover:bg-slate-100/80 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${
                        isCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Kho {categoryName}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      · {rows.length} mặt hàng
                    </span>
                    {catLowCount > 0 && (
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        · {catLowCount} món sắp hết
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                    <span className="text-slate-600 dark:text-slate-300">
                      Tồn đầu: <strong>{formatNumber(catOpening)}</strong>
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +Nhập: <strong>+{formatNumber(catImported)}</strong>
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-blue-600 dark:text-blue-400">
                      Thực bán: <strong>-{formatNumber(catNetSold)}</strong>
                      {catReturned > 0 && ` (Bán ${catGrossSold}, Trả ${catReturned})`}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-900 dark:text-white font-bold">
                      Tồn cuối: {formatNumber(catExpectedClosing)}
                    </span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-left">
                          <th className="py-2.5 px-3 font-semibold min-w-[180px]">
                            Mặt hàng & Quy cách
                          </th>
                          <th className="py-2.5 px-2.5 font-semibold text-right min-w-[125px]">
                            1. Tồn đầu ca
                          </th>
                          <th className="py-2.5 px-2.5 font-semibold text-right min-w-[135px]">
                            2. Nhập thêm (+Nhập)
                          </th>
                          <th className="py-2.5 px-2.5 font-semibold text-right">
                            3. Đã bán (Bill)
                          </th>
                          <th className="py-2.5 px-2.5 font-semibold text-right">
                            4. Khách trả
                          </th>
                          <th className="py-2.5 px-2.5 font-semibold text-right">
                            5. Thực xuất
                          </th>
                          <th className="py-2.5 px-2.5 font-semibold text-right min-w-[90px]">
                            6. Vỡ / Nội bộ
                          </th>
                          <th className="py-2.5 px-3 font-semibold text-right min-w-[140px]">
                            7. Tồn cuối sổ sách
                          </th>
                          <th className="py-2.5 px-2.5 font-semibold text-right min-w-[130px]">
                            8. Kiểm thực tế
                          </th>
                          <th className="py-2.5 px-3 font-semibold text-right min-w-[130px]">
                            9. Đối soát / Cảnh báo
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {rows.map((row) => (
                          <InventoryTableRow
                            key={row.productKey}
                            row={row}
                            canWrite={canWrite}
                            showPackConversion={showPackConversion}
                            onUpdateField={handleUpdateDailyField}
                            onQuickAddPack={handleQuickAddPack}
                            onOpenImportModal={handleOpenImportModal}
                            onOpenConfigModal={(r) => {
                              setEditingConfigRow(r);
                              setCfgPackSize(String(r.packSize));
                              setCfgMinStock(String(r.minStockThreshold));
                              setCfgCostPrice(String(r.costPrice || 0));
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-left">
                  <th className="py-2.5 px-3 font-semibold min-w-[180px]">
                    Mặt hàng & Quy cách
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-right min-w-[125px]">
                    1. Tồn đầu ca
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-right min-w-[135px]">
                    2. Nhập thêm (+Nhập)
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">
                    3. Đã bán (Bill)
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">
                    4. Khách trả
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">
                    5. Thực xuất
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-right min-w-[90px]">
                    6. Vỡ / Nội bộ
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right min-w-[140px]">
                    7. Tồn cuối sổ sách
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-right min-w-[130px]">
                    8. Kiểm thực tế
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right min-w-[130px]">
                    9. Đối soát / Cảnh báo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredRows.map((row) => (
                  <InventoryTableRow
                    key={row.productKey}
                    row={row}
                    canWrite={canWrite}
                    showPackConversion={showPackConversion}
                    onUpdateField={handleUpdateDailyField}
                    onQuickAddPack={handleQuickAddPack}
                    onOpenImportModal={handleOpenImportModal}
                    onOpenConfigModal={(r) => {
                      setEditingConfigRow(r);
                      setCfgPackSize(String(r.packSize));
                      setCfgMinStock(String(r.minStockThreshold));
                      setCfgCostPrice(String(r.costPrice || 0));
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 5: IMPORT & ADJUSTMENT LOGS FOR SELECTED DATE */}
      <div id="inventory-audit-log-section" className="p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Nhật Ký Phiếu Nhập Kho & Biến Động Kho
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                {logsForSelectedDate.length} phiếu
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Lưu vết chi tiết các lần nhập hàng thủ công, qua Trợ lý Chat Web hoặc Telegram Bot (Xóa phiếu sẽ tự động hoàn tác số lượng)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowAllLogDates(false)}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  !showAllLogDates
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Ca {formatDateDMY(selectedDate)}
              </button>
              <button
                type="button"
                onClick={() => setShowAllLogDates(true)}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  showAllLogDates
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Toàn bộ lịch sử ({inventoryData.importLogs?.length || 0})
              </button>
            </div>

            {canWrite && (
              <button
                type="button"
                onClick={() => handleOpenImportModal()}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tạo Phiếu Nhập Kho</span>
              </button>
            )}
          </div>
        </div>

        {logsForSelectedDate.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            {showAllLogDates
              ? 'Chưa có phiếu nhập kho nào trong toàn bộ lịch sử.'
              : `Chưa có phiếu nhập kho hoặc xuất hủy nào được ghi nhận trong ngày ${formatDateDMY(selectedDate)}.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                  <th className="py-2 px-3 font-semibold">Thời gian</th>
                  <th className="py-2 px-3 font-semibold">Loại phiếu</th>
                  <th className="py-2 px-3 font-semibold">Mặt hàng</th>
                  <th className="py-2 px-3 font-semibold text-right">Số lượng</th>
                  <th className="py-2 px-3 font-semibold text-right">Tiền nhập</th>
                  <th className="py-2 px-3 font-semibold">Nguồn / Ghi chú</th>
                  <th className="py-2 px-3 font-semibold">Người nhập</th>
                  <th className="py-2 px-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono">
                {logsForSelectedDate.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {showAllLogDates ? (
                        <div>
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            {formatDateDMY(log.date)}
                          </div>
                          <div className="text-[10px]">
                            {new Date(log.createdAtMs).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      ) : (
                        new Date(log.createdAtMs).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-semibold whitespace-nowrap">
                      {log.type === 'import' ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          + Nhập kho
                        </span>
                      ) : log.type === 'damaged' ? (
                        <span className="text-rose-600 dark:text-rose-400">
                          - Vỡ / Nội bộ
                        </span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400">
                          + Tồn đầu
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-bold text-slate-900 dark:text-white">
                      {log.productName}{' '}
                      <span className="font-normal text-slate-500">
                        · {log.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {log.type === 'damaged' ? '-' : '+'}
                      {formatNumber(log.quantity)}
                      {log.packCount && log.packSize && log.packSize > 1
                        ? ` (${log.packCount} thùng)`
                        : ''}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {log.totalCost && log.totalCost > 0
                        ? formatVND(log.totalCost)
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                      {log.supplierOrNote?.includes('Telegram') ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold text-[10px] mr-1.5">
                          ✈️ Telegram Bot
                        </span>
                      ) : log.supplierOrNote?.includes('Chat') ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 font-bold text-[10px] mr-1.5">
                          💬 Chat Trợ Lý
                        </span>
                      ) : null}
                      <span>{log.supplierOrNote}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      @{log.createdBy}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {(canDelete || canWrite) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteImportLog(log)}
                          className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 font-sans text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Xóa</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: QUICK STOCK IMPORT / ADJUSTMENT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Lập Phiếu Nhập Kho Đồ Uống / Điều Chỉnh Kho ({formatDateDMY(selectedDate)})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitImportModal} className="p-5 space-y-4 text-xs">
              {/* Type Selector */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setImportType('import')}
                  className={`py-2 px-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                    importType === 'import'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  + Nhập Hàng Thêm
                </button>
                <button
                  type="button"
                  onClick={() => setImportType('adjust_opening')}
                  className={`py-2 px-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                    importType === 'adjust_opening'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  + Cộng Tồn Đầu
                </button>
                <button
                  type="button"
                  onClick={() => setImportType('damaged')}
                  className={`py-2 px-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                    importType === 'damaged'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  - Báo Vỡ / Nội Bộ
                </button>
              </div>

              {/* Select Existing Beverage or Add New Beverage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Chọn mặt hàng đồ uống:
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsNewBeverageMode((v) => !v)}
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                  >
                    {isNewBeverageMode
                      ? '← Chọn từ danh sách có sẵn'
                      : '+ Thêm đồ uống mới vào Menu & Kho'}
                  </button>
                </div>

                {!isNewBeverageMode ? (
                  <select
                    value={importProductKey}
                    onChange={(e) => {
                      const nextKey = e.target.value;
                      setImportProductKey(nextKey);
                      const found = allInventoryRows.find(
                        (r) => r.productKey === nextKey
                      );
                      if (found) {
                        const packs = Math.max(0, Number(importPacks) || 0);
                        const loose = Math.max(0, Number(importLoose) || 0);
                        const qty = packs * found.packSize + loose;
                        setImportTotalCost(
                          found.costPrice ? String(qty * found.costPrice) : ''
                        );
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-900 dark:text-white"
                  >
                    {allInventoryRows.map((r) => (
                      <option key={r.productKey} value={r.productKey}>
                        [{r.category}] {r.productName} — Tồn hiện tại:{' '}
                        {r.expectedClosingStock} {r.unit} ({r.packSize} {r.unit}/thùng)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Tên đồ uống / mặt hàng mới:
                      </label>
                      <input
                        type="text"
                        value={newBevName}
                        onChange={(e) => setNewBevName(e.target.value)}
                        placeholder="VD: Bia Tiger Bạc Lon Cao, Nước Ngọt 7Up..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        required={isNewBeverageMode}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Danh mục:
                        </label>
                        <select
                          value={newBevCategory}
                          onChange={(e) => setNewBevCategory(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          {allCategories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Giá bán lẻ (VNĐ):
                        </label>
                        <input
                          type="number"
                          value={newBevUnitPrice}
                          onChange={(e) => setNewBevUnitPrice(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Đơn vị:
                        </label>
                        <input
                          type="text"
                          value={newBevUnit}
                          onChange={(e) => setNewBevUnit(e.target.value)}
                          placeholder="Lon / Chai"
                          className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity by Pack + Loose Units */}
              {(() => {
                const packSz = selectedImportRow?.packSize || 24;
                const unitLbl = isNewBeverageMode
                  ? newBevUnit || 'Lon'
                  : selectedImportRow?.unit || 'Lon';
                const packsNum = Math.max(0, Math.round(Number(importPacks) || 0));
                const looseNum = Math.max(0, Math.round(Number(importLoose) || 0));
                const totalCalculated = packsNum * packSz + looseNum;

                return (
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Số Thùng / Két ({packSz} {unitLbl}/thùng):
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={importPacks}
                            onChange={(e) => {
                              setImportPacks(e.target.value);
                              const p = Math.max(0, Number(e.target.value) || 0);
                              const q = p * packSz + looseNum;
                              if (selectedImportRow?.costPrice) {
                                setImportTotalCost(
                                  String(q * selectedImportRow.costPrice)
                                );
                              }
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-base text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          {[1, 2, 5, 10].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setImportPacks(String(preset));
                                const q = preset * packSz + looseNum;
                                if (selectedImportRow?.costPrice) {
                                  setImportTotalCost(
                                    String(q * selectedImportRow.costPrice)
                                  );
                                }
                              }}
                              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 text-[11px] font-mono font-semibold cursor-pointer"
                            >
                              {preset} thùng
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          + Cộng số lẻ ({unitLbl}):
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={importLoose}
                          onChange={(e) => {
                            setImportLoose(e.target.value);
                            const l = Math.max(0, Number(e.target.value) || 0);
                            const q = packsNum * packSz + l;
                            if (selectedImportRow?.costPrice) {
                              setImportTotalCost(
                                String(q * selectedImportRow.costPrice)
                              );
                            }
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-base text-slate-900 dark:text-white"
                        />
                        <div className="text-[11px] text-slate-500 mt-1.5">
                          Nếu chỉ nhập lẻ, để Số thùng = 0
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between font-mono">
                      <span className="text-slate-600 dark:text-slate-300 font-sans font-semibold">
                        Tổng số lượng quy đổi:
                      </span>
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {formatNumber(totalCalculated)} {unitLbl}{' '}
                        {packsNum > 0 && `(${packsNum} thùng${looseNum > 0 ? ` + ${looseNum} ${unitLbl}` : ''})`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Cost & Note (for Import) */}
              {importType === 'import' && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Tổng tiền nhập hàng (VNĐ - Tùy chọn):
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={importTotalCost}
                      onChange={(e) => setImportTotalCost(e.target.value)}
                      placeholder="VD: 792000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                    />
                  </div>

                  {onAddExpenseDeduction && Number(importTotalCost) > 0 && (
                    <label className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRecordExpense}
                        onChange={(e) => setAutoRecordExpense(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-emerald-600 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                        <strong>Tự động ghi vào Khoản trừ (Chi trong ngày):</strong> Tích chọn nếu thu ngân lấy tiền mặt tại quầy ({formatVND(Number(importTotalCost) || 0)}) trả ngay cho đại lý giao bia.
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú đại lý / Lý do:
                </label>
                <input
                  type="text"
                  value={importNote}
                  onChange={(e) => setImportNote(e.target.value)}
                  placeholder={
                    importType === 'import'
                      ? 'VD: Đại lý Bia Minh Phát giao ca sáng...'
                      : 'VD: Vỡ chai khi khui / Mời khách quen...'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  Lưu Phiếu Kho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ITEM PACK SIZE & THRESHOLD SETTINGS */}
      {editingConfigRow && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cài Đặt Quy Cách Kho: {editingConfigRow.productName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingConfigRow(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveItemConfig} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quy cách đóng thùng / két (Số {editingConfigRow.unit} / 1 thùng):
                </label>
                <input
                  type="number"
                  min={1}
                  value={cfgPackSize}
                  onChange={(e) => setCfgPackSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  {[24, 20, 12, 6, 50, 1].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setCfgPackSize(String(sz))}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-mono text-[11px] cursor-pointer"
                    >
                      {sz} {editingConfigRow.unit}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Định mức tồn tối thiểu (Báo sắp hết khi tồn &le; mức này):
                </label>
                <input
                  type="number"
                  min={0}
                  value={cfgMinStock}
                  onChange={(e) => setCfgMinStock(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Giá vốn nhập ước tính / 1 {editingConfigRow.unit} (VNĐ):
                </label>
                <input
                  type="number"
                  min={0}
                  value={cfgCostPrice}
                  onChange={(e) => setCfgCostPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Giá bán hiện tại trên Menu: {formatVND(editingConfigRow.unitPrice)} / {editingConfigRow.unit}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingConfigRow(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  Lưu Cài Đặt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ZALO INVENTORY REPORT COPY */}
      {showZaloReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Phiếu Báo Cáo Kiểm Kho Gửi Zalo ({formatDateDMY(selectedDate)})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowZaloReportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <textarea
                readOnly
                value={zaloReportText}
                rows={14}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Bấm Sao chép rồi dán trực tiếp vào nhóm Zalo Quản lý / Giao ca
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowZaloReportModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyZaloReport}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedZalo ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Đã Copy báo cáo!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Sao chép gửi Zalo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponent for each Inventory Table Row
interface InventoryTableRowProps {
  row: ComputedInventoryRow;
  canWrite: boolean;
  showPackConversion: boolean;
  onUpdateField: (
    row: ComputedInventoryRow,
    field: 'openingStock' | 'importedQty' | 'damagedQty' | 'actualClosingStock',
    value: number | null
  ) => void;
  onQuickAddPack: (
    row: ComputedInventoryRow,
    field: 'openingStock' | 'importedQty'
  ) => void;
  onOpenImportModal: (row: ComputedInventoryRow) => void;
  onOpenConfigModal: (row: ComputedInventoryRow) => void;
}

const InventoryTableRow: React.FC<InventoryTableRowProps> = ({
  row,
  canWrite,
  showPackConversion,
  onUpdateField,
  onQuickAddPack,
  onOpenImportModal,
  onOpenConfigModal,
}) => {
  return (
    <tr
      className={`transition-colors ${
        row.isOutOfStock
          ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70'
          : row.isLowStock
          ? 'bg-amber-50/30 dark:bg-amber-950/15 hover:bg-amber-50/60'
          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
      }`}
    >
      {/* Col 0: Product Name & Pack Info */}
      <td className="py-2.5 px-3">
        <div className="flex items-start justify-between gap-1.5">
          <div>
            <div className="font-bold text-slate-900 dark:text-white">
              {row.productName}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {formatVND(row.unitPrice)}/{row.unit}
              {row.packSize > 1 && ` · ${row.packSize} ${row.unit}/thùng`}
            </div>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => onOpenConfigModal(row)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              title="Cài đặt quy cách thùng & định mức báo sắp hết"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>

      {/* Col 1: Opening Stock */}
      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            min={0}
            disabled={!canWrite}
            value={row.openingStock}
            onChange={(e) =>
              onUpdateField(
                row,
                'openingStock',
                e.target.value === '' ? 0 : Number(e.target.value)
              )
            }
            className="w-16 px-2 py-1 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
          {canWrite && row.packSize > 1 && (
            <button
              type="button"
              onClick={() => onQuickAddPack(row, 'openingStock')}
              className="px-1.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              title={`Cộng nhanh +1 thùng (+${row.packSize} ${row.unit}) vào Tồn đầu`}
            >
              +{row.packSize}
            </button>
          )}
        </div>
        {showPackConversion && row.packSize > 1 && row.openingStock > 0 && (
          <div className="text-[10px] text-slate-400 mt-0.5">
            {formatPackBreakdown(row.openingStock, row.packSize, row.unit)}
          </div>
        )}
      </td>

      {/* Col 2: Imported Qty */}
      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            min={0}
            disabled={!canWrite}
            value={row.importedQty}
            onChange={(e) =>
              onUpdateField(
                row,
                'importedQty',
                e.target.value === '' ? 0 : Number(e.target.value)
              )
            }
            className="w-16 px-2 py-1 text-right rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/30 font-bold text-emerald-700 dark:text-emerald-300 focus:outline-none focus:border-emerald-500"
          />
          {canWrite && row.packSize > 1 && (
            <button
              type="button"
              onClick={() => onQuickAddPack(row, 'importedQty')}
              className="px-1.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer"
              title={`Nhập nhanh +1 thùng (+${row.packSize} ${row.unit})`}
            >
              +1T
            </button>
          )}
        </div>
        {showPackConversion && row.packSize > 1 && row.importedQty > 0 && (
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
            +{formatPackBreakdown(row.importedQty, row.packSize, row.unit)}
          </div>
        )}
      </td>

      {/* Col 3: Gross Sold from Bills */}
      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
        {row.grossSoldQty > 0 ? formatNumber(row.grossSoldQty) : '0'}
      </td>

      {/* Col 4: Returned Qty */}
      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
        {row.returnedQty > 0 ? (
          <span className="font-semibold text-purple-600 dark:text-purple-400">
            +{formatNumber(row.returnedQty)}
          </span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>

      {/* Col 5: Net Sold (Gross Sold - Returned) */}
      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
        <span
          className={`font-bold ${
            row.netSoldQty > 0
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-400'
          }`}
        >
          {row.netSoldQty > 0 ? `-${formatNumber(row.netSoldQty)}` : '0'}
        </span>
      </td>

      {/* Col 6: Damaged / Internal */}
      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
        <input
          type="number"
          min={0}
          disabled={!canWrite}
          value={row.damagedQty}
          onChange={(e) =>
            onUpdateField(
              row,
              'damagedQty',
              e.target.value === '' ? 0 : Number(e.target.value)
            )
          }
          className="w-14 px-2 py-1 text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400 font-semibold focus:outline-none focus:border-rose-500"
        />
      </td>

      {/* Col 7: Expected Closing Stock */}
      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
        <div
          className={`text-sm font-extrabold ${
            row.expectedClosingStock <= 0
              ? 'text-rose-600 dark:text-rose-400'
              : row.isLowStock
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {formatNumber(row.expectedClosingStock)} {row.unit}
        </div>
        {showPackConversion && row.packSize > 1 && (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {formatPackBreakdown(row.expectedClosingStock, row.packSize, row.unit)}
          </div>
        )}
      </td>

      {/* Col 8: Actual Counted Closing Stock */}
      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            min={0}
            disabled={!canWrite}
            placeholder="Đếm..."
            value={row.actualClosingStock === null ? '' : row.actualClosingStock}
            onChange={(e) =>
              onUpdateField(
                row,
                'actualClosingStock',
                e.target.value === '' ? null : Number(e.target.value)
              )
            }
            className="w-16 px-2 py-1 text-right rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
          {canWrite && (
            <button
              type="button"
              onClick={() =>
                onUpdateField(
                  row,
                  'actualClosingStock',
                  Math.max(0, row.expectedClosingStock)
                )
              }
              className="px-1.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer"
              title="Điền bằng Tồn sổ sách (Khớp kho)"
            >
              =
            </button>
          )}
        </div>
      </td>

      {/* Col 9: Discrepancy & Stock Status */}
      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
        <div className="space-y-0.5">
          {row.discrepancy === null ? (
            <div className="text-[11px] font-sans text-slate-400">Chưa kiểm đếm</div>
          ) : row.discrepancy === 0 ? (
            <div className="text-[11px] font-sans font-bold text-emerald-600 dark:text-emerald-400">
              ✓ Khớp kho (0)
            </div>
          ) : row.discrepancy < 0 ? (
            <div>
              <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                Thiếu {row.discrepancy} {row.unit}
              </div>
              <div className="text-[10px] text-rose-500">
                ({formatVND(row.discrepancyValue)})
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                Thừa +{row.discrepancy} {row.unit}
              </div>
              <div className="text-[10px] text-blue-500">
                (+{formatVND(row.discrepancyValue)})
              </div>
            </div>
          )}

          {row.isOutOfStock ? (
            <div className="text-[10px] font-sans font-bold text-rose-600 dark:text-rose-400">
              Hết hàng · Cần nhập
            </div>
          ) : row.isLowStock ? (
            <div className="text-[10px] font-sans font-semibold text-amber-600 dark:text-amber-400">
              Sắp hết (&le; {row.minStockThreshold})
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
};
